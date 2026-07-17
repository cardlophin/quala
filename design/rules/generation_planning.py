import os
import re
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import yaml
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)


class GeneratorType(str, Enum):
    FAKER = "faker"
    TEMPLATE = "template"
    SEQUENCE = "sequence"
    ENUM = "enum"
    NUMERIC_RANGE = "numeric_range"
    DATE_RANGE = "date_range"
    LINKED_FIELDS = "linked_fields"
    FORMULA = "formula"
    FOREIGN_KEY = "foreign_key"
    PARENT_FIELD_REF = "parent_field_ref"
    STATIC_CATALOG = "static_catalog"
    UUID = "uuid"
    BOOLEAN_PROBABILITY = "boolean_probability"
    NULLABILITY = "nullability"


class GeneratorSpec(BaseModel):
    type: GeneratorType
    config: dict[str, Any] = Field(default_factory=dict)


class ConstraintSpec(BaseModel):
    type: str
    config: dict[str, Any] = Field(default_factory=dict)
    scope: str = Field(default="field")

    @field_validator("scope")
    @classmethod
    def _validate_scope(cls, v: str) -> str:
        allowed = {"field", "row", "table"}
        if v not in allowed:
            raise ValueError(f"scope must be one of {allowed}, got {v!r}")
        return v


class FieldSpec(BaseModel):
    name: str
    logical_type: str = "string"
    nullable: bool = False
    generator: GeneratorSpec
    constraints: list[ConstraintSpec] = Field(default_factory=list)


class TableSpec(BaseModel):
    name: str
    description: str = ""
    row_count: int = Field(default=10, ge=0)
    fields: list[FieldSpec] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)

    @field_validator("fields")
    @classmethod
    def _unique_field_names(cls, fields: list[FieldSpec]) -> list[FieldSpec]:
        names = [f.name for f in fields]
        if len(names) != len(set(names)):
            raise ValueError("field names must be unique within a table")
        return fields


class Catalog(BaseModel):
    name: str
    description: str = ""
    entries: list[dict[str, Any]] = Field(default_factory=list)


class BatchingSpec(BaseModel):
    enabled: bool = False
    batch_size: int = Field(default=1000, gt=0)


class OutputModesSpec(BaseModel):
    formats: list[str] = Field(default_factory=lambda: ["json"])
    include_invalid: bool = True


class RunnerSpec(BaseModel):
    seed: int = 42
    locale: str = "en_US"
    execution_order: list[str] = Field(default_factory=list)
    output_modes: OutputModesSpec = Field(default_factory=OutputModesSpec)
    batching: BatchingSpec = Field(default_factory=BatchingSpec)
    post_processing: list[dict[str, Any]] = Field(default_factory=list)
    validation_checks: list[str] = Field(default_factory=list)


class EdgeCaseMutationSpec(BaseModel):
    name: str
    type: str
    target_table: str
    target_field: Optional[str] = None
    probability: float = Field(default=1.0, ge=0.0, le=1.0)
    config: dict[str, Any] = Field(default_factory=dict)


class EdgeCasesSpec(BaseModel):
    enabled: bool = False
    cases: list[EdgeCaseMutationSpec] = Field(default_factory=list)


class InputSummary(BaseModel):
    domain: Optional[str] = None
    description: Optional[str] = None
    notes: list[str] = Field(default_factory=list)


