"""Nodo Pipeline: Jobs y Lakeflow Pipelines de Databricks + ejecución.

Contrato: mock-api.ts fetchJobs, fetchLakeflowPipelines, validateResourceExists,
runPipeline.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from .. import store
from ..schemas import (
    ResourceVerificationResult,
    ResourceVerifyRequest,
    RunPipelineRequest,
)
from ..services import databricks
from ..services.databricks import DatabricksError

router = APIRouter(tags=["pipeline"])


def _require(conn_id: str) -> dict:
    conn = store.get_connection(conn_id)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Conexion {conn_id} no encontrada")
    return conn


@router.get("/connections/{conn_id}/jobs")
def list_jobs(conn_id: str) -> list[dict[str, Any]]:
    conn = _require(conn_id)
    try:
        return databricks.list_jobs(conn)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/connections/{conn_id}/lakeflow-pipelines")
def list_pipelines(conn_id: str) -> list[dict[str, Any]]:
    conn = _require(conn_id)
    try:
        return databricks.list_pipelines(conn)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/connections/{conn_id}/resources/verify", response_model=ResourceVerificationResult)
def verify_resource(conn_id: str, payload: ResourceVerifyRequest):
    conn = _require(conn_id)
    return databricks.verify_resource(conn, payload.kind, payload.resource_id)


@router.post("/pipeline/run")
def run_pipeline(payload: RunPipelineRequest) -> dict[str, Any]:
    conn = store.get_connection(payload.connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    try:
        return databricks.run_pipeline(
            conn,
            payload.kind,
            payload.resource_id,
            payload.input_table,
            payload.params,
        )
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
