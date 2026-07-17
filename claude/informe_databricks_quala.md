# Informe Tecnico: Integracion Databricks para Quala
## Documento de contexto para agentes de IA - Continuidad de desarrollo

Fecha de elaboracion: 2026-07-05
Proposito: Este documento resume toda la investigacion practica realizada sobre la integracion entre la aplicacion Quala y Databricks, con el objetivo de instruir a otros agentes de IA (o desarrolladores) que continuen el desarrollo del backend de orquestacion de grafos de nodos.

---

## 1. CONTEXTO DEL PROYECTO

Quala es una aplicacion que permite a usuarios construir grafos visuales de nodos, donde cada nodo representa una unidad de procesamiento de datos ejecutada remotamente en la cuenta de Databricks del propio usuario. La aplicacion NO crea infraestructura en Databricks (notebooks, jobs, pipelines) en nombre del usuario -- el usuario debe haber definido previamente estos recursos en su workspace. El rol del backend de Quala es:

1. Autenticarse contra el workspace de Databricks del usuario
2. Leer/inspeccionar recursos ya existentes (notebooks, jobs, pipelines) para construir formularios dinamicos de configuracion
3. Disparar ejecuciones remotas de esos recursos con parametros definidos por el usuario en el grafo
4. Hacer polling del estado de ejecucion y capturar resultados/errores
5. Ejecutar validaciones de reglas de negocio (generadas dinamicamente, ej. via IA) sobre las tablas de salida

---

## 2. AUTENTICACION (Bloque 1) - COMPLETADO

### Metodo elegido: OAuth M2M (Machine-to-Machine) con Service Principal

- Se crea un Service Principal en el workspace de Databricks (no un usuario humano)
- Se generan `client_id` y `client_secret` para ese Service Principal
- La conexion se hace asi:

```python
from databricks.sdk import WorkspaceClient

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)
```

### Por que OAuth M2M y no Personal Access Token (PAT)
- PAT esta ligado a una cuenta humana (riesgo si el usuario se va o desactiva su cuenta)
- OAuth M2M usa una identidad de servicio propia, ideal para automatizacion backend
- Recomendacion: cada usuario final de Quala deberia tener/crear su propio Service Principal en su Databricks, y Quala almacena esas credenciales de forma segura (nunca en texto plano, usar secret manager)

### Errores comunes ya diagnosticados
- Host mal formado (debe incluir `https://` y el dominio completo tipo `dbc-XXXXXXXX-XXXX.cloud.databricks.com`)
- Conflicto entre PAT y OAuth si ambos estan configurados simultaneamente en variables de entorno
- Credenciales no cargadas correctamente (usar `python-dotenv` y verificar con `print(w)` que la conexion se establecio)

### Permisos necesarios sobre Unity Catalog
- El Service Principal necesita `GRANT USE CATALOG`, `USE SCHEMA`, `CREATE TABLE`, `SELECT` sobre los catalogos/esquemas relevantes
- Estos GRANTs se hacen una vez desde la UI (con un usuario admin) o via SQL:
```sql
GRANT ALL PRIVILEGES ON SCHEMA workspace.sandbox TO `<service-principal-client-id>`;
```

---

## 3. NOTEBOOKS Y PARAMETRIZACION (Bloque 2) - COMPLETADO

### dbutils.widgets
Widgets son la forma de parametrizar notebooks, exponen inputs editables en la UI del notebook y tambien via API.

```python
dbutils.widgets.text("input_table", "workspace.sandbox.ventas_raw", "Tabla de entrada")
dbutils.widgets.text("output_table", "workspace.sandbox.ventas_procesadas", "Tabla de salida")
dbutils.widgets.text("umbral_cantidad", "2", "Umbral de cantidad")

input_table = dbutils.widgets.get("input_table")
umbral_cantidad = int(dbutils.widgets.get("umbral_cantidad"))  # SIEMPRE llega como string, convertir explicitamente
```

### Tipos de widgets: text, dropdown, combobox, multiselect

### Limitacion clave para el backend
Los valores de un widget NO son inspeccionables facilmente via API si el notebook no ha sido ejecutado dentro de un Job con `Job Parameters` definidos a nivel de Job (ver seccion 4). Un notebook aislado sin estar dentro de un Job no expone facilmente "que parametros espera" de forma programatica -- solo se puede leer el codigo fuente del notebook (via Workspace API `export`) y parsear las llamadas a `dbutils.widgets.text(...)` manualmente (fragil, no recomendado como fuente de verdad).