class GenerationPlan(BaseModel):
    version: str = "1.0"
    needs_clarification: bool = False
    clarifications: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    input_summary: InputSummary = Field(default_factory=InputSummary)
    catalogs: list[Catalog] = Field(default_factory=list)
    tables: list[TableSpec] = Field(default_factory=list)
    runner: RunnerSpec = Field(default_factory=RunnerSpec)
    edge_cases: EdgeCasesSpec = Field(default_factory=EdgeCasesSpec)

    @model_validator(mode="after")
    def _validate_execution_order(self) -> "GenerationPlan":
        table_names = {t.name for t in self.tables}
        if self.runner.execution_order:
            missing = set(self.runner.execution_order) - table_names
            if missing:
                raise ValueError(
                    f"execution_order references unknown tables: {missing}"
                )
        else:
            self.runner.execution_order = [t.name for t in self.tables]
        return self

    @model_validator(mode="after")
    def _validate_unique_table_names(self) -> "GenerationPlan":
        names = [t.name for t in self.tables]
        if len(names) != len(set(names)):
            raise ValueError("table names must be unique across the plan")
        return self

    @model_validator(mode="after")
    def _validate_parent_field_ref(self) -> "GenerationPlan":
        """Mirrors quala/backend/synthetic_generation/models.py: fail loud
        if a parent_field_ref field can't be resolved by the engine (no
        preceding foreign_key to the same parent_table in this table's
        field list, missing depends_on, or wrong execution_order)."""
        table_names = {t.name for t in self.tables}
        order_index = {name: i for i, name in enumerate(self.runner.execution_order)}

        for table in self.tables:
            fk_parent_tables_seen: set[str] = set()
            for field in table.fields:
                if field.generator.type == GeneratorType.FOREIGN_KEY:
                    parent_table = field.generator.config.get("parent_table")
                    if parent_table:
                        fk_parent_tables_seen.add(parent_table)
                    continue

                if field.generator.type != GeneratorType.PARENT_FIELD_REF:
                    continue

                cfg = field.generator.config
                parent_table = cfg.get("parent_table")
                parent_field = cfg.get("parent_field")
                if not parent_table or not parent_field:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: "
                        "parent_field_ref requires 'parent_table' and 'parent_field' "
                        "in config"
                    )
                if parent_table not in table_names:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: "
                        f"parent_field_ref references unknown table {parent_table!r}"
                    )
                if parent_table not in fk_parent_tables_seen:
                    raise ValueError(
                        f"Table {table.name!r} field {field.name!r}: parent_field_ref "
                        f"targets parent_table {parent_table!r}, but no 'foreign_key' "
                        f"field with parent_table={parent_table!r} appears earlier in "
                        f"{table.name!r}'s 'fields' list. Add one, or reorder fields, "
                        "so the parent row is linked before this field runs."
                    )
                if parent_table not in table.depends_on:
                    raise ValueError(
                        f"Table {table.name!r}: parent_field_ref on field "
                        f"{field.name!r} requires {parent_table!r} in this table's "
                        "'depends_on'"
                    )
                if (
                    parent_table in order_index
                    and table.name in order_index
                    and order_index[parent_table] >= order_index[table.name]
                ):
                    raise ValueError(
                        f"runner.execution_order must place {parent_table!r} before "
                        f"{table.name!r} because of the parent_field_ref on field "
                        f"{field.name!r}"
                    )
        return self


_ = load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-3-pro-preview")

