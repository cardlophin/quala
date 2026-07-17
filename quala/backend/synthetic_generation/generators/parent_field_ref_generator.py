"""Parent field ref generator: reads an already-generated field from the
exact parent row a `foreign_key` field already linked in this same row.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from dateutil import parser as dateutil_parser

from synthetic_generation.generators.base import BaseGenerator, GenerationContext

_VALID_MODES = {"copy", "date_offset", "numeric_offset"}


class ParentFieldRefGenerator(BaseGenerator):
    """Reads a field value from the specific parent row already linked via
    a `foreign_key` generator earlier in this same table's field list.

    This is the structural fix for the engine's most costly limitation:
    row_context only ever contains fields of the current row/table, so
    cross-table business rules (e.g. "order_date must be on/after the
    customer's registration_date") previously had to fall back to an
    independent absolute range with no real guarantee. `foreign_key`
    already picks one parent row per generated row; this generator lets a
    sibling field read ANY other field already generated on that SAME
    parent row, instead of only the ID `foreign_key` copies.

    Determinism is preserved because the parent table always finishes
    generating (per `runner.execution_order`) before this table starts, so
    every field read here is a value that already exists, not a value
    computed concurrently.

    Requirements (fail loud, not silently repaired):
      - The parent table must appear before this table in
        `runner.execution_order`.
      - A `foreign_key` field with the SAME `parent_table` must appear
        earlier in this table's `fields` list, so the parent row is
        already stashed in row_context under `__fk_row__<parent_table>`.
        `GenerationPlan` validates this structurally at parse time; this
        generator also raises a clear runtime error if it is ever
        instantiated without that precondition holding (e.g. hand-built
        plans that bypass validation).

    Config keys:
        parent_table (str): name of the parent table. Must match the
            `parent_table` of a `foreign_key` field earlier in this table.
        parent_field (str): field to read off the linked parent row.
        mode (str, optional): "copy" (default), "date_offset", or
            "numeric_offset".
        min_days / max_days (int): used when mode == "date_offset"; adds a
            random number of days (can be negative) to the parent date
            value. Accepts ISO date/datetime strings, `date`, or
            `datetime` values on the parent field.
        as_type (str, optional): for mode == "date_offset", "date"
            (default) or "datetime" — controls the output format.
        min_delta / max_delta (int|float, optional): used when mode ==
            "numeric_offset"; adds a random delta to the parent numeric
            value.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._parent_table = self.config.get("parent_table")
        self._parent_field = self.config.get("parent_field")
        if not self._parent_table or not self._parent_field:
            raise ValueError(
                "parent_field_ref generator requires 'parent_table' and 'parent_field'"
            )

        self._mode = self.config.get("mode", "copy")
        if self._mode not in _VALID_MODES:
            raise ValueError(
                f"parent_field_ref 'mode' must be one of {sorted(_VALID_MODES)}, "
                f"got {self._mode!r}"
            )

        if self.context and self.context.tables_so_far:
            parent_rows = self.context.tables_so_far.get(self._parent_table)
            if not parent_rows:
                raise ValueError(
                    f"parent_field_ref: parent table {self._parent_table!r} has not "
                    "been generated yet. Check runner.execution_order."
                )
            if self._parent_field not in parent_rows[0]:
                raise ValueError(
                    f"parent_field_ref: field {self._parent_field!r} not found on "
                    f"table {self._parent_table!r}"
                )

        self._as_type = self.config.get("as_type", "date")
        self._min_days = self.config.get("min_days", 0)
        self._max_days = self.config.get("max_days", 0)
        self._min_delta = self.config.get("min_delta", 0)
        self._max_delta = self.config.get("max_delta", 0)

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        link_key = f"__fk_row__{self._parent_table}"
        parent_row = row_context.get(link_key)
        if parent_row is None:
            raise ValueError(
                f"parent_field_ref: no linked parent row found for table "
                f"{self._parent_table!r} in this row. A 'foreign_key' field with "
                f"parent_table={self._parent_table!r} must appear earlier in this "
                "table's 'fields' list so the parent row is stashed before this "
                "field runs."
            )

        value = parent_row.get(self._parent_field)
        if value is None:
            return None

        if self._mode == "copy":
            return value
        if self._mode == "date_offset":
            return self._apply_date_offset(value)
        return self._apply_numeric_offset(value)

    def _apply_date_offset(self, value: Any) -> Any:
        if isinstance(value, datetime):
            base_dt = value
        elif isinstance(value, date):
            base_dt = datetime.combine(value, datetime.min.time())
        elif isinstance(value, str):
            base_dt = dateutil_parser.parse(value)
        else:
            raise ValueError(
                f"parent_field_ref: unsupported parent field value type for "
                f"date_offset: {type(value)}"
            )

        lo, hi = sorted((self._min_days, self._max_days))
        offset_days = self.rng.randint(lo, hi)
        result_dt = base_dt + timedelta(days=offset_days)

        if self._as_type == "datetime":
            return result_dt.isoformat()
        return result_dt.date().isoformat()

    def _apply_numeric_offset(self, value: Any) -> Any:
        if not isinstance(value, (int, float)):
            raise ValueError(
                f"parent_field_ref: unsupported parent field value type for "
                f"numeric_offset: {type(value)}"
            )
        lo, hi = sorted((self._min_delta, self._max_delta))
        delta = self.rng.uniform(lo, hi) if isinstance(lo, float) or isinstance(
            hi, float
        ) else self.rng.randint(lo, hi)
        return value + delta
