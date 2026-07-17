"""Runner: orchestrates deterministic execution of a GenerationPlan."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from synthetic_generation.catalogs import CatalogRegistry
from synthetic_generation.constraints import ValidationReport, build_constraint
from synthetic_generation.edge_cases import EdgeCaseEngine, MutationResult
from synthetic_generation.generators.base import GenerationContext
from synthetic_generation.models import FieldSpec, GenerationPlan, TableSpec
from synthetic_generation.registry import GeneratorRegistry


@dataclass
class RunMetadata:
    """Metadata describing a completed run, for traceability."""

    seed: int
    locale: str
    tables_generated: list[str] = field(default_factory=list)
    row_counts: dict[str, int] = field(default_factory=dict)
    edge_cases_generated: list[str] = field(default_factory=list)


@dataclass
class RunResult:
    """Structured output of a full runner execution."""

    valid_tables: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    invalid_tables: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    validation_report: ValidationReport = field(default_factory=ValidationReport)
    metadata: RunMetadata | None = None


class Runner:
    """Executes a GenerationPlan deterministically end to end.

    Responsibilities: seeding, table ordering/dependency resolution,
    incremental row-context building, post-processing, constraint
    validation, and optional edge-case dataset generation.
    """

    def __init__(
        self, plan: GenerationPlan, registry: GeneratorRegistry | None = None
    ) -> None:
        self.plan = plan
        self.registry = registry or GeneratorRegistry()
        self.catalog_registry = CatalogRegistry(plan.catalogs)
        self.edge_case_engine = EdgeCaseEngine()
        self._tables_by_name: dict[str, TableSpec] = {t.name: t for t in plan.tables}

    def run(self) -> RunResult:
        """Run the full pipeline and return a structured RunResult."""
        random.seed(self.plan.runner.seed)
        tables_so_far: dict[str, list[dict[str, Any]]] = {}

        for table_name in self.plan.runner.execution_order:
            table_spec = self._tables_by_name[table_name]
            rows = self._generate_table(table_spec, tables_so_far)
            rows = self._apply_post_processing(table_spec, rows)
            tables_so_far[table_name] = rows

        validation_report = self._validate_all(tables_so_far)

        invalid_tables: dict[str, list[dict[str, Any]]] = {}
        edge_case_names: list[str] = []
        if self.plan.edge_cases.enabled:
            invalid_tables, edge_case_names = self._generate_edge_cases(tables_so_far)

        metadata = RunMetadata(
            seed=self.plan.runner.seed,
            locale=self.plan.runner.locale,
            tables_generated=list(tables_so_far.keys()),
            row_counts={name: len(rows) for name, rows in tables_so_far.items()},
            edge_cases_generated=edge_case_names,
        )

        return RunResult(
            valid_tables=tables_so_far,
            invalid_tables=invalid_tables,
            validation_report=validation_report,
            metadata=metadata,
        )

    def _generate_table(
        self, table_spec: TableSpec, tables_so_far: dict[str, list[dict[str, Any]]]
    ) -> list[dict[str, Any]]:
        """Generate all rows for a single table, field by field, row by row."""
        table_seed = self._derive_seed(table_spec.name)
        context = GenerationContext(
            seed=table_seed,
            locale=self.plan.runner.locale,
            catalog_registry=self.catalog_registry,
            tables_so_far=tables_so_far,
        )

        field_generators = {
            field_spec.name: self.registry.create(field_spec.generator, context)
            for field_spec in table_spec.fields
        }

        rows: list[dict[str, Any]] = []
        for row_index in range(table_spec.row_count):
            row: dict[str, Any] = {}
            table_context = {
                "table_name": table_spec.name,
                "row_index": row_index,
                "total_rows": table_spec.row_count,
            }
            for field_spec in table_spec.fields:
                value = self._generate_field_value(
                    field_spec, field_generators[field_spec.name], row, table_context
                )
                row[field_spec.name] = value
            rows.append(self._strip_internal_keys(row))
        return rows

    def _generate_field_value(
        self,
        field_spec: FieldSpec,
        generator: Any,
        row: dict[str, Any],
        table_context: dict[str, Any],
    ) -> Any:
        """Generate a single field's value, honoring the nullable flag."""
        value = generator.generate(row, table_context)
        if value is None and not field_spec.nullable:
            return value
        return value

    _INTERNAL_KEY_PREFIXES = ("__linked__", "__fk_row__")

    @classmethod
    def _strip_internal_keys(cls, row: dict[str, Any]) -> dict[str, Any]:
        """Remove internal bookkeeping keys (e.g. __linked__*, __fk_row__*)
        before output. These are used by generators to pass state between
        sibling fields within the same row (e.g. linked_fields' shared
        catalog draw, foreign_key's stashed parent row for
        parent_field_ref) and must never leak into the final dataset."""
        return {
            k: v
            for k, v in row.items()
            if not k.startswith(cls._INTERNAL_KEY_PREFIXES)
        }

    def _derive_seed(self, salt: str) -> int:
        """Derive a deterministic per-table seed from the global seed."""
        combined = f"{self.plan.runner.seed}:{salt}"
        return abs(hash(combined)) % (2**31 - 1)

    def _apply_post_processing(
        self, table_spec: TableSpec, rows: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Apply configured post-processing steps to a generated table.

        Supported step: {"type": "sort", "table": <name>, "by": <field>}.
        Unrecognized steps or steps targeting other tables are skipped.
        """
        for step in self.plan.runner.post_processing:
            if step.get("table") not in (None, table_spec.name):
                continue
            if step.get("type") == "sort":
                key_field = step.get("by")
                if key_field:
                    rows = sorted(
                        rows,
                        key=lambda r: (
                            r.get(key_field) is None,  # type: ignore
                            r.get(key_field),  # type: ignore
                        ),
                    )
        return rows

    def _validate_all(
        self, tables_so_far: dict[str, list[dict[str, Any]]]
    ) -> ValidationReport:
        """Run all declared field/table constraints across generated tables."""
        report = ValidationReport()
        context = {"all_tables": tables_so_far}

        for table_spec in self.plan.tables:
            rows = tables_so_far.get(table_spec.name, [])
            for field_spec in table_spec.fields:
                for constraint_spec in field_spec.constraints:
                    constraint = build_constraint(
                        constraint_spec, table_spec.name, field_spec.name
                    )
                    report.issues.extend(constraint.validate_table(rows, context))
        return report

    def _generate_edge_cases(
        self, valid_tables: dict[str, list[dict[str, Any]]]
    ) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
        """Produce invalid/edge-case table variants per configured mutation case."""
        rng = random.Random(self.plan.runner.seed)
        invalid_tables: dict[str, list[dict[str, Any]]] = {}
        case_names: list[str] = []

        for case in self.plan.edge_cases.cases:
            result: MutationResult = self.edge_case_engine.apply_case(
                case, valid_tables, rng
            )
            key = f"{result.table_name}::{result.case_name}"
            invalid_tables[key] = result.rows
            case_names.append(result.case_name)

        return invalid_tables, case_names
