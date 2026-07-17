"""Typed models for the generation plan JSON contract.

These Pydantic models define the strict contract between a planning LLM
(which emits JSON) and the deterministic parser/runner that consumes it.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class GeneratorType(str, Enum):
    """All supported generator family identifiers."""

    FAKER = "faker"
    TEMPLATE = "template"
    SEQUENCE = "sequence"
    ENUM = "enum"
    NUMERIC_RANGE = "numeric_range"
    DATE_RANGE = "date_range"
    LINKED_FIELDS = "linked_fields"
    FORMULA = "formula"
    FOREIGN_KEY = "foreign_key"
    PARENT_FIELD_REF = "parent_field_ref"
    STATIC_CATALOG = "static_catalog"
    UUID = "uuid"
    BOOLEAN_PROBABILITY = "boolean_probability"
    NULLABILITY = "nullability"


class GeneratorSpec(BaseModel):
    """Describes which generator to instantiate and its configuration."""

    type: GeneratorType
    config: dict[str, Any] = Field(default_factory=dict)


class ConstraintSpec(BaseModel):
    """A single explicit constraint attached to a field or table."""

    type: str
    config: dict[str, Any] = Field(default_factory=dict)
    scope: str = Field(default="field", description="field | row | table")

    @field_validator("scope")
    @classmethod
    def _validate_scope(cls, v: str) -> str:
        allowed = {"field", "row", "table"}
        if v not in allowed:
            raise ValueError(f"scope must be one of {allowed}, got {v!r}")
        return v


class FieldSpec(BaseModel):
    """Describes a single field/column to generate within a table."""

    name: str
    logical_type: str = "string"
    nullable: bool = False
    generator: GeneratorSpec
    constraints: list[ConstraintSpec] = Field(default_factory=list)


class TableSpec(BaseModel):
    """Describes a single table and how many rows to produce."""

    name: str
    description: str = ""
    row_count: int = Field(default=10, ge=0)
    fields: list[FieldSpec] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)

    @field_validator("fields")
    @classmethod
    def _unique_field_names(cls, fields: list[FieldSpec]) -> list[FieldSpec]:
        names = [f.name for f in fields]
        if len(names) != len(set(names)):
            raise ValueError("field names must be unique within a table")
        return fields


class CatalogEntry(BaseModel):
    """A single row of a static catalog, kept flexible via extra fields."""

    model_config = {"extra": "allow"}


class Catalog(BaseModel):
    """A named list of reusable static rows (e.g. country/city pairs)."""

    name: str
    description: str = ""
    entries: list[dict[str, Any]] = Field(default_factory=list)


class BatchingSpec(BaseModel):
    """Controls how rows are chunked during generation."""

    enabled: bool = False
    batch_size: int = Field(default=1000, gt=0)


class OutputModesSpec(BaseModel):
    """Controls what output formats/artifacts the runner should produce."""

    formats: list[str] = Field(default_factory=lambda: ["json"])
    include_invalid: bool = True


class RunnerSpec(BaseModel):
    """Global execution configuration for the runner."""

    seed: int = 42
    locale: str = "en_US"
    execution_order: list[str] = Field(default_factory=list)
    output_modes: OutputModesSpec = Field(default_factory=OutputModesSpec)
    batching: BatchingSpec = Field(default_factory=BatchingSpec)
    post_processing: list[dict[str, Any]] = Field(default_factory=list)
    validation_checks: list[str] = Field(default_factory=list)


class EdgeCaseMutationSpec(BaseModel):
    """Describes a single mutation to apply for edge-case generation."""

    name: str
    type: str
    target_table: str
    target_field: Optional[str] = None
    probability: float = Field(default=1.0, ge=0.0, le=1.0)
    config: dict[str, Any] = Field(default_factory=dict)


class EdgeCasesSpec(BaseModel):
    """Top-level edge-case generation configuration."""

    enabled: bool = False
    cases: list[EdgeCaseMutationSpec] = Field(default_factory=list)


class InputSummary(BaseModel):
    """A human/LLM-authored summary of what the plan was built for."""

    domain: Optional[str] = None
    description: Optional[str] = None
    notes: list[str] = Field(default_factory=list)


class GenerationPlan(BaseModel):
    """The root object parsed from the planning LLM's JSON output."""

    version: str = "1.0"
    needs_clarification: bool = False
    clarifications: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    input_summary: InputSummary = Field(default_factory=InputSummary)
    catalogs: list[Catalog] = Field(default_factory=list)
    tables: list[TableSpec] = Field(default_factory=list)
    runner: RunnerSpec = Field(default_factory=RunnerSpec)
    edge_cases: EdgeCasesSpec = Field(default_factory=EdgeCasesSpec)

    @model_validator(mode="after")
    def _validate_execution_order(self) -> "GenerationPlan":
        table_names = {t.name for t in self.tables}
        if self.runner.execution_order:
            missing = set(self.runner.execution_order) - table_names
            if missing:
                raise ValueError(
                    f"execution_order references unknown tables: {missing}"
                )
        else:
            self.runner.execution_order = [t.name for t in self.tables]
        return self

    @model_validator(mode="after")
    def _validate_unique_table_names(self) -> "GenerationPlan":
        names = [t.name for t in self.tables]
        if len(names) != len(set(names)):
            raise ValueError("table names must be unique across the plan")
        return self

    @model_validator(mode="after")
    def _validate_parent_field_ref(self) -> "GenerationPlan":
        """Fail loud (no silent repair) if a `parent_field_ref` field is
        structurally impossible for the engine to resolve: the runtime
        precondition is that a `foreign_key` field pointing at the same
        `parent_table` already ran earlier in this table's field list, the
        parent table is declared as a dependency, and it runs first."""
        table_names = {t.name for t in self.tables}
        order_index = {name: i for i, name in enumerate(self.runner.execution_order)}

        for table in self.tables:
            fk_parent_tables_seen: set[str] = set()
            for field in table.fields:
                if field.generator.type == GeneratorType.FOREIGN_KEY:
                    parent_table = field.generator.config.get("parent_table")
                    if parent_table:
                        fk_parent_tables_seen.add(parent_table)
                    continue

                if field.generator.type != GeneratorType.PARENT_FIELD_REF:
                    continue

                cfg = field.generator.config
                parent_table = cfg.get("parent_table")
                parent_field = cfg.get("parent_field")
                if not parent_table or not parent_field:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: "
                        "parent_field_ref requires 'parent_table' and 'parent_field' "
                        "in config"
                    )
                if parent_table not in table_names:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: "
                        f"parent_field_ref references unknown table {parent_table!r}"
                    )
                if parent_table not in fk_parent_tables_seen:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: parent_field_ref "
                        f"targets parent_table {parent_table!r}, but no 'foreign_key' "
                        f"field with parent_table={parent_table!r} appears earlier in "
                        f"{table.name!r}'s 'fields' list. Add one, or reorder fields, "
                        "so the parent row is linked before this field runs."
                    )
                if parent_table not in table.depends_on:
                    raise ValueError(
                        f"Table {table.name!r}: parent_field_ref on field "
                        f"{field.name!r} requires {parent_table!r} in this table's "
                        "'depends_on'"
                    )
                if (
                    parent_table in order_index
                    and table.name in order_index
                    and order_index[parent_table] >= order_index[table.name]
                ):
                    raise ValueError(
                        f"runner.execution_order must place {parent_table!r} before "
                        f"{table.name!r} because of the parent_field_ref on field "
                        f"{field.name!r}"
                    )
        return self
