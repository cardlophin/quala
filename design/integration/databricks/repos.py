import os

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    token=os.getenv("DATABRICKS_TOKEN"),
)

repos = list(w.repos.list(path_prefix="/Workspace/"))
print("repos:", repos)

for r in repos:
    print(r.id, r.path, r.url, r.branch)
