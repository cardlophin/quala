"""Adaptador fino sobre databricks-sdk (OAuth M2M / Service Principal).

Reusa el patron ya probado en design/integration/databricks/b.py:
    WorkspaceClient(host, client_id, client_secret, auth_type="oauth-m2m")
    w.statement_execution.execute_statement(warehouse_id=..., statement=...)

Todo lo que hable con Databricks pasa por aqui. Las funciones lanzan
DatabricksError con un mensaje legible; los routers lo traducen al contrato
(status "error" + message) sin inventar texto generico.
"""

from __future__ import annotations

from typing import Any, Optional

# El import del SDK es perezoso (dentro de las funciones) para que el resto
# de la app (CRUD, schemas) arranque aunque databricks-sdk no este instalado
# en el entorno actual.


class DatabricksError(RuntimeError):
    """Fallo hablando con Databricks (auth, SQL, red...)."""


# --- Cliente ---------------------------------------------------------------


def _client(connection: dict[str, Any]):
    try:
        from databricks.sdk import WorkspaceClient
    except ImportError as exc:  # pragma: no cover
        raise DatabricksError(
            "databricks-sdk no esta instalado en el entorno del backend."
        ) from exc

    host = connection.get("host")
    client_id = connection.get("client_id")
    client_secret = connection.get("client_secret")
    if not (host and client_id and client_secret):
        raise DatabricksError(
            "La conexion no tiene host/client_id/client_secret (OAuth M2M) configurados."
        )
    try:
        return WorkspaceClient(
            host=host,
            client_id=client_id,
            client_secret=client_secret,
            auth_type="oauth-m2m",
        )
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"No se pudo crear el cliente de Databricks: {exc}") from exc


def test_auth(host: str, client_id: str, client_secret: str) -> None:
    """Confirma que el Service Principal autentica contra el workspace.
    Lanza DatabricksError si falla."""
    client = _client(
        {"host": host, "client_id": client_id, "client_secret": client_secret}
    )
    try:
        client.current_user.me()
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(
            f"No se pudo autenticar el Service Principal contra el workspace: {exc}"
        ) from exc


# --- Warehouses ------------------------------------------------------------


def list_warehouses(connection: dict[str, Any]) -> list[dict[str, Any]]:
    client = _client(connection)
    try:
        result = []
        for wh in client.warehouses.list():
            state = getattr(wh.state, "value", str(wh.state)) if wh.state else "stopped"
            result.append(
                {
                    "id": wh.id,
                    "name": wh.name or wh.id,
                    "size": wh.cluster_size or "",
                    "state": "running" if str(state).upper() == "RUNNING" else "stopped",
                }
            )
        return result
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"No se pudieron listar los warehouses: {exc}") from exc


def resolve_warehouse_id(
    connection: dict[str, Any], warehouse_id: Optional[str] = None
) -> str:
    """Resuelve el warehouse a usar: el explicito, el de la conexion, o el
    primero en estado RUNNING (fallback: el primero que haya)."""
    if warehouse_id:
        return warehouse_id
    if connection.get("warehouse_id"):
        return connection["warehouse_id"]
    warehouses = list_warehouses(connection)
    if not warehouses:
        raise DatabricksError("El workspace no tiene ningun SQL warehouse disponible.")
    running = next((w for w in warehouses if w["state"] == "running"), None)
    return (running or warehouses[0])["id"]


# --- Ejecucion de SQL ------------------------------------------------------


def run_sql(
    connection: dict[str, Any],
    statement: str,
    warehouse_id: Optional[str] = None,
    wait_timeout: str = "30s",
) -> tuple[list[str], list[list[Any]]]:
    """Ejecuta SQL y devuelve (columnas, filas). Lanza DatabricksError si el
    statement falla en el warehouse."""
    client = _client(connection)
    wh_id = resolve_warehouse_id(connection, warehouse_id)
    try:
        resp = client.statement_execution.execute_statement(
            warehouse_id=wh_id,
            statement=statement,
            wait_timeout=wait_timeout,
        )
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"Error ejecutando SQL: {exc}") from exc

    state = getattr(resp.status.state, "value", str(resp.status.state))
    if state == "FAILED":
        err = getattr(resp.status, "error", None)
        message = getattr(err, "message", None) or "SQL FAILED"
        raise DatabricksError(message)

    columns: list[str] = []
    if resp.manifest and resp.manifest.schema and resp.manifest.schema.columns:
        columns = [c.name for c in resp.manifest.schema.columns]
    rows: list[list[Any]] = []
    if resp.result and resp.result.data_array:
        rows = [list(r) for r in resp.result.data_array]
    return columns, rows


