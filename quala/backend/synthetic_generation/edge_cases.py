"""Edge-case mutation system: corrupts valid rows into invalid test cases."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Callable

from synthetic_generation.models import EdgeCaseMutationSpec


@dataclass
class MutationResult:
    """A single mutated table plus metadata about what was changed."""

    case_name: str
    table_name: str
    rows: list[dict[str, Any]]
    mutated_row_indices: list[int] = field(default_factory=list)


class MutationRegistry:
    """Registry of named mutation functions used for edge-case generation."""

    def __init__(self) -> None:
        self._mutations: dict[str, Callable[..., Any]] = {}
        self._register_builtins()

    def register(self, name: str, func: Callable[..., Any]) -> None:
        self._mutations[name] = func

    def get(self, name: str) -> Callable[..., Any]:
        if name not in self._mutations:
            raise ValueError(f"Unknown mutation type: {name!r}")
        return self._mutations[name]

    def _register_builtins(self) -> None:
        self.register("set_null", mutate_set_null)
        self.register("replace_domain", mutate_replace_domain)
        self.register("break_linked_fields", mutate_break_linked_fields)
        self.register("duplicate_value", mutate_duplicate_value)
        self.register("out_of_range", mutate_out_of_range)
        self.register("regex_break", mutate_regex_break)


def mutate_set_null(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Force a field to None, violating not_null constraints."""
    row[field_name] = None


def mutate_replace_domain(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Replace an email/domain-like value with an invalid domain."""
    bad_domain = config.get("bad_domain", "invalid-domain-!!.com")
    value = row.get(field_name)
    if isinstance(value, str) and "@" in value:
        local_part = value.split("@")[0]
        row[field_name] = f"{local_part}@{bad_domain}"
    else:
        row[field_name] = bad_domain


def mutate_break_linked_fields(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Replace a linked field's value with an unrelated literal, breaking correlation."""
    replacement = config.get("replacement", "___BROKEN_LINK___")
    row[field_name] = replacement


def mutate_duplicate_value(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Force a field to a fixed duplicate value, useful for uniqueness tests."""
    row[field_name] = config.get("duplicate_value", "DUPLICATE")


def mutate_out_of_range(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Push a numeric field outside its declared bounds."""
    current = row.get(field_name)
    delta = config.get("delta", 1000)
    if isinstance(current, (int, float)):
        direction = rng.choice([-1, 1])
        row[field_name] = current + direction * abs(delta)
    else:
        row[field_name] = config.get("fallback_value", 999999)


def mutate_regex_break(
    row: dict[str, Any], field_name: str, config: dict, rng: random.Random
) -> None:
    """Inject characters that break a documented regex pattern."""
    injection = config.get("injection", "###INVALID###")
    current = row.get(field_name)
    row[field_name] = f"{current}{injection}" if current is not None else injection


class EdgeCaseEngine:
    """Applies configured mutations to valid rows to produce invalid datasets."""

    def __init__(self, mutation_registry: MutationRegistry | None = None) -> None:
        self.mutation_registry = mutation_registry or MutationRegistry()

    def apply_case(
        self,
        case: EdgeCaseMutationSpec,
        valid_tables: dict[str, list[dict[str, Any]]],
        rng: random.Random,
    ) -> MutationResult:
        """Apply a single edge-case mutation spec to a copy of its target table."""
        source_rows = valid_tables.get(case.target_table, [])
        mutated_rows = [dict(row) for row in source_rows]
        mutation_func = self.mutation_registry.get(case.type)
        mutated_indices: list[int] = []

        for i, row in enumerate(mutated_rows):
            if rng.random() <= case.probability:
                mutation_func(row, case.target_field, case.config, rng)
                mutated_indices.append(i)

        return MutationResult(
            case_name=case.name,
            table_name=case.target_table,
            rows=mutated_rows,
            mutated_row_indices=mutated_indices,
        )
