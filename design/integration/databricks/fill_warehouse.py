import os

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

_ = load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

WAREHOUSE_ID = "506a838a6070648f"  # tu Serverless Starter Warehouse


def run_sql(statement: str, wait_seconds: int = 30):
    resp = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=statement,
        wait_timeout="30s",
    )
    print(
        f"Statement ID: {resp.statement_id} | Status: {resp.status.state if resp.status else 'no status'}"
    )
    return resp


print("=== 1. Creando esquema sandbox ===")
run_sql("CREATE SCHEMA IF NOT EXISTS workspace.sandbox")

print("\n=== 2. Creando tabla de entrada (ventas sintéticas) ===")
run_sql("""
CREATE OR REPLACE TABLE workspace.sandbox.ventas_raw (
    id INT,
    producto STRING,
    categoria STRING,
    cantidad INT,
    precio_unitario DOUBLE,
    fecha DATE
)
""")

print("\n=== 3. Insertando datos sintéticos ===")
run_sql("""
INSERT INTO workspace.sandbox.ventas_raw VALUES
    (1, 'Teclado', 'Electronica', 3, 45.50, '2026-01-05'),
    (2, 'Monitor', 'Electronica', 1, 210.00, '2026-01-06'),
    (3, 'Silla', 'Mobiliario', 2, 120.00, '2026-02-01'),
    (4, 'Mesa', 'Mobiliario', 1, 300.00, '2026-02-10'),
    (5, 'Mouse', 'Electronica', 5, 15.75, '2026-03-01'),
    (6, 'Lampara', 'Mobiliario', 4, 25.00, '2026-03-15'),
    (7, 'Auriculares', 'Electronica', 2, 60.00, '2026-04-02'),
    (8, 'Estanteria', 'Mobiliario', 1, 150.00, '2026-04-20')
""")

print("\n=== 4. Verificando datos ===")
result = run_sql("SELECT * FROM workspace.sandbox.ventas_raw ORDER BY id")
if result.result and result.result.data_array:
    for row in result.result.data_array:
        print(row)
