"""Date range generator: dates/datetimes between bounds or relative offsets."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from dateutil import parser as dateutil_parser

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class DateRangeGenerator(BaseGenerator):
    """Generates a date or datetime, either between fixed bounds or as an
    offset relative to another already-generated field.

    Config keys:
        start (str, optional): ISO date/datetime lower bound.
        end (str, optional): ISO date/datetime upper bound.
        start_field (str, optional): name of a row_context field to offset from.
        min_offset_days (int, optional): minimum offset from start_field.
        max_offset_days (int, optional): maximum offset from start_field.
        as_type (str, optional): "date" (default) or "datetime".
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._as_type = self.config.get("as_type", "date")
        self._start = self.config.get("start")
        self._end = self.config.get("end")
        self._start_field = self.config.get("start_field")
        self._min_offset = self.config.get("min_offset_days", 0)
        self._max_offset = self.config.get("max_offset_days", 0)

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        if self._start_field:
            base_value = row_context.get(self._start_field)
            if base_value is None:
                raise ValueError(
                    f"date_range generator: start_field {self._start_field!r} "
                    "not found or is None in row_context"
                )
            if isinstance(base_value, str):
                base_dt = dateutil_parser.parse(base_value)
            elif isinstance(base_value, datetime):
                base_dt = base_value
            elif isinstance(base_value, date):
                base_dt = datetime.combine(base_value, datetime.min.time())
            else:
                raise ValueError(
                    f"Unsupported start_field value type: {type(base_value)}"
                )
            offset_days = self.rng.randint(self._min_offset, self._max_offset)
            result_dt = base_dt + timedelta(days=offset_days)
        else:
            if self._start is None or self._end is None:
                raise ValueError(
                    "date_range generator requires either start_field or both start/end"
                )
            start_dt = dateutil_parser.parse(self._start)
            end_dt = dateutil_parser.parse(self._end)
            delta_seconds = int((end_dt - start_dt).total_seconds())
            offset_seconds = self.rng.randint(0, max(delta_seconds, 0))
            result_dt = start_dt + timedelta(seconds=offset_seconds)

        if self._as_type == "datetime":
            return result_dt.isoformat()
        return result_dt.date().isoformat()
