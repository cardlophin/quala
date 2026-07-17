"""Linked fields generator: correlated multi-field values from a catalog."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class LinkedFieldsGenerator(BaseGenerator):
    """Generates a group of correlated fields together (e.g. country+city).

    Draws one entry from a named catalog and exposes a chosen key from
    that entry as this field's value, while stashing the full entry in
    row_context under `__linked__<catalog_name>` so sibling fields
    (also using linked_fields with the same catalog) reuse the same draw.

    Config keys:
        catalog (str): name of the catalog to sample from.
        key (str): which key of the catalog entry to expose as this field's value.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._catalog_name = self.config.get("catalog")
        self._key = self.config.get("key")
        if not self._catalog_name or not self._key:
            raise ValueError("linked_fields generator requires 'catalog' and 'key'")
        if self.context and self.context.catalog_registry:
            self._entries = self.context.catalog_registry.entries(self._catalog_name)
            if not self._entries:
                raise ValueError(f"Catalog {self._catalog_name!r} has no entries")

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        link_key = f"__linked__{self._catalog_name}"
        entry = row_context.get(link_key)
        if entry is None:
            entry = self.rng.choice(self._entries)
            row_context[link_key] = entry
        return entry.get(self._key)
