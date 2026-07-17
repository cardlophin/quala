import os

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

_ = load_dotenv()

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "no-host")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "no-token")

w = WorkspaceClient(host=DATABRICKS_HOST, token=DATABRICKS_TOKEN)

for p in w.pipelines.list_pipelines():
    print(f"id={p.pipeline_id} | name={p.name}")
    print(p)
