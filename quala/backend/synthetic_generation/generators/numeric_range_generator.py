"""Numeric range generator: integers or decimals within bounds."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class NumericRangeGenerator(BaseGenerator):
    """Generates a number within [min, max] using a chosen distribution.

    Config keys:
        min (float): lower bound (inclusive).
        max (float): upper bound (inclusive).
        as_type (str, optional): "int" or "float", default "int".
        distribution (str, optional): "uniform" (default) or "normal".
        mean (float, optional): mean for normal distribution (defaults to midpoint).
        std_dev (float, optional): std deviation for normal distribution.
        decimals (int, optional): rounding precision for float output.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        if "min" not in self.config or "max" not in self.config:
            raise ValueError("numeric_range generator requires 'min' and 'max'")
        self._min = self.config["min"]
        self._max = self.config["max"]
        self._as_type = self.config.get("as_type", "int")
        self._distribution = self.config.get("distribution", "uniform")
        self._decimals = self.config.get("decimals", 2)

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        if self._distribution == "normal":
            mean = self.config.get("mean", (self._min + self._max) / 2)
            std_dev = self.config.get("std_dev", (self._max - self._min) / 6 or 1.0)
            value = self.rng.gauss(mean, std_dev)
            value = max(self._min, min(self._max, value))
        else:
            if self._as_type == "int":
                value = self.rng.randint(int(self._min), int(self._max))
            else:
                value = self.rng.uniform(self._min, self._max)

        if self._as_type == "int":
            return int(round(value))
        return round(float(value), self._decimals)
