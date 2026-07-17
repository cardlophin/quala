"""Faker-backed generator: wraps a Faker provider method."""

from __future__ import annotations

from typing import Any

from faker import Faker

from synthetic_generation.generators.base import BaseGenerator, GenerationContext


class FakerGenerator(BaseGenerator):
    """Generates values using a Faker provider method.

    Config keys:
        provider (str): Faker method name, e.g. "name", "email", "city".
        locale (str, optional): overrides the runner-level locale.
        args (list, optional): positional args for the provider method.
        kwargs (dict, optional): keyword args for the provider method.
    """

    def setup(self, context: GenerationContext) -> None:
        super().setup(context)
        locale = self.config.get("locale", context.locale)
        self._faker = Faker(locale)
        self._faker.seed_instance(self.rng.randint(0, 2**31 - 1))
        provider = self.config.get("provider")
        if not provider:
            raise ValueError("faker generator requires config['provider']")
        if not hasattr(self._faker, provider):
            raise ValueError(f"Faker has no provider method named {provider!r}")
        self._provider_name = provider

    def generate(
        self, row_context: dict[str, Any], table_context: dict[str, Any]
    ) -> Any:
        method = getattr(self._faker, self._provider_name)
        args = self.config.get("args", [])
        kwargs = self.config.get("kwargs", {})
        return method(*args, **kwargs)