### Recomendacion para el equipo
Nunca usar notebooks aislados como interfaz de parametros para el backend. Siempre envolver el notebook dentro de un Job con `Job Parameters` explicitos (ver Bloque 3), que si son 100% inspeccionables via API de forma robusta.

---

## 4. JOBS / WORKFLOWS (Bloque 3) - COMPLETADO

### Dos formas de ejecutar: efimero vs persistente

| Patron | Cuando usarlo |
|---|---|
| `jobs.submit()` | Ejecucion puntual sin necesidad de reutilizar la definicion; no aparece en "Jobs & pipelines", solo en "Runs" |
| `jobs.create()` + `jobs.run_now()` | Recurso reutilizable con parametros inspeccionables; ESTE es el patron que debe usar Quala para nodos del grafo |

### Creacion de un Job persistente con Job Parameters inspeccionables

```python
from databricks.sdk.service.jobs import JobParameterDefinition, NotebookTask, Task

created_job = w.jobs.create(
    name="quala-nodo-transformacion-ventas",
    tasks=[
        Task(
            task_key="transformar_ventas",
            notebook_task=NotebookTask(
                notebook_path="/Workspace/Shared/mi_notebook",
                base_parameters={
                    "input_table": "{{job.parameters.input_table}}",
                    "output_table": "{{job.parameters.output_table}}",
                    "umbral_cantidad": "{{job.parameters.umbral_cantidad}}",
                },
            ),
        )
    ],
    parameters=[
        JobParameterDefinition(name="input_table", default="workspace.sandbox.ventas_raw"),
        JobParameterDefinition(name="output_table", default="workspace.sandbox.ventas_procesadas"),
        JobParameterDefinition(name="umbral_cantidad", default="2"),
    ],
)
```

El patron `{{job.parameters.NOMBRE}}` es el puente entre el Job Parameter (nivel Job, inspeccionable) y el widget del notebook (nivel tarea).

### Inspeccionar la definicion para construir formularios dinamicos

```python
job_detail = w.jobs.get(job_id=JOB_ID)
for param in job_detail.settings.parameters or []:
    print(f"name={param.name} default={param.default}")
```

Esto es la pieza clave que el backend de Quala debe usar para generar dinamicamente el formulario de configuracion de un nodo tipo "Job", sin hardcodear nada.

### Disparar ejecucion con parametros custom

```python
run = w.jobs.run_now(
    job_id=JOB_ID,
    job_parameters={
        "input_table": "workspace.sandbox.ventas_raw",
        "output_table": "workspace.sandbox.ventas_procesadas",
        "umbral_cantidad": "3",
    },
)
```

### Polling y manejo de errores

```python
while True:
    run_status = w.jobs.get_run(run.run_id)
    state = run_status.state.life_cycle_state
    if state.value in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
        break
    time.sleep(5)

result_state = run_status.state.result_state
if result_state and result_state.value == "FAILED":
    error_message = run_status.state.state_message  # mensaje legible para mostrar al usuario final
    for task_run in run_status.tasks or []:
        print(task_run.task_key, task_run.state.result_state)
```

`state_message` contiene errores legibles (ej. "Table or view not found: ..."), directamente mostrables en el frontend de Quala.

### Otros tipos de tarea disponibles en Jobs (relevantes para nodos futuros)

| Tipo de task | Uso |
|---|---|
| `notebook_task` | Nodos exploratorios/visuales (ya implementado) |
| `spark_python_task` | Scripts .py planos, recibe parametros via `sys.argv`, no via widgets |
| `sql_task` | Query SQL directa contra un warehouse -- ideal para nodos de validacion |
| `python_wheel_task` | Paquetes Python versionados con dependencias propias |
| `run_job_task` | Ejecutar un Job dentro de otro Job -- permite anidar/reutilizar Jobs como nodos |
| `condition_task` | Bifurcacion logica (if/else) entre tareas |
| `for_each_task` | Bucle sobre una tarea con distintos parametros por iteracion |
| `pipeline_task` | Ejecutar un Lakeflow Pipeline como una tarea del Job |

