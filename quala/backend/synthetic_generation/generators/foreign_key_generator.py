"""Foreign key generator: selects a value from an already-generated table."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class ForeignKeyGenerator(BaseGenerator):
    """Selects a field value from rows of a parent table already generated.

    As a side effect, it also stashes the FULL parent row it picked into
    `row_context["__fk_row__<parent_table>"]`. This lets a sibling field in
    the same table use the `parent_field_ref` generator to read any other
    already-generated field from that exact same parent row (not just the
    ID copied here), enabling real cross-table business rules such as
    "order_date >= customer.registration_date" without inventing
    "table.field" syntax. If more than one `foreign_key` field in this
    table points at the same `parent_table`, the last one to run wins that
    slot; `parent_field_ref` fields should appear after the specific
    `foreign_key` field they logically depend on.

    Config keys:
        parent_table (str): name of the parent table.
        parent_field (str): field within the parent table to reference.
        strategy (str, optional): "random" (default) or "round_robin".
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._parent_table = self.config.get("parent_table")
        self._parent_field = self.config.get("parent_field")
        if not self._parent_table or not self._parent_field:
            raise ValueError(
                "foreign_key generator requires 'parent_table' and 'parent_field'"
            )
        if self.context and self.context.tables_so_far:
            parent_rows = self.context.tables_so_far.get(self._parent_table)
            if not parent_rows:
                raise ValueError(
                    f"Parent table {self._parent_table!r} has not been generated yet. "
                    "Check execution_order in the runner spec."
                )
            if self._parent_field not in parent_rows[0]:
                raise ValueError(
                    f"Parent field {self._parent_field!r} not found on table "
                    f"{self._parent_table!r}"
                )
            self._parent_rows = parent_rows
            self._strategy = self.config.get("strategy", "random")
            self._rr_index = 0

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        if self._strategy == "round_robin":
            parent_row = self._parent_rows[self._rr_index % len(self._parent_rows)]
            self._rr_index += 1
        else:
            parent_row = self.rng.choice(self._parent_rows)
        row_context[f"__fk_row__{self._parent_table}"] = parent_row
        return parent_row[self._parent_field]  # type: ignore
