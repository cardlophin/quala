"""Traduccion de reglas de negocio a SQL de validacion (via Gemini) y
sugerencia automatica de reglas a partir del esquema.

- generate_sql_rules: sustituye a rule_generation.py (que usaba Ollama). Aqui
  usamos google-genai (Gemini), que es lo que el .env ya tiene configurado
  (GEMINI_API_KEY + MODEL_NAME). Devuelve el contrato SQLRule del frontend.
- suggest_business_rules: heuristica de esquema identica a la del mock
  (PK -> unico/no nulo; not-null -> no vacio; FK que casa con PK de otra
  fuente -> integridad referencial). No usa LLM.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..config import get_settings
from .. import store

SYSTEM_INSTRUCTION = """
Eres un traductor experto de reglas de negocio a SQL de validacion para Databricks SQL.
Conviertes reglas en lenguaje natural en consultas que MIDEN incumplimientos.

Instrucciones:
1. Devuelve UNICAMENTE JSON valido, sin texto alrededor ni ```.
2. Una entrada por cada regla recibida, en el mismo orden.
3. `sql_query` debe devolver el numero de filas que INCUMPLEN la regla, con alias failed_rows:
   SELECT COUNT(*) AS failed_rows FROM ... WHERE <condicion de incumplimiento>.
4. `sample_query` debe devolver hasta 10 filas de ejemplo que incumplen (SELECT ... LIMIT 10).
5. Usa SIEMPRE los nombres completos de tabla (catalog.schema.table) y los alias dados.
6. Si la regla relaciona dos fuentes, usa JOIN/LEFT JOIN por las columnas indicadas.
7. Formato email -> RLIKE. Catalogos cerrados -> NOT IN (...).
8. No inventes columnas ni tablas. Si una regla es ambigua o no traducible,
   pon "translatable": false, deja sql_query y sample_query en null y explica en "reason".
9. `success_condition` es una frase corta ("failed_rows = 0" o equivalente en espanol).

Formato de salida:
{"rules":[{"rule_name":"...","business_rule":"...","translatable":true,
"sql_query":"SELECT COUNT(*) AS failed_rows FROM ... WHERE ...",
"sample_query":"SELECT * FROM ... WHERE ... LIMIT 10",
"success_condition":"failed_rows = 0","reason":null}]}
""".strip()


class RuleGenerationError(RuntimeError):
    pass


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    # Quita fences ```json ... ``` si el modelo los anade.
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    else:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end != -1:
            cleaned = cleaned[start : end + 1]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuleGenerationError(f"El LLM no devolvio JSON valido: {exc}") from exc


def _build_user_prompt(
    sources: list[dict[str, Any]],
    business_rules: list[str],
    context: str | None = None,
) -> str:
    lines = ["Fuentes (alias -> tabla, columnas):"]
    for s in sources:
        cols = ", ".join(
            f"{c.get('name')} {c.get('type', '')}".strip() for c in s.get("columns", [])
        )
        lines.append(f"- {s['alias']} -> {s['table']} ({cols})")
    if context and context.strip():
        lines.append("")
        lines.append("Contexto adicional de los datos (proporcionado por el usuario):")
        lines.append(context.strip())
    lines.append("")
    lines.append("Reglas de negocio:")
    for i, rule in enumerate(business_rules, 1):
        lines.append(f"{i}. {rule}")
    return "\n".join(lines)


def generate_sql_rules(
    sources: list[dict[str, Any]],
    business_rules: list[str],
    context: str | None = None,
) -> dict[str, Any]:
    """Devuelve un RuleSet ({"rules": [...]}) traduciendo cada regla a SQL."""
    if not business_rules:
        return {"rules": []}

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuleGenerationError("GEMINI_API_KEY no esta configurada en el backend.")

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover
        raise RuleGenerationError("google-genai no esta instalado en el backend.") from exc

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = _build_user_prompt(sources, business_rules, context)
    try:
        resp = client.models.generate_content(
            model=settings.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:  # noqa: BLE001
        raise RuleGenerationError(f"Fallo la llamada a Gemini: {exc}") from exc

    parsed = _extract_json(resp.text or "")
    rules = parsed.get("rules", [])
    # Normaliza al contrato SQLRule (rellena claves ausentes).
    normalized = []
    for i, r in enumerate(rules):
        normalized.append(
            {
                "rule_name": r.get("rule_name") or f"regla_{i + 1}",
                "business_rule": r.get("business_rule")
                or (business_rules[i] if i < len(business_rules) else ""),
                "translatable": bool(r.get("translatable", r.get("sql_query") is not None)),
                "sql_query": r.get("sql_query"),
                "sample_query": r.get("sample_query"),
                "success_condition": r.get("success_condition") or "failed_rows = 0",
                "reason": r.get("reason"),
            }
        )
    return {"rules": normalized}


# --- Sugerencias con IA a partir del esquema (Gemini) ----------------------

SUGGEST_SYSTEM_INSTRUCTION = """
Eres un experto en calidad de datos. A partir del ESQUEMA de unas tablas
(columnas, tipos, claves primarias/foráneas y relaciones), propones reglas de
negocio de validación concretas y verificables, en ESPAÑOL y en lenguaje
natural (no SQL). NO tienes acceso a los datos, solo al esquema.

Directrices:
- Sugiere entre 5 y 8 reglas útiles y específicas de ESTAS tablas.
- Cubre: unicidad/no-nulo de claves, formatos (email, fechas), rangos
  numéricos plausibles, valores permitidos en columnas tipo estado/categoría,
  e INTEGRIDAD REFERENCIAL entre tablas relacionadas (FK -> PK).
- Usa los alias/nombres reales de tabla y columna. No inventes columnas.
- Cada regla en una frase corta y accionable.

Devuelve SOLO JSON válido: {"rules": ["regla 1", "regla 2", ...]}
""".strip()


def _build_schema_prompt(sources: list[dict[str, Any]]) -> str:
    lines = ["Tablas y esquema:"]
    for s in sources:
        lines.append(f"\nTabla {s.get('alias')} ({s.get('table')}):")
        for c in s.get("columns", []):
            marks = []
            if c.get("is_primary_key"):
                marks.append("PK")
            if c.get("is_foreign_key"):
                marks.append("FK")
            suffix = f" [{', '.join(marks)}]" if marks else ""
            lines.append(f"  - {c.get('name')} {c.get('type', '')}{suffix}".rstrip())
    return "\n".join(lines)


def suggest_business_rules_ai(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sugiere reglas de negocio (texto libre) con Gemini a partir del esquema."""
    if not sources:
        return []
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuleGenerationError("GEMINI_API_KEY no esta configurada en el backend.")
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover
        raise RuleGenerationError("google-genai no esta instalado en el backend.") from exc

    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        resp = client.models.generate_content(
            model=settings.model_name,
            contents=_build_schema_prompt(sources),
            config=types.GenerateContentConfig(
                system_instruction=SUGGEST_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:  # noqa: BLE001
        raise RuleGenerationError(f"Fallo la llamada a Gemini: {exc}") from exc

    parsed = _extract_json(resp.text or "")
    rules = parsed.get("rules", [])
    return [
        {"id": store.uid("sugg"), "text": str(t).strip(), "source": "suggested"}
        for t in rules
        if str(t).strip()
    ][:8]


# --- Sugerencias por esquema (heurística, sin LLM) -------------------------


def suggest_business_rules(resolved: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """resolved: [{alias, columns:[{name,data_type,nullable,is_primary_key,is_foreign_key}]}].
    Replica la heuristica del mock (mock-api.suggestBusinessRules)."""
    suggestions: list[dict[str, Any]] = []

    for source in resolved:
        alias = source["alias"]
        for col in source.get("columns", []):
            if col.get("is_primary_key"):
                suggestions.append(
                    {
                        "id": store.uid("sugg"),
                        "text": f'El campo "{alias}.{col["name"]}" debe ser unico y no nulo.',
                        "source": "suggested",
                    }
                )
            elif not col.get("nullable", True):
                suggestions.append(
                    {
                        "id": store.uid("sugg"),
                        "text": f'El campo "{alias}.{col["name"]}" no debe estar vacio.',
                        "source": "suggested",
                    }
                )

    if len(resolved) >= 2:
        for a in resolved:
            for b in resolved:
                if a["alias"] == b["alias"]:
                    continue
                for col in a.get("columns", []):
                    if not col.get("is_foreign_key"):
                        continue
                    match = next(
                        (
                            c
                            for c in b.get("columns", [])
                            if c.get("is_primary_key") and c["name"] == col["name"]
                        ),
                        None,
                    )
                    if match:
                        suggestions.append(
                            {
                                "id": store.uid("sugg"),
                                "text": (
                                    f'Todo "{a["alias"]}.{col["name"]}" debe existir '
                                    f'en "{b["alias"]}.{match["name"]}".'
                                ),
                                "source": "suggested",
                            }
                        )

    return suggestions[:6]
