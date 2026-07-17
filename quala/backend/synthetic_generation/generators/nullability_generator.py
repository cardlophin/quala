"""Nullability generator: wraps another field/value with a null chance."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class NullabilityGenerator(BaseGenerator):
    """Applies a null probability on top of a source field or literal.

    Config keys:
        null_probability (float): chance of returning None, in [0, 1].
        source_field (str, optional): row_context field to pass through
            when not nulled.
        source_value (Any, optional): static literal to pass through when
            `source_field` is not provided.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._null_probability = self.config.get("null_probability", 0.1)
        if not 0.0 <= self._null_probability <= 1.0:
            raise ValueError("null_probability must be within [0, 1]")
        self._source_field = self.config.get("source_field")
        self._source_value = self.config.get("source_value")

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        if self.rng.random() < self._null_probability:
            return None
        if self._source_field:
            return row_context.get(self._source_field)
        return self._source_value