def run_sql_dicts(
    connection: dict[str, Any],
    statement: str,
    warehouse_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    columns, rows = run_sql(connection, statement, warehouse_id)
    return [dict(zip(columns, row)) for row in rows]


def scalar(
    connection: dict[str, Any],
    statement: str,
    warehouse_id: Optional[str] = None,
) -> Any:
    _, rows = run_sql(connection, statement, warehouse_id)
    if not rows or not rows[0]:
        return None
    return rows[0][0]


# --- Metastore (tablas, esquema, preview) ----------------------------------


def _parts(full_name: str) -> tuple[str, str, str]:
    segments = full_name.split(".")
    if len(segments) != 3:
        raise DatabricksError(
            f"Nombre de tabla no cualificado (se espera catalog.schema.table): {full_name}"
        )
    return segments[0], segments[1], segments[2]


def _quote_ident(name: str) -> str:
    """Cita un identificador con backticks para SHOW ... IN. Escapa backticks
    internos duplicandolos (regla de Databricks SQL)."""
    return "`" + name.replace("`", "``") + "`"


def list_catalogs(connection: dict[str, Any], warehouse_id: Optional[str] = None) -> list[str]:
    """Todos los catalogos visibles para el Service Principal (SHOW CATALOGS)."""
    _, rows = run_sql(connection, "SHOW CATALOGS", warehouse_id)
    # SHOW CATALOGS devuelve una sola columna (catalog). Tomamos row[0].
    return sorted(str(r[0]) for r in rows if r)


def list_schemas(
    connection: dict[str, Any], catalog: str, warehouse_id: Optional[str] = None
) -> list[str]:
    """Esquemas (databases) de un catalogo (SHOW SCHEMAS IN <catalog>)."""
    if not catalog:
        raise DatabricksError("Falta el catalogo para listar esquemas.")
    _, rows = run_sql(connection, f"SHOW SCHEMAS IN {_quote_ident(catalog)}", warehouse_id)
    # SHOW SCHEMAS devuelve una columna (databaseName). Tomamos row[0].
    return sorted(str(r[0]) for r in rows if r)


def list_tables(
    connection: dict[str, Any],
    catalog: str,
    schema: str,
    warehouse_id: Optional[str] = None,
) -> list[str]:
    """Nombres completos (catalog.schema.table) de un esquema concreto
    (SHOW TABLES IN <catalog>.<schema>)."""
    if not catalog or not schema:
        raise DatabricksError("Faltan catalogo/esquema para listar tablas.")
    _, rows = run_sql(
        connection,
        f"SHOW TABLES IN {_quote_ident(catalog)}.{_quote_ident(schema)}",
        warehouse_id,
    )
    # SHOW TABLES devuelve (database, tableName, isTemporary). tableName = row[1].
    names = [str(r[1]) for r in rows if len(r) >= 2]
    return sorted(f"{catalog}.{schema}.{name}" for name in names)


def get_table_schema(
    connection: dict[str, Any], full_name: str, warehouse_id: Optional[str] = None
) -> dict[str, Any]:
    catalog, schema, table = _parts(full_name)
    col_query = (
        f"SELECT column_name, full_data_type, is_nullable "
        f"FROM {catalog}.information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}' "
        f"ORDER BY ordinal_position"
    )
    col_rows = run_sql_dicts(connection, col_query, warehouse_id)

    # Claves primarias/foráneas declaradas (best-effort: Unity Catalog las
    # soporta pero muchas tablas no las declaran; si la consulta falla o no
    # hay constraints, simplemente no se marcan claves).
    pk_cols, fk_cols = _table_keys(connection, catalog, schema, table, warehouse_id)

    columns = [
        {
            "name": r["column_name"],
            "data_type": r["full_data_type"],
            "nullable": str(r["is_nullable"]).upper() == "YES",
            "is_primary_key": r["column_name"] in pk_cols,
            "is_foreign_key": r["column_name"] in fk_cols,
        }
        for r in col_rows
    ]
    row_count = None
    try:
        row_count = int(scalar(connection, f"SELECT COUNT(*) FROM {full_name}", warehouse_id))
    except DatabricksError:
        row_count = None
    return {"full_name": full_name, "row_count": row_count, "columns": columns}


def _table_keys(
    connection: dict[str, Any],
    catalog: str,
    schema: str,
    table: str,
    warehouse_id: Optional[str] = None,
) -> tuple[set[str], set[str]]:
    """Devuelve (columnas PK, columnas FK) declaradas para una tabla. Best-effort:
    ante cualquier error devuelve conjuntos vacíos (no rompe el esquema)."""
    query = (
        f"SELECT kcu.column_name, tc.constraint_type "
        f"FROM {catalog}.information_schema.table_constraints tc "
        f"JOIN {catalog}.information_schema.key_column_usage kcu "
        f"  ON tc.constraint_catalog = kcu.constraint_catalog "
        f"  AND tc.constraint_schema = kcu.constraint_schema "
        f"  AND tc.constraint_name = kcu.constraint_name "
        f"WHERE tc.table_schema = '{schema}' AND tc.table_name = '{table}' "
        f"  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')"
    )
    pk: set[str] = set()
    fk: set[str] = set()
    try:
        for r in run_sql_dicts(connection, query, warehouse_id):
            col = r.get("column_name")
            if not col:
                continue
            if r.get("constraint_type") == "PRIMARY KEY":
                pk.add(col)
            elif r.get("constraint_type") == "FOREIGN KEY":
                fk.add(col)
    except DatabricksError:
        pass
    return pk, fk


def table_exists(
    connection: dict[str, Any], full_name: str, warehouse_id: Optional[str] = None
) -> bool:
    catalog, schema, table = _parts(full_name)
    query = (
        f"SELECT COUNT(*) FROM {catalog}.information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}'"
    )
    return int(scalar(connection, query, warehouse_id) or 0) > 0


def preview_rows(
    connection: dict[str, Any],
    full_name: str,
    limit: int = 10,
    warehouse_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    return run_sql_dicts(
        connection, f"SELECT * FROM {full_name} LIMIT {int(limit)}", warehouse_id
    )


# --- Jobs y Lakeflow Pipelines (nodo Pipeline) -----------------------------


def _host(connection: dict[str, Any]) -> str:
    return str(connection.get("host", "")).rstrip("/")


def list_jobs(connection: dict[str, Any]) -> list[dict[str, Any]]:
    """Jobs del workspace con sus parámetros (Job Parameters)."""
    client = _client(connection)
    host = _host(connection)
    out: list[dict[str, Any]] = []
    try:
        for job in client.jobs.list():
            settings = getattr(job, "settings", None)
            name = getattr(settings, "name", None) or str(job.job_id)
            # jobs.list() devuelve un `settings` RESUMIDO que NO incluye los
            # Job Parameters; hay que pedir el job completo con jobs.get().
            params = []
            try:
                full = client.jobs.get(job_id=job.job_id)
                full_settings = getattr(full, "settings", None)
                for p in getattr(full_settings, "parameters", None) or []:
                    params.append(
                        {"name": p.name, "default": getattr(p, "default", None)}
                    )
                name = getattr(full_settings, "name", None) or name
            except Exception:  # noqa: BLE001
                pass
            out.append(
                {
                    "job_id": str(job.job_id),
                    "name": name,
                    "parameters": params,
                    "last_run_summary": None,
                    "workspace_url": f"{host}/jobs/{job.job_id}",
                }
            )
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"No se pudieron listar los jobs: {exc}") from exc
    return out


def _guess_input_key(config: dict[str, Any]) -> Optional[str]:
    for key in config:
        kl = key.lower()
        if "input" in kl or "source" in kl or ("table" in kl and "output" not in kl):
            return key
    return None


def list_pipelines(connection: dict[str, Any]) -> list[dict[str, Any]]:
    """Lakeflow (DLT) pipelines con su diccionario `configuration`."""
    client = _client(connection)
    host = _host(connection)
    out: list[dict[str, Any]] = []
    try:
        for p in client.pipelines.list_pipelines():
            config: dict[str, Any] = {}
            input_key = None
            try:
                spec = client.pipelines.get(pipeline_id=p.pipeline_id).spec
                if spec and spec.configuration:
                    config = dict(spec.configuration)
                    input_key = _guess_input_key(config)
            except Exception:  # noqa: BLE001
                pass
            out.append(
                {
                    "pipeline_id": p.pipeline_id,
                    "name": getattr(p, "name", None) or p.pipeline_id,
                    "configuration": config,
                    "input_config_key": input_key,
                    "last_run_summary": None,
                    "workspace_url": f"{host}/pipelines/{p.pipeline_id}",
                }
            )
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"No se pudieron listar los pipelines: {exc}") from exc
    return out


