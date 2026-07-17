"""Catalog storage and lookup helpers.

Catalogs are named lists of static rows declared in the plan (e.g. a
country/city pairing table) that `static_catalog` and `linked_fields`
generators sample from.
"""

from __future__ import annotations

from typing import Any

from synthetic_generation.models import Catalog


class CatalogRegistry:
    """Holds parsed catalogs and exposes lookup-by-name access."""

    def __init__(self, catalogs: list[Catalog] | None = None) -> None:
        self._catalogs: dict[str, Catalog] = {}
        for catalog in catalogs or []:
            self.add(catalog)

    def add(self, catalog: Catalog) -> None:
        """Register a catalog, keyed by its unique name."""
        if catalog.name in self._catalogs:
            raise ValueError(f"Duplicate catalog name: {catalog.name!r}")
        self._catalogs[catalog.name] = catalog

    def get(self, name: str) -> Catalog:
        """Fetch a catalog by name, raising if it doesn't exist."""
        if name not in self._catalogs:
            raise KeyError(f"Unknown catalog: {name!r}")
        return self._catalogs[name]

    def entries(self, name: str) -> list[dict[str, Any]]:
        """Return the raw entry dicts for a named catalog."""
        return self.get(name).entries

    def __contains__(self, name: str) -> bool:
        return name in self._catalogs
