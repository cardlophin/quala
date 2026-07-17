"""Sequence generator: produces sequential/incrementing values."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class SequenceGenerator(BaseGenerator):
    """Generates sequential values with optional prefix/padding.

    Config keys:
        prefix (str, optional): prepended string, e.g. "USR-".
        start (int, optional): starting value, default 1.
        step (int, optional): increment step, default 1.
        padding (int, optional): zero-pad width for the numeric part.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._prefix = self.config.get("prefix", "")
        self._start = self.config.get("start", 1)
        self._step = self.config.get("step", 1)
        self._padding = self.config.get("padding", 0)
        self._current = self._start

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        value = self._current
        self._current += self._step
        number_str = str(value).zfill(self._padding) if self._padding else str(value)
        return f"{self._prefix}{number_str}"