---

## 5. LAKEFLOW PIPELINES / DECLARATIVE PIPELINES (Bloque 4-5) - COMPLETADO

### Diferencia fundamental frente a Jobs

| Aspecto | Job | Pipeline |
|---|---|---|
| Definicion de dependencias | Explicita, tu la defines (task A -> task B) | Implicita, Databricks la infiere del codigo (quien lee la salida de quien) |
| Parametros | `Job Parameters` inspeccionables como lista tipada | `configuration` (diccionario simple) accesible via `spark.conf.get(...)` en el codigo |
| Unidad minima | Una tarea completa | Cada tabla/vista definida con `@dp.table` |
| Update parcial | `run_now(job_parameters={...})` no requiere tocar la definicion | `pipelines.update()` es un PUT COMPLETO -- hay que reenviar TODOS los campos, o falla con error de "UC pipeline to HMS pipeline not allowed" |

### Codigo tipo de un pipeline (usando pyspark.pipelines, alias `dp`)

```python
from pyspark import pipelines as dp
from pyspark.sql.functions import col, current_timestamp

source_table = spark.conf.get("source_table")

@dp.table(name="clientes_bronze")
def clientes_bronze():
    return spark.read.table(source_table).withColumn("loaded_at", current_timestamp())

@dp.table(name="clientes_resumen")
def clientes_resumen():
    df = spark.read.table("clientes_bronze")  # <- ESTO crea la arista del grafo automaticamente
    return df.groupBy("ciudad").count()
```

REGLA CRITICA: las funciones decoradas NUNCA deben usar `collect()`, `count()` (sobre el resultado final), `toPandas()`, `save()`, `saveAsTable()` ni `start()` -- Databricks ejecuta estas funciones multiples veces durante planificacion. Solo deben retornar un DataFrame.

### Creacion de un pipeline (IMPORTANTE: quien lo crea es el owner)

```python
from databricks.sdk.service.pipelines import PipelineLibrary, NotebookLibrary

created_pipeline = w.pipelines.create(
    name="quala-pipeline-nodo",
    catalog="workspace",
    target="sandbox",
    libraries=[PipelineLibrary(notebook=NotebookLibrary(path="/Workspace/Shared/mi_pipeline_notebook"))],
    serverless=True,
    continuous=False,
    configuration={"source_table": "workspace.default.clientes"},
)
```

### LECCION CRITICA DE PERMISOS (ya resuelta, documentar para evitar repetir el error)

El `event_log` de un pipeline (necesario para leer lineage y expectations) SOLO puede ser consultado por el OWNER del pipeline. Si un usuario humano crea el pipeline manualmente en la UI y luego el Service Principal intenta leer su event_log, falla con:
```
PERMISSION_DENIED: User is missing required privileges to access this table from an Assigned cluster.
```

Cambiar el owner de un pipeline ya creado requiere ser Metastore Admin (rol de administracion de cuenta separado del admin de workspace), que frecuentemente NO esta disponible en Free Edition ni es trivial de conseguir.

SOLUCION DEFINITIVA: el pipeline debe ser CREADO directamente por el Service Principal via API (`w.pipelines.create(...)`), nunca por un humano en la UI y transferido despues. Asi el SP nace siendo el owner nativo sin friccion.

### Actualizar parametros de un pipeline existente (cuidado con el PUT completo)

```python
# INCORRECTO -- borra el resto de la definicion:
w.pipelines.update(pipeline_id=PIPELINE_ID, configuration={"source_table": "nueva_tabla"})

# CORRECTO -- reenviar TODA la definicion:
w.pipelines.update(
    pipeline_id=PIPELINE_ID,
    name=pipeline.name,
    catalog=pipeline.spec.catalog,
    target=pipeline.spec.target,
    libraries=pipeline.spec.libraries,
    serverless=pipeline.spec.serverless,
    continuous=pipeline.spec.continuous,
    configuration={"source_table": "nueva_tabla"},
)
```

REGLA GENERAL PARA EL BACKEND: siempre que un endpoint sea PUT (reemplazo completo), hacer GET primero, fusionar los cambios sobre el objeto completo, y enviar el PUT con todos los campos. Nunca enviar solo los campos que cambian.

### Disparar ejecucion y polling

