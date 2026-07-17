"""Conexiones Databricks + metastore (warehouses, tablas, esquema, preview).

Contrato: mock-api.ts fetch/create/update/deleteConnection, testConnection,
fetchWarehouses, fetchTables, fetchTableSchema, validateTableExists,
fetchTablePreviewRows.

Nota de firma: en el mock, fetchTableSchema/validateTableExists/
fetchTablePreviewRows solo reciben `fullName`. El backend real necesita la
conexion para poder consultar, asi que cuelgan de /connections/{id}/... El
puente api.ts del frontend pasa el connection_id del proyecto (ya conocido).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from .. import store
from ..schemas import (
    ConnectionCreate,
    ConnectionUpdate,
    DatabricksConnection,
    ResourceVerificationResult,
    SqlWarehouse,
    TableSchemaInfo,
    TestConnectionRequest,
    TestConnectionResult,
)
from ..services import databricks
from ..services.databricks import DatabricksError

router = APIRouter(prefix="/connections", tags=["connections"])


def _require(conn_id: str) -> dict:
    conn = store.get_connection(conn_id)
    if conn is None:
        raise HTTPException(status_code=404, detail=f"Conexion {conn_id} no encontrada")
    return conn


@router.get("", response_model=list[DatabricksConnection])
def list_connections():
    return store.list_connections()


@router.post("", response_model=DatabricksConnection)
def create_connection(payload: ConnectionCreate):
    return store.create_connection(payload.model_dump(by_alias=True, exclude_none=True))


@router.post("/test", response_model=TestConnectionResult)
def test_connection(payload: TestConnectionRequest):
    try:
        databricks.test_auth(payload.host, payload.client_id, payload.client_secret)
        return {"status": "success"}
    except DatabricksError as exc:
        return {"status": "error", "message": str(exc)}


@router.get("/{conn_id}", response_model=DatabricksConnection)
def get_connection(conn_id: str):
    return _require(conn_id)


@router.patch("/{conn_id}", response_model=DatabricksConnection)
def update_connection(conn_id: str, patch: ConnectionUpdate):
    updated = store.update_connection(
        conn_id, patch.model_dump(by_alias=True, exclude_unset=True)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Conexion {conn_id} no encontrada")
    return updated


@router.delete("/{conn_id}", status_code=204)
def delete_connection(conn_id: str):
    store.delete_connection(conn_id)


# --- Metastore --------------------------------------------------------------


@router.get("/{conn_id}/warehouses", response_model=list[SqlWarehouse])
def list_warehouses(conn_id: str):
    conn = _require(conn_id)
    try:
        return databricks.list_warehouses(conn)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{conn_id}/catalogs", response_model=list[str])
def list_catalogs(conn_id: str):
    conn = _require(conn_id)
    try:
        return databricks.list_catalogs(conn)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{conn_id}/schemas", response_model=list[str])
def list_schemas(conn_id: str, catalog: str = Query(...)):
    conn = _require(conn_id)
    try:
        return databricks.list_schemas(conn, catalog)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{conn_id}/tables", response_model=list[str])
def list_tables(conn_id: str, catalog: str = Query(...), schema: str = Query(...)):
    conn = _require(conn_id)
    try:
        return databricks.list_tables(conn, catalog, schema)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{conn_id}/tables/schema", response_model=TableSchemaInfo)
def get_table_schema(conn_id: str, full_name: str = Query(...)):
    conn = _require(conn_id)
    try:
        return databricks.get_table_schema(conn, full_name)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{conn_id}/tables/exists", response_model=ResourceVerificationResult)
def validate_table_exists(conn_id: str, full_name: str = Query(...)):
    conn = _require(conn_id)
    if not full_name:
        return {"exists": False, "message": "Sin tabla configurada."}
    try:
        exists = databricks.table_exists(conn, full_name)
        return {
            "exists": exists,
            "message": "La tabla existe y es accesible."
            if exists
            else f'No se encontro la tabla "{full_name}" en el catalogo.',
        }
    except DatabricksError as exc:
        return {"exists": False, "message": str(exc)}


@router.get("/{conn_id}/tables/preview", response_model=list[dict])
def preview_table(conn_id: str, full_name: str = Query(...)):
    conn = _require(conn_id)
    try:
        return databricks.preview_rows(conn, full_name)
    except DatabricksError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _touch(conn: dict) -> None:
    store.update_connection(
        conn["id"],
        {"status": "success", "last_tested_at": datetime.now(timezone.utc).isoformat()},
    )
