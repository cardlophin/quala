"""UUID generator: deterministic-per-seed UUID strings."""

from __future__ import annotations

import uuid
from typing import Any

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class UUIDGenerator(BaseGenerator):
    """Generates UUID strings.

    Config keys:
        version (int, optional): 4 (default, random) is supported directly;
            other versions fall back to uuid4 with a note that determinism
            relies on the generator's seeded RNG feeding random bytes.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        self._version = self.config.get("version", 4)

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        random_bytes = bytes(self.rng.getrandbits(8) for _ in range(16))
        generated = uuid.UUID(bytes=random_bytes, version=4)
        return str(generated)
