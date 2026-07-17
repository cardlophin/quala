"""Generación de datos sintéticos: planificación (LLM) + ejecución (motor).

- generate_plan: descripción (+ contexto de esquema opcional) -> GenerationPlan.
  Reutiliza `design/rules/generation_planning.py` (llamada a Gemini + extracción
  YAML + reparaciones), importado de forma perezosa.
- run_plan: valida el plan contra el esquema REAL del motor
  (`synthetic_generation.parser.parse_plan`) y lo ejecuta fila a fila con el
  `Runner`, devolviendo un preview de cada tabla generada.

El contexto de esquema es SOLO estructura (columnas + PK/FK + relaciones) de un
nodo Fuente de datos conectado — nunca sus datos.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from typing import Any, Optional

from ..config import REPO_ROOT


class SyntheticError(RuntimeError):
    """Fallo generando el plan o ejecutando el motor."""


def _load_planning():
    """Importa design/rules/generation_planning de forma perezosa (crea el
    cliente de Gemini al importarse, así que solo se toca cuando hace falta)."""
    rules_dir = str(REPO_ROOT / "design" / "rules")
    if rules_dir not in sys.path:
        sys.path.insert(0, rules_dir)
    try:
        import generation_planning  # type: ignore

        return generation_planning
    except ImportError as exc:  # pragma: no cover
        raise SyntheticError(
            "No se pudo cargar el planificador (design/rules/generation_planning). "
            f"¿Falta google-genai / GEMINI_API_KEY? Detalle: {exc}"
        ) from exc


def _build_user_content(
    description: str, schema_context: Optional[list[dict[str, Any]]]
) -> str:
    parts: list[str] = []
    if description and description.strip():
        parts.append(description.strip())

    if schema_context:
        # Contrato: si hay esquema de referencia, se generan EXACTAMENTE esas
        # tablas y ninguna más — aunque la descripción mencione relaciones con
        # otras tablas. Para una FK a otra tabla, se usa un generador autónomo
        # (no se crea la tabla padre). Además el backend lo garantiza por
        # estructura recortando el plan (_restrict_plan_to_reference).
        header = (
            "\nGenera datos sintéticos EXCLUSIVAMENTE para las siguientes tablas "
            "(mismos nombres, columnas y tipos). NO generes NINGUNA otra tabla, "
            "aunque la descripción mencione relaciones con otras tablas. Para una "
            "columna que referencie a otra tabla externa (p. ej. una clave foránea), "
            "genera un valor plausible con un generador AUTÓNOMO (sequence, uuid o "
            "faker) SIN crear la tabla padre:"
        )
        lines = [header]
        for s in schema_context:
            title = s.get("alias") or s.get("table") or "tabla"
            lines.append(f"\nTabla {title} ({s.get('table', '')}):")
            for c in s.get("columns", []):
                marks = []
                if c.get("is_primary_key"):
                    marks.append("PK")
                if c.get("is_foreign_key"):
                    marks.append("FK")
                suffix = f" [{', '.join(marks)}]" if marks else ""
                lines.append(f"  - {c.get('name')} {c.get('type', '')}{suffix}".rstrip())
        parts.append("\n".join(lines))

    if not parts:
        return "Genera un dataset sintético genérico de ejemplo."
    return "\n".join(parts)


def _reference_table_names(schema_context: list[dict[str, Any]]) -> set[str]:
    names: set[str] = set()
    for s in schema_context:
        table = str(s.get("table", ""))
        if table:
            names.add(table.split(".")[-1])
        alias = s.get("alias")
        if alias:
            names.add(str(alias))
    return names


def _restrict_plan_to_reference(
    plan_dict: dict[str, Any], schema_context: list[dict[str, Any]]
) -> dict[str, Any]:
    """Garantía estructural: cuando hay esquema de referencia, el plan solo
    puede contener ESAS tablas. Elimina las tablas que el LLM haya inventado
    (p. ej. una tabla padre para una FK) y neutraliza los generadores/constraints
    de las tablas que se conservan y que apuntaban a una tabla eliminada, para
    que el plan siga validando contra el motor."""
    ref = _reference_table_names(schema_context)
    if not ref:
        return plan_dict

    tables = plan_dict.get("tables", [])
    kept = [t for t in tables if t.get("name") in ref]
    # Si el LLM nombró las tablas distinto (no casa ninguna), no recortamos
    # nada: mejor devolver datos que un plan vacío.
    if not kept or len(kept) == len(tables):
        return plan_dict

    kept_names = {t.get("name") for t in kept}
    removed = {t.get("name") for t in tables if t.get("name") not in kept_names}

    for t in kept:
        t["depends_on"] = [d for d in t.get("depends_on", []) if d in kept_names]
        for field in t.get("fields", []):
            gen = field.get("generator", {}) or {}
            cfg = gen.get("config", {}) or {}
            parent = cfg.get("parent_table")
            if gen.get("type") == "foreign_key" and parent in removed:
                # FK a una tabla eliminada -> id autónomo único.
                field["generator"] = {"type": "uuid", "config": {}}
            elif gen.get("type") == "parent_field_ref" and parent in removed:
                as_type = cfg.get("as_type", "string")
                if as_type == "date":
                    field["generator"] = {
                        "type": "date_range",
                        "config": {"start": "2020-01-01", "end": "2026-01-01", "as_type": "date"},
                    }
                elif as_type in ("int", "integer"):
                    field["generator"] = {
                        "type": "numeric_range",
                        "config": {"min": 0, "max": 1000, "as_type": "int"},
                    }
                elif as_type in ("float", "number"):
                    field["generator"] = {
                        "type": "numeric_range",
                        "config": {"min": 0.0, "max": 1000.0, "as_type": "float"},
                    }
                else:
                    field["generator"] = {"type": "faker", "config": {"provider": "word"}}
            # Quita constraints que referencian tablas eliminadas.
            field["constraints"] = [
                c
                for c in field.get("constraints", [])
                if (c.get("config", {}) or {}).get("parent_table") not in removed
            ]

    plan_dict["tables"] = kept
    runner = plan_dict.get("runner", {}) or {}
    eo = [n for n in runner.get("execution_order", []) if n in kept_names]
    runner["execution_order"] = eo or [t.get("name") for t in kept]
    plan_dict["runner"] = runner
    ec = plan_dict.get("edge_cases", {}) or {}
    ec["cases"] = [
        c for c in ec.get("cases", []) if c.get("target_table") in kept_names
    ]
    plan_dict["edge_cases"] = ec
    return plan_dict


def _valid_py_expr(expr: Any) -> bool:
    """True si `expr` es una expresión Python parseable (el motor la evalúa con
    un evaluador seguro que hace ast.parse(mode='eval'))."""
    if not expr or not str(expr).strip():
        return False
    try:
        ast.parse(str(expr), mode="eval")
        return True
    except SyntaxError:
        return False


def _fallback_generator(logical_type: Any) -> dict[str, Any]:
    lt = str(logical_type or "string").lower()
    if lt in ("integer", "int"):
        return {"type": "numeric_range", "config": {"min": 0, "max": 1000, "as_type": "int"}}
    if lt in ("float", "number", "decimal"):
        return {"type": "numeric_range", "config": {"min": 0.0, "max": 1000.0, "as_type": "float"}}
    if lt == "date":
        return {"type": "date_range", "config": {"start": "2020-01-01", "end": "2026-01-01", "as_type": "date"}}
    return {"type": "faker", "config": {"provider": "word"}}


def _sanitize_formulas(plan_dict: dict[str, Any]) -> dict[str, Any]:
    """Neutraliza generadores `formula` y constraints `formula_match` cuya
    expresión no sea Python válido (el LLM a veces escribe SQL tipo CASE WHEN o
    expresiones malformadas), para que el plan no reviente al ejecutarse."""
    for t in plan_dict.get("tables", []):
        for field in t.get("fields", []):
            gen = field.get("generator", {}) or {}
            cfg = gen.get("config", {}) or {}
            if gen.get("type") == "formula" and not _valid_py_expr(cfg.get("expression")):
                field["generator"] = _fallback_generator(field.get("logical_type"))
            # Quita constraints formula_match con expresión inválida.
            field["constraints"] = [
                c
                for c in field.get("constraints", [])
                if not (
                    c.get("type") == "formula_match"
                    and not _valid_py_expr((c.get("config", {}) or {}).get("expression"))
                )
            ]
    return plan_dict


def generate_plan(
    description: str, schema_context: Optional[list[dict[str, Any]]] = None
) -> dict[str, Any]:
    """Descripción -> GenerationPlan (dict), validado/reparado."""
    planning = _load_planning()
    try:
        system_prompt = planning.load_system_prompt(planning.SYSTEM_PROMPT_PATH)
        user_content = _build_user_content(description, schema_context)
        raw_output = planning.generate_plan(system_prompt, user_content)
        cleaned_yaml = planning.extract_yaml_block(raw_output)
        plan_dict = planning.parse_yaml_or_die(cleaned_yaml)
        plan_dict = planning.apply_repairs(plan_dict)
        # Garantía estructural: con esquema de referencia, solo esas tablas.
        if schema_context:
            plan_dict = _restrict_plan_to_reference(plan_dict, schema_context)
        # Sanea expresiones de fórmula inválidas (SQL/malformadas del LLM).
        plan_dict = _sanitize_formulas(plan_dict)
        return plan_dict
    except SyntheticError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise SyntheticError(f"Fallo generando el plan: {exc}") from exc


def _strip_helper_fields(row: dict[str, Any]) -> dict[str, Any]:
    """Elimina los campos PUENTE con prefijo `__` (ej. __shipped_date_full):
    ayudan a resolver dependencias durante la generación pero NO forman parte
    del dataset final (no deben verse en el preview ni escribirse en Databricks).
    Las claves internas __linked__/__fk_row__ ya las quita el propio motor."""
    return {k: v for k, v in row.items() if not k.startswith("__")}


def _execute_plan(plan_dict: dict[str, Any]):
    """parse_plan (esquema del motor) + Runner.run(). Devuelve el RunResult."""
    try:
        from synthetic_generation.parser import PlanParseError, parse_plan
        from synthetic_generation.runner import Runner
    except ImportError as exc:  # pragma: no cover
        raise SyntheticError(f"No se pudo cargar el motor de generación: {exc}") from exc

    # Sanea fórmulas inválidas también al ejecutar (planes ya guardados en el
    # nodo antes de este arreglo se reparan aquí).
    plan_dict = _sanitize_formulas(plan_dict)

    try:
        plan = parse_plan(plan_dict)
    except PlanParseError as exc:
        raise SyntheticError(
            f"El plan no valida contra el esquema del motor: {exc}"
        ) from exc

    try:
        return Runner(plan).run()
    except Exception as exc:  # noqa: BLE001
        raise SyntheticError(f"Fallo ejecutando el plan: {exc}") from exc


def run_plan(plan_dict: dict[str, Any], preview_limit: int = 20) -> dict[str, Any]:
    """Valida el plan contra el motor y lo ejecuta; devuelve preview por tabla
    (sin los campos puente `__`)."""
    result = _execute_plan(plan_dict)

    tables = [
        {"name": name, "rows": [_strip_helper_fields(r) for r in rows[:preview_limit]]}
        for name, rows in result.valid_tables.items()
    ]
    first = tables[0] if tables else None

    # Dataset INVÁLIDO (mutaciones de los edge cases): se genera a propósito
    # para poder probar que las reglas/validaciones lo detectan. Lo exponemos
    # para dar visibilidad en la interfaz.
    invalid_tables = [
        {"name": name, "rows": [_strip_helper_fields(r) for r in rows[:preview_limit]]}
        for name, rows in result.invalid_tables.items()
    ]

    report = result.validation_report
    issues = getattr(report, "issues", []) or []
    validation = {
        "is_valid": report.is_valid,
        "total_issues": len(issues),
        "issues": [
            {
                "table": getattr(i, "table", None),
                "constraint_type": getattr(i, "constraint_type", None),
                "field_name": getattr(i, "field_name", None),
                "row_index": getattr(i, "row_index", None),
                "message": getattr(i, "message", None),
            }
            for i in issues[:20]
        ],
    }

    return {
        "preview_rows": first["rows"] if first else [],
        "output_table": first["name"] if first else "datos",
        "tables": tables,
        "invalid_tables": invalid_tables,
        "row_counts": result.metadata.row_counts if result.metadata else {},
        "is_valid": report.is_valid,
        "validation": validation,
        "edge_cases_generated": (
            result.metadata.edge_cases_generated if result.metadata else []
        ),
    }


# --- Volcado a Databricks --------------------------------------------------

_SQL_TYPES = {
    "string": "STRING",
    "integer": "BIGINT",
    "int": "BIGINT",
    "float": "DOUBLE",
    "number": "DOUBLE",
    "decimal": "DOUBLE",
    "date": "DATE",
    "datetime": "TIMESTAMP",
    "timestamp": "TIMESTAMP",
    "boolean": "BOOLEAN",
    "bool": "BOOLEAN",
}


def _q(ident: str) -> str:
    return "`" + str(ident).replace("`", "``") + "`"


def _plan_column_types(plan_dict: dict[str, Any]) -> dict[str, dict[str, str]]:
    """{tabla: {campo: SQL_TYPE}} a partir de los logical_type del plan,
    excluyendo los campos puente `__`."""
    out: dict[str, dict[str, str]] = {}
    for table in plan_dict.get("tables", []):
        cols: dict[str, str] = {}
        for field in table.get("fields", []):
            name = field.get("name", "")
            if name.startswith("__"):
                continue
            lt = str(field.get("logical_type", "string")).lower()
            cols[name] = _SQL_TYPES.get(lt, "STRING")
        out[table.get("name", "")] = cols
    return out


def _infer_sql_type(value: Any) -> str:
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, int):
        return "BIGINT"
    if isinstance(value, float):
        return "DOUBLE"
    return "STRING"


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def _chunks(seq: list[Any], size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def write_to_databricks(
    connection: dict[str, Any],
    plan_dict: dict[str, Any],
    catalog: str,
    schema: str,
    warehouse_id: Optional[str] = None,
    batch_size: int = 200,
) -> dict[str, Any]:
    """Ejecuta el plan y escribe TODAS las tablas generadas en
    `catalog.schema` de Databricks (crea el esquema si no existe). Dropea los
    campos puente `__`. Devuelve las tablas escritas con su nombre completo."""
    from . import databricks

    if not catalog or not schema:
        raise SyntheticError("Faltan catálogo o esquema de destino.")

    result = _execute_plan(plan_dict)
    types_by_table = _plan_column_types(plan_dict)
    wh = databricks.resolve_warehouse_id(connection, warehouse_id)

    try:
        databricks.run_sql(
            connection,
            f"CREATE SCHEMA IF NOT EXISTS {_q(catalog)}.{_q(schema)}",
            wh,
        )
    except databricks.DatabricksError as exc:
        raise SyntheticError(f"No se pudo crear/acceder al esquema: {exc}") from exc

    written: list[dict[str, Any]] = []
    for tname, rows in result.valid_tables.items():
        clean = [_strip_helper_fields(r) for r in rows]
        if not clean:
            continue

        # Columnas y tipos: orden de la primera fila; tipo del plan o inferido.
        col_names = list(clean[0].keys())
        plan_types = types_by_table.get(tname, {})
        col_types = {
            name: plan_types.get(name) or _infer_sql_type(clean[0].get(name))
            for name in col_names
        }

        full_q = f"{_q(catalog)}.{_q(schema)}.{_q(tname)}"
        full_display = f"{catalog}.{schema}.{tname}"
        col_defs = ", ".join(f"{_q(n)} {col_types[n]}" for n in col_names)

        try:
            databricks.run_sql(
                connection, f"CREATE OR REPLACE TABLE {full_q} ({col_defs})", wh
            )
            cols_sql = ", ".join(_q(n) for n in col_names)
            for batch in _chunks(clean, batch_size):
                values = ", ".join(
                    "(" + ", ".join(_sql_literal(row.get(n)) for n in col_names) + ")"
                    for row in batch
                )
                databricks.run_sql(
                    connection,
                    f"INSERT INTO {full_q} ({cols_sql}) VALUES {values}",
                    wh,
                )
        except databricks.DatabricksError as exc:
            raise SyntheticError(f"Error escribiendo la tabla {full_display}: {exc}") from exc

        written.append(
            {"name": tname, "full_name": full_display, "row_count": len(clean)}
        )

    return {"schema": f"{catalog}.{schema}", "tables": written}
