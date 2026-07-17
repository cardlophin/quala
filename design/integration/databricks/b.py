import os
import time

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

_ = load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

print(f"Conectado: {w}")

WAREHOUSE_ID = "506a838a6070648f"
PIPELINE_ID = "ac2f040d-8424-4d26-95c3-ca7698f0076c"


def run_sql(statement: str, wait_seconds: str = "30s"):
    resp = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=statement,
        wait_timeout=wait_seconds,
    )
    if resp.status.state.value == "FAILED":
        print(f"  ERROR SQL: {resp.status.error}")
    return resp


print("\n=== DEFINICION DEL PIPELINE ===")
pipeline = w.pipelines.get(pipeline_id=PIPELINE_ID)
print(f"Nombre: {pipeline.name}")
print(f"Estado actual: {pipeline.state}")
print(f"Catalogo destino: {pipeline.spec.catalog}")
print(f"Schema destino: {pipeline.spec.target}")
print(f"Creador: {pipeline.creator_user_name}")

print("\n=== PARAMETROS (configuration) DEL PIPELINE ===")
config = pipeline.spec.configuration or {}
for key, value in config.items():
    print(f"- {key}: {value}")

# ============================================================
# ACTUALIZAR PARAMETROS PRESERVANDO EL RESTO DE LA DEFINICION
# ============================================================
NUEVOS_PARAMETROS = {
    "source_table": "workspace.default.clientes",
}

w.pipelines.update(
    pipeline_id=PIPELINE_ID,
    name=pipeline.name,
    catalog=pipeline.spec.catalog,
    target=pipeline.spec.target,
    libraries=pipeline.spec.libraries,
    serverless=pipeline.spec.serverless,
    continuous=pipeline.spec.continuous,
    configuration=NUEVOS_PARAMETROS,
)
print(f"\nParametros actualizados: {NUEVOS_PARAMETROS}")

print("\n=== DISPARANDO ACTUALIZACION ===")
update = w.pipelines.start_update(pipeline_id=PIPELINE_ID)
print(f"Update ID: {update.update_id}")

while True:
    upd = w.pipelines.get_update(pipeline_id=PIPELINE_ID, update_id=update.update_id)
    state = upd.update.state
    print(f"Estado: {state}")
    if state.value in ("COMPLETED", "FAILED", "CANCELED"):
        break
    time.sleep(5)

print(f"\nResultado final: {upd.update.state}")
if upd.update.state.value == "FAILED":
    print(f"Causa del error: {upd.update.cause}")

print("\n=== LINEAGE DE NODOS (entradas -> salidas) ===")
lineage_query = f"""
WITH latest_update AS (
    SELECT origin.update_id AS id FROM event_log('{PIPELINE_ID}')
    WHERE event_type = 'create_update' ORDER BY timestamp DESC LIMIT 1
)
SELECT
    details:flow_definition.output_dataset as output_dataset,
    details:flow_definition.input_datasets as input_datasets
FROM event_log('{PIPELINE_ID}'), latest_update
WHERE event_type = 'flow_definition' AND origin.update_id = latest_update.id
"""
resp = run_sql(lineage_query)
if resp.result and resp.result.data_array:
    for row in resp.result.data_array:
        print(f"Salida: {row[0]}  <-  Entradas: {row[1]}")
else:
    print("Sin datos de lineage.")

print("\n=== EXPECTATIONS (calidad de datos) POR NODO ===")
expectations_query = f"""
WITH latest_update AS (
    SELECT origin.update_id AS id FROM event_log('{PIPELINE_ID}')
    WHERE event_type = 'create_update' ORDER BY timestamp DESC LIMIT 1
),
expectations_parsed AS (
    SELECT
        explode(
            from_json(
                details:flow_progress.data_quality.expectations,
                "array<struct<name: string, dataset: string, passed_records: int, failed_records: int>>"
            )
        ) row_expectations
    FROM event_log('{PIPELINE_ID}'), latest_update
    WHERE event_type = 'flow_progress' AND origin.update_id = latest_update.id
)
SELECT
    row_expectations.dataset as dataset,
    row_expectations.name as expectation,
    SUM(row_expectations.passed_records) as passing,
    SUM(row_expectations.failed_records) as failing
FROM expectations_parsed
GROUP BY row_expectations.dataset, row_expectations.name
"""
resp = run_sql(expectations_query)
if resp.result and resp.result.data_array:
    for row in resp.result.data_array:
        print(f"Tabla: {row[0]} | Regla: {row[1]} | OK: {row[2]} | FALLOS: {row[3]}")
else:
    print("Sin expectations definidas en este pipeline.")

print("\n=== VALIDACION DE NEGOCIO (ejemplo) ===")
OUTPUT_TABLE = f"{pipeline.spec.catalog}.{pipeline.spec.target}.clientes_resumen"
validation_query = f"""
SELECT COUNT(*) as filas_invalidas
FROM {OUTPUT_TABLE}
WHERE total_clientes <= 0 OR clientes_con_email > total_clientes
"""
resp = run_sql(validation_query)
if resp.result and resp.result.data_array:
    print(
        f"Filas que violan reglas de negocio en {OUTPUT_TABLE}: {resp.result.data_array[0][0]}"
    )