client = genai.Client(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT_PATH = str(Path(__file__).resolve().parent / "generation_system_prompt.txt")

YAML_SNAPSHOT_PATH = "generated_plan.yaml"
JSON_OUTPUT_PATH = "generated_plan.json"


def load_system_prompt(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


USER_PROMPT = """
Necesito generar un dataset sintetico para un e-commerce de moda con las siguientes
reglas de negocio:

1. Existen dos tablas relacionadas: "customers" (clientes) y "orders" (pedidos).
2. "customers" debe tener 30 filas, con: customer_id (identificador unico secuencial
   con prefijo "CUST-"), nombre completo (nombre y apellido realistas), email
   (derivado de nombre y apellido, unico, con dominio "fashionshop.com"), pais y
   ciudad correlacionados (Espana-Madrid, Espana-Barcelona, Francia-Paris,
   Italia-Milan, Portugal-Lisboa), y fecha de registro entre 2021-01-01 y
   2026-07-01.
3. "orders" debe tener 150 filas, dependiente de "customers":
   - order_id: UUID unico.
   - customer_id: referencia valida a un cliente existente en "customers".
   - order_date: fecha entre la fecha de registro del cliente y 2026-07-01
     (siempre posterior o igual al registro del cliente, nunca anterior).
   - shipped_date: opcional (30% de probabilidad de ser nula, representando
     pedidos aun no enviados), pero cuando existe SIEMPRE debe ser entre 1 y 10
     dias despues de order_date, nunca antes ni el mismo dia.
   - unit_price: numero decimal entre 15.00 y 250.00.
   - quantity: entero entre 1 y 5.
   - total_amount: debe ser exactamente unit_price * quantity, sin excepciones.
   - status: uno de "pending", "shipped", "delivered", "cancelled", con
     probabilidades realistas (delivered debe ser el mas frecuente, cancelled
     el menos frecuente).
4. Quiero tambien un conjunto de datos de casos limite para testing de validaciones,
   incluyendo: pedidos con total_amount incorrecto respecto a la formula, pedidos
   con email de cliente roto/con dominio invalido, y pedidos con shipped_date
   fuera de rango (anterior a order_date).
5. Todo en locale es_ES, con una semilla fija para que el dataset sea reproducible
   entre ejecuciones.
""".strip()


def extract_yaml_block(raw_text: str) -> str:
    """Strip markdown fences (yaml/json/plain) and stray prose, keeping only
    the YAML document. Also normalizes an accidental JSON response into
    YAML text so the parser downstream always receives YAML."""
    text = raw_text.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines.startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    lines = text.splitlines()
    start_idx = next(
        (i for i, line in enumerate(lines) if line.strip().startswith("version:")),
        0,
    )
    lines = lines[start_idx:]
    cleaned_lines = [line for line in lines if not line.strip().startswith("#")]
    text = "\n".join(cleaned_lines).strip()

    if text.startswith("{") or text.startswith("["):
        import json

        try:
            parsed_json = json.loads(text)
            text = yaml.dump(parsed_json, allow_unicode=True, sort_keys=False)
        except (json.JSONDecodeError, yaml.YAMLError):
            pass

    return text


def sanitize_yaml_text(text: str) -> str:
    """Fix the generic LLM mistake of using stray double quotes as emphasis
    inside a plain scalar (list item or key: value), which produces
    unparseable YAML. Purely syntactic, domain-agnostic."""
    fixed_lines = []
    line_pattern = re.compile(r"^(\s*-\s+|\s*[\w_]+:\s+)(.*)$")

    for line in text.splitlines():
        match = line_pattern.match(line)
        if not match:
            fixed_lines.append(line)
            continue

        prefix, rest = match.groups()
        rest_stripped = rest.rstrip()

        if not rest_stripped or rest_stripped in ("[]", "{}"):
            fixed_lines.append(line)
            continue

        is_cleanly_quoted = (
            rest_stripped.startswith('"')
            and rest_stripped.endswith('"')
            and rest_stripped.count('"') == 2
        )
        has_stray_quotes = '"' in rest_stripped and not is_cleanly_quoted

        if has_stray_quotes:
            content = rest_stripped.strip('"').replace('"', "'")
            fixed_lines.append(f'{prefix}"{content}"')
        else:
            fixed_lines.append(line)

    return "\n".join(fixed_lines)


def repair_catalog_entries(plan_dict: dict) -> dict:
    """Ensure every catalog entry is a dict, regardless of domain."""
    catalogs = plan_dict.get("catalogs") or []
    for catalog in catalogs:
        entries = catalog.get("entries") or []
        fixed_entries = []
        for entry in entries:
            if isinstance(entry, dict):
                fixed_entries.append(entry)
            else:
                fixed_entries.append({"value": entry})
        catalog["entries"] = fixed_entries
    return plan_dict


def repair_cross_reference_field_syntax(plan_dict: dict) -> dict:
    """Detect any generator config value using 'table.field' dotted syntax
    to reference another table's column (unsupported by the engine)."""
    tables = plan_dict.get("tables") or []
    table_names = {t.get("name") for t in tables}
    assumptions = plan_dict.setdefault("assumptions", [])

    for table in tables:
        for field in table.get("fields") or []:
            gen = field.get("generator") or {}
            cfg = gen.get("config") or {}
            for key in ("start_field", "source_field", "end_field"):
                ref = cfg.get(key)
                if isinstance(ref, str) and "." in ref:
                    prefix = ref.split(".", 1)
                    if prefix in table_names:
                        cfg.pop(key, None)
                        cfg.pop("min_offset_days", None)
                        cfg.pop("max_offset_days", None)
                        if gen.get("type") == "date_range":
                            cfg.setdefault("start", "1970-01-01")
                            cfg.setdefault("end", "2100-01-01")
                        gen["config"] = cfg
                        note = (
                            f"Referencia cross-table '{ref}' en el campo "
                            f"'{field.get('name')}' de la tabla '{table.get('name')}' "
                            "no es soportada por el motor y fue sustituida por "
                            "un valor independiente."
                        )
                        if note not in assumptions:
                            assumptions.append(note)
    return plan_dict


def repair_field_order(plan_dict: dict) -> dict:
    """Reorder fields so any field referenced via source_field/start_field
    appears before the field that consumes it (same table only). Also
    ensures a 'parent_field_ref' field is placed after the 'foreign_key'
    field (same table) whose parent_table it depends on, since that is
    what stashes the linked parent row into row_context."""
    for table in plan_dict.get("tables") or []:
        fields = table.get("fields") or []
        name_to_field = {f["name"]: f for f in fields}

        fk_field_by_parent_table: dict = {}
        for f in fields:
            gen = f.get("generator") or {}
            if gen.get("type") == "foreign_key":
                parent_table = (gen.get("config") or {}).get("parent_table")
                if parent_table and parent_table not in fk_field_by_parent_table:
                    fk_field_by_parent_table[parent_table] = f["name"]

        ordered: list = []
        placed: set = set()

        def deps_of(field: dict) -> list:
            gen = field.get("generator") or {}
            cfg = gen.get("config") or {}
            deps = []
            same_row_dep = cfg.get("source_field") or cfg.get("start_field")
            if same_row_dep in name_to_field:
                deps.append(same_row_dep)
            if gen.get("type") == "parent_field_ref":
                fk_dep = fk_field_by_parent_table.get(cfg.get("parent_table"))
                if fk_dep and fk_dep in name_to_field:
                    deps.append(fk_dep)
            return deps

        def place(field: dict) -> None:
            if field["name"] in placed:
                return
            for dep in deps_of(field):
                place(name_to_field[dep])
            if field["name"] not in placed:
                ordered.append(field)
                placed.add(field["name"])

        for f in fields:
            place(f)
        table["fields"] = ordered
    return plan_dict


def repair_nullable_not_null_conflict(plan_dict: dict) -> dict:
    """Remove not_null constraints from fields marked as nullable: true."""
    for table in plan_dict.get("tables") or []:
        for field in table.get("fields") or []:
            if field.get("nullable") is True:
                field["constraints"] = [
                    c
                    for c in field.get("constraints") or []
                    if c.get("type") != "not_null"
                ]
    return plan_dict


CONSTRAINT_CANONICAL_KEYS = {
    "allowed_values": "values",
    "min_max": None,
    "regex": "pattern",
    "formula_match": "expression",
    "foreign_key_exists": None,
    "composite_uniqueness": "fields",
    "start_before_end": None,
}


def repair_constraint_config_keys(plan_dict: dict) -> dict:
    """Fix the generic LLM mistake of using a constraint's own type name as
    its config key instead of the documented canonical key. Also normalizes
    'constraints' to always be a list, in case the model produced a bare
    string (structural safety net)."""
    for table in plan_dict.get("tables") or []:
        for field in table.get("fields") or []:
            constraints = field.get("constraints")
            if isinstance(constraints, str):
                field["constraints"] = [
                    {"type": constraints, "config": {}, "scope": "field"}
                ]
            elif constraints is None:
                field["constraints"] = []

            for constraint in field.get("constraints") or []:
                if not isinstance(constraint, dict):
                    continue
                ctype = constraint.get("type")
                canonical_key = CONSTRAINT_CANONICAL_KEYS.get(ctype)
                cfg = constraint.get("config") or {}
                if canonical_key and ctype in cfg and canonical_key not in cfg:
                    cfg[canonical_key] = cfg.pop(ctype)
                    constraint["config"] = cfg
    return plan_dict


def repair_edge_case_field_refs(plan_dict: dict) -> dict:
    """Drop 'range' values in edge_cases config that reference a field name
    of the target table instead of a literal value."""
    tables = {
        t["name"]: {f["name"] for f in t.get("fields") or []}
        for t in plan_dict.get("tables") or []
    }
    for case in (plan_dict.get("edge_cases") or {}).get("cases") or []:
        cfg = case.get("config") or {}
        rng = cfg.get("range")
        target_table = case.get("target_table")
        field_names = tables.get(target_table, set())
        if isinstance(rng, list):
            if any(isinstance(v, str) and v in field_names for v in rng):
                cfg.pop("range", None)
                cfg["offset_days"] = cfg.get("offset_days", -5)
    return plan_dict


def repair_missing_execution_order(plan_dict: dict) -> dict:
    """Fill runner.execution_order from tables[].depends_on if the model
    left it empty, respecting parent-before-child ordering."""
    runner = plan_dict.setdefault("runner", {})
    if runner.get("execution_order"):
        return plan_dict

    tables = plan_dict.get("tables") or []
    remaining = {t["name"]: set(t.get("depends_on") or []) for t in tables}
    ordered: list = []
    while remaining:
        ready = [name for name, deps in remaining.items() if deps <= set(ordered)]
        if not ready:
            ordered.extend(remaining.keys())
            break
        for name in ready:
            ordered.append(name)
            remaining.pop(name)
    runner["execution_order"] = ordered
    plan_dict["runner"] = runner
    return plan_dict


REPAIR_PIPELINE = [
    repair_field_order,
    repair_nullable_not_null_conflict,
    repair_constraint_config_keys,
    repair_edge_case_field_refs,
    repair_catalog_entries,
    repair_cross_reference_field_syntax,
    repair_missing_execution_order,
]


def apply_repairs(plan_dict: dict) -> dict:
    for repair_fn in REPAIR_PIPELINE:
        plan_dict = repair_fn(plan_dict)
    return plan_dict


def generate_plan(system_prompt: str, user_content: str) -> str:
    stream = client.models.generate_content_stream(
        model=MODEL_NAME,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0,
            max_output_tokens=16384,
        ),
    )

    answer_chunks: list[str] = []
    for chunk in stream:
        text = getattr(chunk, "text", None)
        if text:
            print(text, end="", flush=True)
            answer_chunks.append(text)
    print()

    return "".join(answer_chunks).strip()


def parse_yaml_or_die(yaml_text: str) -> dict:
    try:
        parsed = yaml.safe_load(yaml_text)
    except yaml.YAMLError:
        print("\n[WARN] YAML invalido, intentando sanitizar...")
        sanitized = sanitize_yaml_text(yaml_text)
        try:
            parsed = yaml.safe_load(sanitized)
            print("[WARN] Sanitizacion exitosa, YAML recuperado.")
        except yaml.YAMLError as exc:
            print(f"\n[ERROR] YAML invalido incluso tras sanitizar: {exc}")
            print(f"[DEBUG] Primeros 300 caracteres:\n{yaml_text[:300]}")
            raise SystemExit(1)

    if parsed is None:
        parsed = {}

    if not isinstance(parsed, dict):
        print(
            f"\n[ERROR] El documento no es un mapa/objeto en la raiz. Tipo recibido: {type(parsed)}"
        )
        raise SystemExit(1)

    return parsed


def write_yaml_snapshot(plan_dict: dict) -> None:
    with open(YAML_SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        yaml.dump(plan_dict, f, allow_unicode=True, sort_keys=False)
    print(f"[snapshot] {YAML_SNAPSHOT_PATH} guardado.")


def main() -> None:
    system_prompt = load_system_prompt(SYSTEM_PROMPT_PATH)

    raw_output = generate_plan(system_prompt, USER_PROMPT)
    cleaned_yaml = extract_yaml_block(raw_output)

    plan_dict = parse_yaml_or_die(cleaned_yaml)
    write_yaml_snapshot(plan_dict)

    plan_dict = apply_repairs(plan_dict)
    write_yaml_snapshot(plan_dict)

    try:
        plan = GenerationPlan.model_validate(plan_dict)
    except ValidationError as exc:
        print(
            f"\n[ERROR] El YAML es valido pero no cumple el esquema GenerationPlan:\n{exc}"
        )
        return

    plan_json = plan.model_dump_json(indent=2)
    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(plan_json)

    print(f"\nPlan valido guardado en: {JSON_OUTPUT_PATH}")
    print(f"Snapshot YAML en: {YAML_SNAPSHOT_PATH}")
    print(f"Tablas generadas en el plan: {[t.name for t in plan.tables]}")


if __name__ == "__main__":
    main()
