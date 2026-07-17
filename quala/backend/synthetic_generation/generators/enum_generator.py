"""Enum generator: samples from a fixed list, optionally weighted."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class EnumGenerator(BaseGenerator):
    """Samples a value from `values`, optionally using `weights`.

    Config keys:
        values (list): candidate values.
        weights (list[float], optional): parallel weights for `values`.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._values = self.config.get("values", [])
        if not self._values:
            raise ValueError("enum generator requires non-empty config['values']")
        self._weights = self.config.get("weights")
        if self._weights and len(self._weights) != len(self._values):
            raise ValueError("weights length must match values length")

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        if self._weights:
            return self.rng.choices(self._values, weights=self._weights, k=1)[0]
        return self.rng.choice(self._values)