def verify_resource(
    connection: dict[str, Any], kind: str, resource_id: str
) -> dict[str, Any]:
    if not resource_id:
        return {"exists": False, "message": "No se seleccionó ningún recurso."}
    client = _client(connection)
    try:
        if kind == "job":
            client.jobs.get(job_id=int(resource_id))
        else:
            client.pipelines.get(pipeline_id=resource_id)
        return {"exists": True, "message": "El recurso existe y es accesible."}
    except Exception as exc:  # noqa: BLE001
        label = "job" if kind == "job" else "pipeline"
        return {"exists": False, "message": f'No se encontró el {label} "{resource_id}": {exc}'}


def run_pipeline(
    connection: dict[str, Any],
    kind: str,
    resource_id: str,
    input_table: Optional[str] = None,
    params: Optional[dict[str, Any]] = None,
    timeout_s: int = 300,
) -> dict[str, Any]:
    """Ejecuta un Job (run_now con job_parameters) o un Lakeflow Pipeline
    (start_update + polling). Devuelve el mensaje LITERAL de Databricks."""
    import time
    from datetime import timedelta

    client = _client(connection)
    params = {k: str(v) for k, v in (params or {}).items()}
    logs: list[str] = []

    if kind == "job":
        logs.append(f'Iniciando ejecución del job "{resource_id}"...')
        if input_table:
            logs.append(f"Entrada: {input_table}")
        try:
            waiter = client.jobs.run_now(
                job_id=int(resource_id), job_parameters=params or None
            )
            run = waiter.result(timeout=timedelta(seconds=timeout_s))
        except Exception as exc:  # noqa: BLE001
            raise DatabricksError(f"Error ejecutando el job: {exc}") from exc

        state = getattr(run, "state", None)
        result_state = getattr(getattr(state, "result_state", None), "value", None)
        state_message = getattr(state, "state_message", "") or ""
        success = result_state == "SUCCESS"
        message = (
            f"Run finished with result_state {result_state}."
            + (f" {state_message}" if state_message else "")
        )
        logs.append(message)
        output_table = (
            params.get("output_table")
            or params.get("output")
            or params.get("target_table")
            or ""
        )
        return {
            "run_id": str(getattr(run, "run_id", "")),
            "status": "success" if success else "failed",
            "logs": logs,
            "output_table": output_table,
            "databricks_message": message,
        }

    # --- Lakeflow Pipeline ---
    logs.append(f'Disparando update del pipeline "{resource_id}"...')
    try:
        # Inyectar params en la `configuration` del pipeline (los DLT no reciben
        # params por-ejecución: hay que actualizar la definición). Reenviamos el
        # spec COMPLETO (as_dict) por la API cruda para no perder campos, y solo
        # si algún valor cambia respecto a la config actual (así, si el usuario
        # ya los dejó como default, ni tocamos nada -> sin aviso).
        if params:
            try:
                current = client.pipelines.get(pipeline_id=resource_id)
                settings = current.spec.as_dict() if current.spec else {}
                current_config = dict(settings.get("configuration") or {})
                needs_update = any(
                    str(current_config.get(k)) != str(v) for k, v in params.items()
                )
                if needs_update:
                    settings["configuration"] = {**current_config, **params}
                    settings.pop("id", None)
                    client.api_client.do(
                        "PUT", f"/api/2.0/pipelines/{resource_id}", body=settings
                    )
                    logs.append(f"Parámetros aplicados: {params}")
                else:
                    logs.append("Los parámetros ya coinciden con la config del pipeline.")
            except Exception as exc:  # noqa: BLE001
                logs.append(
                    f"Aviso: no se pudieron aplicar los parámetros ({exc}); "
                    "se ejecuta con la config actual."
                )

        update = client.pipelines.start_update(pipeline_id=resource_id)
        update_id = update.update_id
        deadline = time.time() + timeout_s
        state_val = "UNKNOWN"
        while time.time() < deadline:
            upd = client.pipelines.get_update(
                pipeline_id=resource_id, update_id=update_id
            ).update
            state_val = getattr(getattr(upd, "state", None), "value", str(upd.state))
            if state_val in ("COMPLETED", "FAILED", "CANCELED"):
                break
            time.sleep(4)
    except Exception as exc:  # noqa: BLE001
        raise DatabricksError(f"Error ejecutando el pipeline: {exc}") from exc

    success = state_val == "COMPLETED"
    message = f"Update {state_val} (pipeline {resource_id})."
    logs.append(message)
    return {
        "run_id": str(update_id),
        "status": "success" if success else "failed",
        "logs": logs,
        "output_table": params.get("output_table") or params.get("output") or "",
        "databricks_message": message,
    }
