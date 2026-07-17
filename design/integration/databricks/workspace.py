import base64
import os

from databricks.sdk import WorkspaceClient
from databricks.sdk.service import workspace
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("DATABRICKS_HOST")
token = os.getenv("DATABRICKS_TOKEN")

w = WorkspaceClient(host=host, token=token)

for p in w.pipelines.list_pipelines():
    print(f"\nPIPELINE: {p.pipeline_id} | {p.name}")

    if not p.pipeline_id:
        continue

    details = w.pipelines.get(p.pipeline_id)
    spec = getattr(details, "spec", None)

    if not spec:
        continue

    print(f"root_path: {spec.root_path}")

    libraries = spec.libraries or []
    for lib in libraries:
        if getattr(lib, "glob", None):
            print(f"glob: {lib.glob.include}")

    try:
        objs = w.workspace.list(spec.root_path, recursive=True)

        for obj in objs:
            path = obj.path
            if not path:
                continue

            if path.endswith(".py") or path.endswith(".sql") or path.endswith(".md"):
                print(f"\nFILE: {path}")

                exported = w.workspace.export(
                    path=path, format=workspace.ExportFormat.SOURCE
                )

                if exported.content:
                    content = base64.b64decode(exported.content).decode("utf-8")
                    print(content[:2000])
                    print("\n--- FILE TRUNCATED ---")
    except Exception as e:
        print(f"Error leyendo archivos de {spec.root_path}: {e}")
