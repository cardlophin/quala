"""Explicit constraint definitions and validation logic.

Constraints are declared per field in the plan and validated after
generation completes for a table. Each constraint class declares the
scope it operates at: field (single value), row, or table (all rows).
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from synthetic_generation.models import ConstraintSpec
from synthetic_generation.utils import SafeExpressionEvaluator


@dataclass
class ValidationIssue:
    """A single constraint violation found during validation."""

    table: str
    constraint_type: str
    message: str
    row_index: int | None = None
    field_name: str | None = None


@dataclass
class ValidationReport:
    """Aggregated validation results for one or more tables."""

    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return len(self.issues) == 0

    def add(self, issue: ValidationIssue) -> None:
        self.issues.append(issue)

    def merge(self, other: "ValidationReport") -> None:
        self.issues.extend(other.issues)


class BaseConstraint(ABC):
    """Interface for all constraint validators."""

    scope: str = "field"

    def __init__(self, spec: ConstraintSpec, table_name: str, field_name: str | None):
        self.spec = spec
        self.table_name = table_name
        self.field_name = field_name
        self.config = spec.config

    @abstractmethod
    def validate_table(
        self, rows: list[dict[str, Any]], context: dict[str, Any]
    ) -> list[ValidationIssue]:
        """Validate this constraint against the full generated table."""
        raise NotImplementedError


class NotNullConstraint(BaseConstraint):
    scope = "field"

    def validate_table(self, rows, context):
        issues = []
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            if row.get(self.field_name) is None:
                issues.append(
                    ValidationIssue(
                        self.table_name, "not_null", "value is null", i, self.field_name
                    )
                )
        return issues


class UniqueConstraint(BaseConstraint):
    scope = "table"

    def validate_table(self, rows, context):
        issues = []
        seen: dict[Any, int] = {}
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            value = row.get(self.field_name)
            if value in seen:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "unique",
                        f"duplicate value {value!r} (first seen at row {seen[value]})",
                        i,
                        self.field_name,
                    )
                )
            else:
                seen[value] = i
        return issues


class RegexConstraint(BaseConstraint):
    scope = "field"

    def validate_table(self, rows, context):
        pattern = re.compile(self.config["pattern"])
        issues = []
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            value = row.get(self.field_name)
            if value is None:
                continue
            if not pattern.match(str(value)):
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "regex",
                        f"value {value!r} does not match {pattern.pattern!r}",
                        i,
                        self.field_name,
                    )
                )
        return issues


class AllowedValuesConstraint(BaseConstraint):
    scope = "field"

    def validate_table(self, rows, context):
        allowed = set(self.config["values"])
        issues = []
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            value = row.get(self.field_name)
            if value is None:
                continue
            if value not in allowed:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "allowed_values",
                        f"value {value!r} not in {sorted(allowed)}",
                        i,
                        self.field_name,
                    )
                )
        return issues


class MinMaxConstraint(BaseConstraint):
    scope = "field"

    def validate_table(self, rows, context):
        minimum = self.config.get("min")
        maximum = self.config.get("max")
        issues = []
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            value = row.get(self.field_name)
            if value is None:
                continue
            if minimum is not None and value < minimum:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "min_max",
                        f"value {value!r} < min {minimum!r}",
                        i,
                        self.field_name,
                    )
                )
            if maximum is not None and value > maximum:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "min_max",
                        f"value {value!r} > max {maximum!r}",
                        i,
                        self.field_name,
                    )
                )
        return issues


class StartBeforeEndConstraint(BaseConstraint):
    scope = "row"

    def validate_table(self, rows, context):
        start_field = self.config["start_field"]
        end_field = self.config["end_field"]
        issues = []
        for i, row in enumerate(rows):
            start = row.get(start_field)
            end = row.get(end_field)
            if start is None or end is None:
                continue
            if start > end:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "start_before_end",
                        f"{start_field}={start!r} is after {end_field}={end!r}",
                        i,
                    )
                )
        return issues


class FormulaMatchConstraint(BaseConstraint):
    scope = "row"

    def validate_table(self, rows, context):
        expression = self.config["expression"]
        target_field = self.config.get("target_field", self.field_name)
        evaluator = SafeExpressionEvaluator()
        issues = []
        for i, row in enumerate(rows):
            expected = evaluator.evaluate(expression, row)
            actual = row.get(target_field)
            if actual != expected:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "formula_match",
                        f"{target_field}={actual!r} does not match formula result {expected!r}",
                        i,
                        target_field,
                    )
                )
        return issues


class ForeignKeyExistsConstraint(BaseConstraint):
    scope = "table"

    def validate_table(self, rows, context):
        parent_table = self.config["parent_table"]
        parent_field = self.config["parent_field"]
        all_tables: dict[str, list[dict[str, Any]]] = context.get("all_tables", {})
        parent_rows = all_tables.get(parent_table, [])
        valid_values = {r.get(parent_field) for r in parent_rows}
        issues = []
        for i, row in enumerate(rows):
            if not self.field_name:
                continue
            value = row.get(self.field_name)
            if value is None:
                continue
            if value not in valid_values:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "foreign_key_exists",
                        f"value {value!r} not found in {parent_table}.{parent_field}",
                        i,
                        self.field_name,
                    )
                )
        return issues


class CompositeUniquenessConstraint(BaseConstraint):
    scope = "table"

    def validate_table(self, rows, context):
        fields_ = self.config["fields"]
        seen: dict[tuple, int] = {}
        issues = []
        for i, row in enumerate(rows):
            key = tuple(row.get(f) for f in fields_)
            if key in seen:
                issues.append(
                    ValidationIssue(
                        self.table_name,
                        "composite_uniqueness",
                        f"duplicate composite key {key!r} (first seen at row {seen[key]})",
                        i,
                    )
                )
            else:
                seen[key] = i
        return issues


CONSTRAINT_CLASSES: dict[str, type[BaseConstraint]] = {
    "not_null": NotNullConstraint,
    "unique": UniqueConstraint,
    "regex": RegexConstraint,
    "allowed_values": AllowedValuesConstraint,
    "min_max": MinMaxConstraint,
    "start_before_end": StartBeforeEndConstraint,
    "formula_match": FormulaMatchConstraint,
    "foreign_key_exists": ForeignKeyExistsConstraint,
    "composite_uniqueness": CompositeUniquenessConstraint,
}


def build_constraint(
    spec: ConstraintSpec, table_name: str, field_name: str | None
) -> BaseConstraint:
    """Instantiate the concrete constraint class for a given spec."""
    cls = CONSTRAINT_CLASSES.get(spec.type)
    if cls is None:
        raise ValueError(f"Unknown constraint type: {spec.type!r}")
    return cls(spec, table_name, field_name)
