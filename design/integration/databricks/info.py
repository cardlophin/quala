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

print("=== CATÁLOGOS ===")
for cat in w.catalogs.list():
    print(f"- {cat.name}")

print("\n=== ESQUEMAS por catálogo ===")
for cat in w.catalogs.list():
    if cat.name in ("system", "samples"):
        continue
    for schema in w.schemas.list(catalog_name=cat.name):
        print(f"- {cat.name}.{schema.name}")

print("\n=== TABLAS (catalog.schema.table) ===")
for cat in w.catalogs.list():
    if cat.name in ("system", "samples"):
        continue
    for schema in w.schemas.list(catalog_name=cat.name):
        for table in w.tables.list(catalog_name=cat.name, schema_name=schema.name):
            print(f"- {cat.name}.{schema.name}.{table.name} ({table.table_type})")

print("\n=== SQL WAREHOUSES ===")
for wh in w.warehouses.list():
    print(
        f"- {wh.name} | id={wh.id} | state={wh.state} | cluster_size={wh.cluster_size}"
    )

print("\n=== CLUSTERS (compute normal, si existe) ===")
for cl in w.clusters.list():
    print(f"- {cl.cluster_name} | id={cl.cluster_id} | state={cl.state}")

print("\n=== JOBS EXISTENTES ===")
for job in w.jobs.list():
    print(f"- {job.settings.name} | job_id={job.job_id}")

print("\n=== NOTEBOOKS/CARPETAS en el Workspace (raíz) ===")
for obj in w.workspace.list("/"):
    print(f"- {obj.path} ({obj.object_type})")
