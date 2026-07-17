"""Boolean probability generator: weighted True/False sampling."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class BooleanProbabilityGenerator(BaseGenerator):
    """Generates a boolean using `true_probability`.

    Config keys:
        true_probability (float): probability of True, in [0, 1]. Default 0.5.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._true_probability = self.config.get("true_probability", 0.5)
        if not 0.0 <= self._true_probability <= 1.0:
            raise ValueError("true_probability must be within [0, 1]")

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        return self.rng.random() < self._true_probability
