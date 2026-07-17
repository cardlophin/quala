"""Formula generator: computes a field from other fields via safe eval."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext
from synthetic_generation.utils import SafeExpressionEvaluator


class FormulaGenerator(BaseGenerator):
    """Computes a value from other row_context fields using a restricted
    expression engine (no unrestricted eval).

    Config keys:
        expression (str): e.g. "unit_price * quantity" or
            "'VIP' if total_spent > 1000 else 'REGULAR'".
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._expression = self.config.get("expression")
        if not self._expression:
            raise ValueError("formula generator requires config['expression']")
        self._evaluator = SafeExpressionEvaluator()

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        return self._evaluator.evaluate(self._expression, row_context)  # type: ignore
