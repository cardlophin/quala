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

# ============================================================
# BLOQUE 1: Conexión / Autenticación (OAuth M2M)
# ============================================================
w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

print(f"Conectado: {w}")

# ============================================================
# BLOQUE 3: Listar Jobs existentes y evitar duplicados
# ============================================================
JOB_NAME = "quala-nodo-transformacion-ventas"
NOTEBOOK_PATH = "/Workspace/Shared/New Notebook 2026-07-05 14:51:26"

print("\n=== JOBS EXISTENTES ===")
existing_job_id = None
for job in w.jobs.list():
    print(f"job_id={job.job_id} | name={job.settings.name}")
    if job.settings.name == JOB_NAME:
        existing_job_id = job.job_id

# ============================================================
# BLOQUE 3: Crear el Job persistente (solo si no existe ya)
# ============================================================
if existing_job_id:
    JOB_ID = existing_job_id
    print(f"\nReutilizando Job existente: job_id={JOB_ID}")
else:
    created_job = w.jobs.create(
        name=JOB_NAME,
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
    JOB_ID = created_job.job_id
    print(f"\nJob creado: job_id={JOB_ID}")

# ============================================================
# BLOQUE 3: Inspeccionar la definición completa (jobs/get)
# ============================================================
job_detail = w.jobs.get(job_id=JOB_ID)

print(f"\n=== DEFINICION DEL JOB {JOB_ID} ===")
print(f"Nombre: {job_detail.settings.name}")
print(f"Creador: {job_detail.creator_user_name}")

print("\n--- Tareas ---")
for task in job_detail.settings.tasks:
    print(f"- task_key: {task.task_key}")
    if task.notebook_task:
        print(f"  notebook_path: {task.notebook_task.notebook_path}")
        print(f"  base_parameters: {task.notebook_task.base_parameters}")

print("\n--- Job Parameters (para formulario dinamico) ---")
job_params = job_detail.settings.parameters or []
for param in job_params:
    print(f"- name: {param.name} | default: {param.default}")

# ============================================================
# BLOQUE 3: Disparar ejecucion (run_now) con parametros custom
# ============================================================
print("\n=== DISPARANDO EJECUCION ===")
run = w.jobs.run_now(
    job_id=JOB_ID,
    job_parameters={
        "input_table": "workspace.sandbox.ventas_raw",
        "output_table": "workspace.sandbox.ventas_procesadas",
        "umbral_cantidad": "3",
    },
)
print(f"Run ID: {run.run_id}")

# ============================================================
# BLOQUE 3: Polling de estado hasta finalizar
# ============================================================
while True:
    run_status = w.jobs.get_run(run.run_id)
    state = run_status.state.life_cycle_state
    print(f"Estado: {state}")
    if state.value in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
        break
    time.sleep(5)

# ============================================================
# BLOQUE 3: Resultado final y manejo de errores
# ============================================================
result_state = run_status.state.result_state
print(f"\nResultado final: {result_state}")

if result_state and result_state.value == "FAILED":
    print(f"Mensaje de error: {run_status.state.state_message}")
    for task_run in run_status.tasks or []:
        print(f"  Task: {task_run.task_key} | Estado: {task_run.state.result_state}")
else:
    print("Ejecucion completada correctamente.")
