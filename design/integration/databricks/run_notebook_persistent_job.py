import os
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import (
    JobParameterDefinition,
    NotebookTask,
    Task,
)
from dotenv import load_dotenv

_ = load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

NOTEBOOK_PATH = "/Workspace/Shared/New Notebook 2026-07-05 14:51:26"

created_job = w.jobs.create(
    name="quala-nodo-transformacion-ventas",
    tasks=[
        Task(
            task_key="transformar_ventas",
            notebook_task=NotebookTask(
                notebook_path=NOTEBOOK_PATH,
                base_parameters={
                    "input_table": "{{job.parameters.input_table}}",
                    "output_table": "{{job.parameters.output_table}}",
                    "umbral_cantidad": "{{job.parameters.umbral_cantidad}}",
                },
            ),
        )
    ],
    parameters=[
        JobParameterDefinition(
            name="input_table", default="workspace.sandbox.ventas_raw"
        ),
        JobParameterDefinition(
            name="output_table", default="workspace.sandbox.ventas_procesadas"
        ),
        JobParameterDefinition(name="umbral_cantidad", default="2"),
    ],
)

print(f"Job creado con job_id: {created_job.job_id}")

JOB_ID = created_job.job_id  # o pega el número directamente

run = w.jobs.run_now(
    job_id=JOB_ID,
    job_parameters={
        "input_table": "workspace.sandbox.ventas_raw",
        "output_table": "workspace.sandbox.ventas_procesadas",
        "umbral_cantidad": "4",
    },
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
