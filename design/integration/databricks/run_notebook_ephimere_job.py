import os
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import NotebookTask, SubmitTask
from dotenv import load_dotenv

_ = load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

NOTEBOOK_PATH = "/Workspace/Shared/New Notebook 2026-07-05 14:51:26"

run = w.jobs.submit(
    run_name="quala-nodo-transformacion-ventas",
    tasks=[
        SubmitTask(
            task_key="transformar_ventas",
            notebook_task=NotebookTask(
                notebook_path=NOTEBOOK_PATH,
                base_parameters={
                    "input_table": "workspace.sandbox.ventas_raw",
                    "output_table": "workspace.sandbox.ventas_procesadas",
                    "umbral_cantidad": "3",
                },
            ),
        )
    ],
)

print(f"Run ID: {run.run_id}")

while True:
    run_status = w.jobs.get_run(run.run_id)
    state = run_status.state.life_cycle_state
    print(f"Estado: {state}")
    if state.value in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
        break
    time.sleep(5)

print(f"Resultado final: {run_status.state.result_state}")
if run_status.state.result_state.value == "FAILED":
    print(f"Error: {run_status.state.state_message}")
