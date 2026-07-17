"""Abstract base class defining the generator interface."""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from typing import Any


class GenerationContext:
    """Shared, read-only context passed to generators during setup/generate.

    Holds references to catalogs, already-generated tables, the runner
    seed/locale, and the current field/table metadata.
    """

    def __init__(
        self,
        seed: int,
        locale: str,
        catalog_registry: Any,
        tables_so_far: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self.seed = seed
        self.locale = locale
        self.catalog_registry = catalog_registry
        self.tables_so_far = tables_so_far if tables_so_far is not None else {}


class BaseGenerator(ABC):
    """Interface every concrete generator must implement.

    Lifecycle: `reset(seed)` -> `setup(context)` -> repeated `generate(...)`.
    """

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.rng: random.Random = random.Random()
        self.context: GenerationContext | None = None

    def reset(self, seed: int) -> None:
        """Reset internal RNG state deterministically for this seed."""
        self.rng = random.Random(seed)

    def setup(self, context: GenerationContext) -> None:
        """Perform one-time setup using shared generation context."""
        self.context = context

    @abstractmethod
    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        """Produce a single value for the current row.

        `row_context` contains already-generated field values for the
        current row. `table_context` contains metadata about the table
        being generated (name, row index, total rows).
        """
        raise NotImplementedError