```python
update = w.pipelines.start_update(pipeline_id=PIPELINE_ID)
while True:
    upd = w.pipelines.get_update(pipeline_id=PIPELINE_ID, update_id=update.update_id)
    if upd.update.state.value in ("COMPLETED", "FAILED", "CANCELED"):
        break
    time.sleep(5)
```

### Extraer lineage (entradas/salidas por nodo) -- CLAVE para el grafo de Quala

El event_log expone automaticamente el mapeo "salida -> entradas" de cada tabla/vista, sin que el backend tenga que construirlo manualmente (a diferencia de Jobs, donde el input/output se define a mano en parametros):

```sql
WITH latest_update AS (
    SELECT origin.update_id AS id FROM event_log('{PIPELINE_ID}')
    WHERE event_type = 'create_update' ORDER BY timestamp DESC LIMIT 1
)
SELECT
    details:flow_definition.output_dataset as output_dataset,
    details:flow_definition.input_datasets as input_datasets
FROM event_log('{PIPELINE_ID}'), latest_update
WHERE event_type = 'flow_definition' AND origin.update_id = latest_update.id
```

Resultado tipico:
```
Salida: workspace.sandbox.clientes_bronze  <-  Entradas: None
Salida: workspace.sandbox.clientes_resumen  <-  Entradas: ["workspace.sandbox.clientes_bronze"]
```

### Extraer calidad de datos (Expectations) si el pipeline las define

```sql
-- (dentro del mismo WITH latest_update)
SELECT
    row_expectations.dataset,
    row_expectations.name as expectation,
    SUM(row_expectations.passed_records) as passing,
    SUM(row_expectations.failed_records) as failing
FROM (
    SELECT explode(from_json(details:flow_progress.data_quality.expectations,
        "array<struct<name: string, dataset: string, passed_records: int, failed_records: int>>")) row_expectations
    FROM event_log('{PIPELINE_ID}'), latest_update
    WHERE event_type = 'flow_progress' AND origin.update_id = latest_update.id
) t
GROUP BY row_expectations.dataset, row_expectations.name
```

### Decision de arquitectura: Expectations nativas vs validacion SQL propia de Quala

RECOMENDACION: NO migrar la logica de validacion de reglas de negocio de Quala a Expectations nativas de DLT. Razones:
1. Expectations vive acoplada al codigo Python/SQL del pipeline (decoradores), mientras Quala genera SQL dinamicamente desde reglas en lenguaje natural -- duplicar logica en dos sistemas es mantenimiento redundante
2. El enfoque de Quala (query SQL de validacion post-ejecucion via Statement Execution API) funciona igual sobre salidas de Jobs O Pipelines, unificando el codigo de validacion
3. Expectations brilla en streaming continuo/pipelines con muchas tablas interdependientes; el caso de Quala es mas bien "un nodo, una transformacion, una validacion puntual"

Mantener Expectations como opcion avanzada opcional, no como reemplazo del sistema de validacion propio.

---

## 6. VALIDACION SOBRE LA TABLA DE SALIDA (patron unificado Jobs + Pipelines)

Independientemente de si el nodo es un Job o un Pipeline, la validacion final de reglas de negocio se hace igual, via Statement Execution API contra la tabla de salida:

```python
resp = w.statement_execution.execute_statement(
    warehouse_id=WAREHOUSE_ID,
    statement=f"SELECT COUNT(*) as filas_invalidas FROM {output_table} WHERE <regla_de_negocio>",
    wait_timeout="30s",
)
filas_invalidas = resp.result.data_array[0][0]
```

Este es el patron que el motor de reglas de negocio de Quala (generador de SQL via IA) debe usar como capa final, sin importar el origen de los datos.

---

## 7. MANEJO DE RECURSOS INEXISTENTES O DESACTUALIZADOS (critico para produccion)

Quala NUNCA crea recursos en Databricks en nombre del usuario. El usuario configura sus nodos apuntando a recursos (notebooks/jobs/pipelines) que el mismo definio previamente en su Databricks. Esto implica que el backend debe validar SIEMPRE antes de ejecutar, nunca asumir que el recurso sigue existiendo.

### Validar existencia antes de ejecutar

