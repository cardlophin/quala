"""Small shared utilities: RNG management, string transforms, safe eval."""

from __future__ import annotations

import ast
import operator
import random
import re
import unicodedata
from typing import Any, Callable


def make_rng(seed: int, salt: str = "") -> random.Random:
    """Create a deterministic Random instance derived from seed + salt."""
    combined = f"{seed}:{salt}"
    return random.Random(combined)


def strip_accents(value: str) -> str:
    """Remove diacritics from a string, e.g. 'Óscar' -> 'Oscar'."""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def remove_spaces(value: str) -> str:
    """Remove all whitespace from a string."""
    return re.sub(r"\s+", "", value)


TRANSFORMS: dict[str, Callable[[str], str]] = {
    "lowercase": str.lower,
    "uppercase": str.upper,
    "strip_accents": strip_accents,
    "remove_spaces": remove_spaces,
}


def apply_transforms(value: str, transform_names: list[str]) -> str:
    """Apply a sequence of named string transforms in order."""
    result = value
    for name in transform_names:
        transform = TRANSFORMS.get(name)
        if transform is None:
            raise ValueError(f"Unknown transform: {name!r}")
        result = transform(result)
    return result


_ALLOWED_BINOPS: dict[type, Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_ALLOWED_UNARYOPS: dict[type, Callable[[Any], Any]] = {
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_ALLOWED_COMPARE: dict[type, Callable[[Any, Any], Any]] = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}

_ALLOWED_FUNCS: dict[str, Callable[..., Any]] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "len": len,
    "str": str,
    "int": int,
    "float": float,
}


class SafeExpressionError(ValueError):
    """Raised when a formula expression uses disallowed syntax."""


class SafeExpressionEvaluator:
    """A tiny restricted expression engine for the `formula` generator.

    Supports arithmetic, comparisons, boolean and/or/not, ternary
    expressions, a whitelist of builtin functions, and variable lookups
    from a provided context. No attribute access, subscripting, imports,
    or arbitrary function calls are permitted.
    """

    def evaluate(self, expression: str, variables: dict[str, Any]) -> Any:
        """Parse and evaluate `expression` against `variables` safely."""
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc:
            raise SafeExpressionError(f"Invalid expression syntax: {exc}") from exc
        return self._eval_node(tree.body, variables)

    def _eval_node(self, node: ast.AST, variables: dict[str, Any]) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float, str, bool)) or node.value is None:
                return node.value
            raise SafeExpressionError(f"Unsupported constant: {node.value!r}")
        if isinstance(node, ast.Name):
            if node.id in variables:
                return variables[node.id]
            raise SafeExpressionError(f"Unknown variable: {node.id!r}")
        if isinstance(node, ast.BinOp):
            op_func = _ALLOWED_BINOPS.get(type(node.op))
            if op_func is None:
                raise SafeExpressionError(f"Operator not allowed: {node.op!r}")
            left = self._eval_node(node.left, variables)
            right = self._eval_node(node.right, variables)
            return op_func(left, right)
        if isinstance(node, ast.UnaryOp):
            op_func = _ALLOWED_UNARYOPS.get(type(node.op))
            if op_func is None:
                raise SafeExpressionError(f"Unary operator not allowed: {node.op!r}")
            return op_func(self._eval_node(node.operand, variables))
        if isinstance(node, ast.BoolOp):
            values = [self._eval_node(v, variables) for v in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
            raise SafeExpressionError("Unsupported boolean operator")
        if isinstance(node, ast.Compare):
            left = self._eval_node(node.left, variables)
            result = True
            for op, comparator in zip(node.ops, node.comparators):
                op_func = _ALLOWED_COMPARE.get(type(op))
                if op_func is None:
                    raise SafeExpressionError(f"Comparison not allowed: {op!r}")
                right = self._eval_node(comparator, variables)
                result = result and op_func(left, right)
                left = right
            return result
        if isinstance(node, ast.IfExp):
            condition = self._eval_node(node.test, variables)
            branch = node.body if condition else node.orelse
            return self._eval_node(branch, variables)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise SafeExpressionError("Only whitelisted function calls allowed")
            func = _ALLOWED_FUNCS.get(node.func.id)
            if func is None:
                raise SafeExpressionError(f"Function not allowed: {node.func.id!r}")
            args = [self._eval_node(a, variables) for a in node.args]
            return func(*args)
        raise SafeExpressionError(f"Unsupported syntax node: {type(node).__name__}")
