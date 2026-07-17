"""Persistencia con sqlite3 (stdlib, sin dependencias nuevas).

Guarda tres cosas que en el mock vivian en memoria / localStorage:
conexiones, proyectos y el grafo de cada proyecto. Cada registro se
serializa como JSON en una unica columna `data`, porque el shape lo definen
los modelos Pydantic de schemas.py (fuente de verdad) y no queremos duplicar
el esquema en DDL de columnas.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from .config import get_settings

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def _connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        settings = get_settings()
        _conn = sqlite3.connect(settings.db_path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL;")
    return _conn


def init_db() -> None:
    """Crea las tablas si no existen y siembra la conexion legacy demo."""
    with _lock:
        conn = _connection()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_graphs (
                project_id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            """
        )
        conn.commit()

        # Semilla: una conexion "legacy" (PAT) para poder demostrar el flujo
        # de migracion a OAuth M2M, igual que hacia el mock (mock-api.ts).
        cur = conn.execute("SELECT COUNT(*) AS n FROM connections")
        if cur.fetchone()["n"] == 0:
            legacy = {
                "id": "conn_legacy_demo",
                "name": "Produccion EU (antigua)",
                "host": "adb-1234567890123456.7.azuredatabricks.net",
                "client_id": "",
                "client_secret": "",
                "token": "dapi_legacy_token_demo",
                "http_path": "/sql/1.0/warehouses/abcd1234",
                "catalog": "main",
                "status": "success",
                "last_tested_at": _now_iso(),
            }
            conn.execute(
                "INSERT INTO connections (id, data) VALUES (?, ?)",
                (legacy["id"], json.dumps(legacy)),
            )
            conn.commit()


# --- helpers genericos -----------------------------------------------------


def _all(table: str) -> list[dict[str, Any]]:
    conn = _connection()
    rows = conn.execute(f"SELECT data FROM {table}").fetchall()
    return [json.loads(r["data"]) for r in rows]


def _get(table: str, key_col: str, key: str) -> Optional[dict[str, Any]]:
    conn = _connection()
    row = conn.execute(
        f"SELECT data FROM {table} WHERE {key_col} = ?", (key,)
    ).fetchone()
    return json.loads(row["data"]) if row else None


def _upsert(table: str, key_col: str, key: str, data: dict[str, Any]) -> None:
    conn = _connection()
    with _lock:
        conn.execute(
            f"INSERT INTO {table} ({key_col}, data) VALUES (?, ?) "
            f"ON CONFLICT({key_col}) DO UPDATE SET data = excluded.data",
            (key, json.dumps(data)),
        )
        conn.commit()


def _delete(table: str, key_col: str, key: str) -> None:
    conn = _connection()
    with _lock:
        conn.execute(f"DELETE FROM {table} WHERE {key_col} = ?", (key,))
        conn.commit()


# --- Conexiones ------------------------------------------------------------


def list_connections() -> list[dict[str, Any]]:
    return _all("connections")


def get_connection(conn_id: str) -> Optional[dict[str, Any]]:
    return _get("connections", "id", conn_id)


def create_connection(data: dict[str, Any]) -> dict[str, Any]:
    record = {**data, "id": uid("conn"), "status": data.get("status", "untested")}
    _upsert("connections", "id", record["id"], record)
    return record


def update_connection(conn_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    current = get_connection(conn_id)
    if current is None:
        return None
    updated = {**current, **{k: v for k, v in patch.items() if v is not None}}
    _upsert("connections", "id", conn_id, updated)
    return updated


def delete_connection(conn_id: str) -> None:
    _delete("connections", "id", conn_id)


# --- Proyectos -------------------------------------------------------------


def list_projects() -> list[dict[str, Any]]:
    return _all("projects")


def get_project(project_id: str) -> Optional[dict[str, Any]]:
    return _get("projects", "id", project_id)


def create_project(data: dict[str, Any]) -> dict[str, Any]:
    record = {
        "id": uid("proj"),
        "name": data["name"],
        "connection_id": data.get("connection_id"),
        "created_at": _now_iso(),
    }
    _upsert("projects", "id", record["id"], record)
    return record


def update_project(project_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    current = get_project(project_id)
    if current is None:
        return None
    updated = {**current, **{k: v for k, v in patch.items() if v is not None}}
    _upsert("projects", "id", project_id, updated)
    return updated


# --- Grafo de proyecto -----------------------------------------------------


def get_graph(project_id: str) -> Optional[dict[str, Any]]:
    return _get("project_graphs", "project_id", project_id)


def save_graph(graph: dict[str, Any]) -> None:
    _upsert("project_graphs", "project_id", graph["project_id"], graph)


def default_graph(project_id: str, connection_id: Optional[str]) -> dict[str, Any]:
    """Grafo inicial identico al defaultGraph() del mock: un unico nodo de
    Validacion sin configurar."""
    return {
        "project_id": project_id,
        "connection_id": connection_id,
        "nodes": [
            {
                "id": uid("node"),
                "type": "validation",
                "position": {"x": 250, "y": 150},
                "data": {
                    "label": "Validacion",
                    "status": "pending",
                    "config": {"business_rules": [], "rule_set": None, "connected_sources": []},
                },
            }
        ],
        "edges": [],
    }