```python
from databricks.sdk.errors import ResourceDoesNotExist

def validar_recurso_existe(w, tipo: str, identificador: str) -> tuple[bool, str]:
    try:
        if tipo == "job":
            w.jobs.get(job_id=identificador)
        elif tipo == "pipeline":
            w.pipelines.get(pipeline_id=identificador)
        elif tipo == "notebook":
            w.workspace.get_status(path=identificador)
        return True, ""
    except ResourceDoesNotExist:
        return False, f"El recurso '{identificador}' de tipo '{tipo}' no existe o fue eliminado."
    except Exception as e:
        return False, f"Error inesperado al validar el recurso: {str(e)}"
```

### Validar compatibilidad de parametros (el recurso existe pero cambio de forma)

```python
def validar_parametros_compatibles(w, pipeline_id: str, parametros_esperados: dict) -> list[str]:
    pipeline = w.pipelines.get(pipeline_id=pipeline_id)
    config_actual = pipeline.spec.configuration or {}
    return [k for k in parametros_esperados if k not in config_actual]
```

### Momentos en los que validar (obligatorio implementar los tres)
1. Al guardar la configuracion de un nodo en el grafo (validacion inmediata, feedback en UI)
2. Justo antes de cada ejecucion en runtime (revalidar, el usuario pudo borrar el recurso despues)
3. Periodicamente / on-demand desde un boton "Verificar conexiones" en el frontend

### UX recomendada
Mostrar un indicador visual (verde/rojo) en cada nodo del grafo segun el resultado de la ultima validacion, similar a integraciones tipo Zapier/n8n. Si falla, mostrar el mensaje especifico devuelto por Databricks, nunca un error generico.

---

## 8. CONVENCIONES DEL SDK A RECORDAR (evitar errores repetidos)

1. Cada tipo de recurso tiene sus propias clases de permisos tipadas: `JobAccessControlRequest`/`JobPermissionLevel` para Jobs, `PipelineAccessControlRequest`/`PipelinePermissionLevel` para Pipelines, etc. NO existe una clase generica compartida para todos los recursos.

2. Los valores de widgets/parametros SIEMPRE llegan como string, incluso si representan numeros -- conversion explicita obligatoria (`int(...)`, `float(...)`).

3. Distinguir PUT (reemplazo completo, ej. `pipelines.update`) de PATCH-like (actualizacion parcial, ej. `jobs.run_now` con `job_parameters`). Confirmar en la documentacion de cada endpoint antes de asumir comportamiento.

4. El `event_log` de pipelines esta atado al OWNER, no al "Run as" -- si se necesita leer event_log via API, el pipeline debe haber sido creado por la misma identidad que lo consulta.

5. Usar excepciones tipadas del SDK (`databricks.sdk.errors.ResourceDoesNotExist`, etc.) en vez de parsear mensajes de error como strings.

---

## 9. PENDIENTE / SIGUIENTE FASE (Bloque 6 y mas alla)

No explorado aun en profundidad, queda pendiente para siguientes sesiones:

1. Arquitectura multi-usuario: como Quala almacena y aisla de forma segura las credenciales OAuth de cada usuario final (secret manager, encriptado en reposo, rotacion de client_secret)
2. Rate limiting: limites de la API de Databricks (jobs create/hour, statement execution concurrency) y como Quala debe manejar backoff/retry a escala
3. Streaming de logs en tiempo real al frontend durante una ejecucion larga (via Server-Sent Events o WebSocket), en vez de solo polling periodico
4. Job multi-tarea real con dependencias explicitas (ej. notebook_task de transformacion -> sql_task de validacion encadenados en un mismo Job, usando `depends_on` entre tasks)
5. Diseno del mapeo generico "tipo de nodo del grafo de Quala" -> "tipo de task/recurso de Databricks", para que el backend sea agnostico de si el usuario conecto un Job, un Pipeline, o un script suelto

---

## 10. ARCHIVOS DE REFERENCIA GENERADOS DURANTE ESTA SESION

- `oauth_full_flow.py`: conexion + creacion/reutilizacion de Job persistente + inspeccion + disparo + polling + manejo de errores
- `pipeline_full_flow.py`: conexion + inspeccion de parametros de pipeline + update seguro + disparo + polling + lineage + expectations + validacion de negocio
- `create_pipeline_as_sp.py`: patron correcto para crear un pipeline con el Service Principal como owner nativo desde el origen
