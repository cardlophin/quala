"""Generación de datos sintéticos: plan (LLM) + ejecución (motor).

Contrato: mock-api.ts generatePlan / runGeneration.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from .. import store
from ..schemas import GeneratePlanRequest, RunGenerationRequest, WriteSyntheticRequest
from ..services import synthetic
from ..services.synthetic import SyntheticError

router = APIRouter(prefix="/synthetic", tags=["synthetic"])


@router.post("/plan")
def generate_plan(payload: GeneratePlanRequest) -> dict[str, Any]:
    """Devuelve un GenerationPlan (dict) a partir de la descripción + contexto."""
    try:
        return synthetic.generate_plan(payload.description, payload.schema_context)
    except SyntheticError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/run")
def run_generation(payload: RunGenerationRequest) -> dict[str, Any]:
    """Ejecuta el plan con el motor determinista y devuelve un preview por tabla."""
    try:
        return synthetic.run_plan(payload.plan)
    except SyntheticError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/write")
def write_synthetic(payload: WriteSyntheticRequest) -> dict[str, Any]:
    """Ejecuta el plan y vuelca todas las tablas en catalog.schema de Databricks."""
    conn = store.get_connection(payload.connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    try:
        return synthetic.write_to_databricks(
            conn, payload.plan, payload.catalog, payload.schema_, payload.warehouse_id
        )
    except SyntheticError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
