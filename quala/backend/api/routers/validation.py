"""Slice de Validacion: generar SQL desde reglas de negocio, sugerir reglas
y ejecutar el RuleSet contra Databricks.

Contrato: mock-api.ts generateSqlRules, suggestBusinessRules, runValidation.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import store
from ..schemas import (
    BusinessRuleDraft,
    GenerateSqlRulesRequest,
    RunValidationRequest,
    RuleSet,
    SuggestBusinessRulesRequest,
    SuggestRulesAiRequest,
    ValidationFeedback,
)
from ..services import databricks, rules
from ..services import validation as validation_service
from ..services.databricks import DatabricksError
from ..services.rules import RuleGenerationError

router = APIRouter(prefix="/validation", tags=["validation"])


@router.post("/generate-sql", response_model=RuleSet)
def generate_sql_rules(payload: GenerateSqlRulesRequest):
    sources = [s.model_dump() for s in payload.sources]
    try:
        return rules.generate_sql_rules(sources, payload.business_rules, payload.context)
    except RuleGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/suggest-rules", response_model=list[BusinessRuleDraft])
def suggest_business_rules(payload: SuggestBusinessRulesRequest):
    conn = store.get_connection(payload.connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Conexion no encontrada")

    # Resolver el esquema real de cada fuente para alimentar la heuristica.
    resolved = []
    for src in payload.sources:
        alias, table = src.get("alias"), src.get("table")
        if not table:
            continue
        try:
            schema = databricks.get_table_schema(conn, table)
        except DatabricksError:
            continue
        resolved.append({"alias": alias, "columns": schema["columns"]})

    return rules.suggest_business_rules(resolved)


@router.post("/suggest-rules-ai", response_model=list[BusinessRuleDraft])
def suggest_business_rules_ai(payload: SuggestRulesAiRequest):
    try:
        return rules.suggest_business_rules_ai(payload.sources)
    except RuleGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/run", response_model=ValidationFeedback)
def run_validation(payload: RunValidationRequest):
    conn = store.get_connection(payload.connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Conexion no encontrada")
    return validation_service.run_validation(
        conn, payload.rule_set.model_dump(), payload.warehouse_id
    )
