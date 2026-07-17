"""Template generator: renders strings from other fields with transforms."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext
from synthetic_generation.utils import apply_transforms


class TemplateGenerator(BaseGenerator):
    """Renders a Python format-string template from row context values.

    Config keys:
        template (str): e.g. "{first_name}.{last_name}@{domain}".
        transforms (list[str], optional): applied to the rendered string.
        uniqueness_strategy (str, optional): "numeric_suffix_on_collision".
        extra (dict, optional): static extra variables available to template.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._seen: set[str] = set()
        self._template = self.config.get("template", "")
        if not self._template:
            raise ValueError("template generator requires config['template']")
        self._transforms = self.config.get("transforms", [])
        self._uniqueness_strategy = self.config.get("uniqueness_strategy")
        self._extra = self.config.get("extra", {})

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        variables = {**self._extra, **row_context}
        rendered = self._template.format(**variables)
        if self._transforms:
            rendered = apply_transforms(rendered, self._transforms)
        if self._uniqueness_strategy == "numeric_suffix_on_collision":
            rendered = self._deduplicate(rendered)
        return rendered

    def _deduplicate(self, value: str) -> str:
        if value not in self._seen:
            self._seen.add(value)
            return value
        suffix = 1
        candidate = f"{value}{suffix}"
        while candidate in self._seen:
            suffix += 1
            candidate = f"{value}{suffix}"
        self._seen.add(candidate)
        return candidate
