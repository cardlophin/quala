"""Deterministic parsing of raw JSON dicts into a validated GenerationPlan."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from synthetic_generation.models import GenerationPlan


class PlanParseError(ValueError):
    """Raised when a generation plan JSON fails schema validation."""


def parse_plan(raw: dict[str, Any]) -> GenerationPlan:
    """Validate and convert a raw dict into a typed GenerationPlan."""
    try:
        return GenerationPlan.model_validate(raw)
    except ValidationError as exc:
        raise PlanParseError(f"Invalid generation plan: {exc}") from exc


def parse_plan_from_json_string(json_string: str) -> GenerationPlan:
    """Parse a GenerationPlan from a raw JSON string."""
    try:
        raw = json.loads(json_string)
    except json.JSONDecodeError as exc:
        raise PlanParseError(f"Invalid JSON: {exc}") from exc
    return parse_plan(raw)


def parse_plan_from_file(path: str | Path) -> GenerationPlan:
    """Parse a GenerationPlan from a JSON file on disk."""
    content = Path(path).read_text(encoding="utf-8")
    return parse_plan_from_json_string(content)
