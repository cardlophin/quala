"""Generator registry: maps generator type strings to concrete classes."""

from __future__ import annotations

from synthetic_generation.generators.base import BaseGenerator, GenerationContext
from synthetic_generation.generators.boolean_probability_generator import (
    BooleanProbabilityGenerator,
)
from synthetic_generation.generators.date_range_generator import DateRangeGenerator
from synthetic_generation.generators.enum_generator import EnumGenerator
from synthetic_generation.generators.faker_generator import FakerGenerator
from synthetic_generation.generators.foreign_key_generator import ForeignKeyGenerator
from synthetic_generation.generators.formula_generator import FormulaGenerator
from synthetic_generation.generators.linked_fields_generator import (
    LinkedFieldsGenerator,
)
from synthetic_generation.generators.nullability_generator import (
    NullabilityGenerator,
)
from synthetic_generation.generators.numeric_range_generator import (
    NumericRangeGenerator,
)
from synthetic_generation.generators.parent_field_ref_generator import (
    ParentFieldRefGenerator,
)
from synthetic_generation.generators.sequence_generator import SequenceGenerator
from synthetic_generation.generators.static_catalog_generator import (
    StaticCatalogGenerator,
)
from synthetic_generation.generators.template_generator import TemplateGenerator
from synthetic_generation.generators.uuid_generator import UUIDGenerator
from synthetic_generation.models import GeneratorSpec


class GeneratorRegistry:
    """Registry mapping generator type identifiers to generator classes.

    Supports registering custom generator classes so the framework can
    be extended without modifying core code.
    """

    def __init__(self) -> None:
        self._registry: dict[str, type[BaseGenerator]] = {}
        self._register_builtins()

    def register(self, name: str, cls: type[BaseGenerator]) -> None:
        """Register a generator class under a type name, overriding if present."""
        if not issubclass(cls, BaseGenerator):
            raise TypeError(f"{cls!r} must subclass BaseGenerator")
        self._registry[name] = cls

    def create(self, spec: GeneratorSpec, context: GenerationContext) -> BaseGenerator:
        """Instantiate, seed, and set up a generator from its spec."""
        cls = self._registry.get(spec.type.value)
        if cls is None:
            raise ValueError(f"No generator registered for type: {spec.type.value!r}")
        instance = cls(spec.config)
        instance.reset(context.seed)
        instance.setup(context)
        return instance

    def _register_builtins(self) -> None:
        self.register("faker", FakerGenerator)
        self.register("template", TemplateGenerator)
        self.register("sequence", SequenceGenerator)
        self.register("enum", EnumGenerator)
        self.register("numeric_range", NumericRangeGenerator)
        self.register("date_range", DateRangeGenerator)
        self.register("linked_fields", LinkedFieldsGenerator)
        self.register("formula", FormulaGenerator)
        self.register("foreign_key", ForeignKeyGenerator)
        self.register("parent_field_ref", ParentFieldRefGenerator)
        self.register("static_catalog", StaticCatalogGenerator)
        self.register("uuid", UUIDGenerator)
        self.register("boolean_probability", BooleanProbabilityGenerator)
        self.register("nullability", NullabilityGenerator)
