"""Static catalog generator: samples a value from a named catalog."""

from __future__ import annotations

from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class StaticCatalogGenerator(BaseGenerator):
    """Samples a single key's value from a named catalog's entries.

    Config keys:
        catalog (str): name of the catalog to sample from.
        key (str, optional): key to extract; if omitted, returns full entry dict.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._catalog_name = self.config.get("catalog")
        if not self._catalog_name:
            raise ValueError("static_catalog generator requires config['catalog']")
        self._key = self.config.get("key")
        if self.context and self.context.catalog_registry:
            self._entries = self.context.catalog_registry.entries(self._catalog_name)
            if not self._entries:
                raise ValueError(f"Catalog {self._catalog_name!r} has no entries")

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        entry = self.rng.choice(self._entries)
        if self._key:
            return entry.get(self._key)
        return entry
