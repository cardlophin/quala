# Demo Quala — Calidad de datos de ventas (e‑commerce de moda)

Un recorrido realista de punta a punta que da valor: partimos de **datos
reales de clientes**, generamos **pedidos sintéticos con casos límite a
propósito**, los **transformamos en un pipeline de Databricks** y **validamos
el resultado** contra reglas de negocio. La gracia de la demo: los problemas
que inyectamos en los datos de prueba aparecen detectados al final —
demostrando que el sistema de calidad funciona de extremo a extremo.

## El caso de negocio

Una tienda de moda online quiere una tabla fiable de **ventas enriquecidas**
(pedidos + cliente) para su reporting. Antes de confiar en ella hay que:

1. Validar la **calidad del maestro de clientes** (fuente real).
2. Tener **datos de pedidos de prueba** realistas para ejercitar el pipeline,
   incluyendo casos que deberían fallar.
3. **Transformar** clientes + pedidos en las tablas de negocio.
4. **Validar el resultado**: que el join es íntegro, los importes son
   coherentes y los estados válidos.

## La topología (el grafo del canvas)

```
Fuente de datos (clientes, REAL) ──▶ Validación de origen ──┐
                                                            ├──▶ Pipeline ──▶ Fuente (ventas_enriquecidas) ──▶ Validación final
Fuente de datos (clientes, REAL) ──▶ Generar sintéticos ────┘
        (usada solo como ESQUEMA de referencia)   (pedidos)
```

- La rama de arriba valida el **maestro de clientes** real y lo pasa al pipeline.
- La rama de abajo usa el esquema de clientes como **referencia** para generar
  **pedidos** sintéticos coherentes (con casos límite), que también entran al
  pipeline.
- El pipeline une ambos y escribe el resultado en un **nodo de datos de salida**.
- La **validación final** cuelga de ese nodo de salida.

> Nota: los nombres de columna de abajo son los recomendados. La app detecta
> el esquema real automáticamente al conectar la tabla, así que ajusta los
> textos de las reglas si tu `dq_demo.clientes` usa otros nombres.

---

## Nodo A — Fuente de datos (clientes reales)

- **Tabla**: `workspace.dq_demo.clientes`
- **Esquema esperado**: `cliente_id` (BIGINT, PK), `nombre` (STRING),
  `email` (STRING), `edad` (INT), `ciudad` (STRING).

Este mismo nodo se conecta a DOS destinos: al nodo de Validación de origen y
al nodo Generar sintéticos (como esquema de referencia).

## Nodo B — Validación de origen (calidad del maestro)

En la pestaña **Reglas**, en "Contexto de los datos" pega:

> Maestro de clientes de una tienda de moda online. `cliente_id` es la clave
> primaria. `email` debe ser único y con formato válido. `edad` en años; solo
> se admiten clientes mayores de edad. `ciudad` es española/europea.

Reglas de negocio (una por línea, botón **+ Añadir**), o pulsa
**"Sugerir reglas con IA"** para que las proponga desde el esquema:

1. `cliente_id` debe ser único y no nulo.
2. `email` debe tener formato de correo válido y no estar vacío.
3. `edad` debe ser mayor o igual a 18 y menor o igual a 100.
4. `ciudad` no puede estar vacía.
5. No pueden existir dos clientes con el mismo `email`.

Luego **Generar reglas SQL** → revisa el SQL → **Ejecutar validación**. Esto
mide la calidad real de tu maestro (toast con el score).

## Nodo C — Generar datos sintéticos (pedidos)

Conecta el nodo A (clientes) a la **entrada** de este nodo: su esquema entra
como **referencia** (columnas + claves), no sus datos.

En "Descripción del negocio" pega este prompt de contexto de generación:

> Genera una tabla `pedidos` de una tienda de moda online. Cada pedido
> pertenece a un cliente mediante `cliente_id` (clave foránea hacia el maestro
> de clientes). Campos: `pedido_id` (identificador único tipo UUID),
> `cliente_id`, `fecha_pedido` (fecha del pedido, entre 2023 y hoy), `importe`
> (euros, entre 10 y 400), `estado` (uno de: pendiente, enviado, entregado,
> cancelado, con más peso en "entregado"), `metodo_pago` (tarjeta, paypal o
> transferencia). Genera unas 2000 filas. Incluye casos límite realistas para
> pruebas de calidad: alrededor de un 5% de pedidos con `importe` negativo o
> desorbitado, algún `estado` fuera del catálogo, y algunos `cliente_id` que
> no existen en el maestro (pedidos huérfanos).

En la pestaña **Esquema** ajusta el nº de filas si quieres (p. ej. 2000) y la
semilla. Luego **Generar datos** y revisa el preview.

**Volcar a Databricks** (pestaña "Datos generados"): catálogo `workspace`,
esquema `sandbox`. Esto crea `workspace.sandbox.pedidos` (o el nombre de la
tabla del plan). Renómbrala/úsala como `pedidos_sinteticos` en el pipeline (o
ajusta el widget `pedidos_table`).

> Los casos límite que pides aquí son los que la **validación final** deberá
> cazar. Ese es el "momento demo".

## Nodo D — Pipeline (transformación en Databricks)

El código está en esta misma carpeta:

- **PySpark (recomendado, casa con Job Parameters)**:
  `databricks/quala_transformacion_ventas.py`
- **dbt (alternativa)**: `dbt/models/ventas_enriquecidas.sql` +
  `resumen_clientes.sql` + `sources.yml`

### Opción 1 — Job con notebook PySpark

1. En Databricks: **Workspace → import** el fichero
   `quala_transformacion_ventas.py` como notebook.
2. **Jobs & Pipelines → Create Job**, tarea = ese notebook.
3. En **Job parameters**, declara (esto es lo que Quala lee y mapea):
   - `clientes_table` = `workspace.dq_demo.clientes`
   - `pedidos_table`  = `workspace.sandbox.pedidos_sinteticos`
   - `output_ventas`  = `workspace.sandbox.ventas_enriquecidas`
   - `output_resumen` = `workspace.sandbox.resumen_clientes`
   - `umbral_vip`     = `200`
4. En el **nodo Pipeline de Quala** → pestaña Configuración: "Ejecutar como
   Job" → selecciona `quala_transformacion_ventas`. En **Parámetros**:
   - `clientes_table` → "Desde entrada (nodo)" (la rama de clientes/validación).
   - `pedidos_table`  → "Valor fijo" = la tabla sintética volcada.
   - `output_ventas`  → "Desde salida (nodo)" (se autocompleta con el nodo E).
   - `umbral_vip`     → "Valor fijo" = 200.
5. Conecta las dos ramas de entrada al pipeline y un nodo **Fuente de datos**
   a su salida (nodo E). Ejecuta → el nodo E se autocompleta con
   `ventas_enriquecidas`.

### Opción 2 — dbt

`dbt run` (o una tarea dbt en un Job/Lakeflow) materializa
`ventas_enriquecidas` y `resumen_clientes`. Ajusta catalog/schema en tu
`profiles.yml`/`dbt_project.yml`. Apunta el nodo Pipeline al Job/pipeline dbt.

En ambos casos el resultado son **1..n tablas** (`ventas_enriquecidas` y
`resumen_clientes`).

## Nodo E — Fuente de datos (resultado)

`workspace.sandbox.ventas_enriquecidas`. Se **autocompleta** al ejecutar el
pipeline (o al seleccionar el recurso, desde el default de `output_ventas`).
Columnas: `pedido_id, cliente_id, nombre_cliente, email, ciudad, fecha_pedido,
importe, estado, es_cliente_valido, segmento`.

## Nodo F — Validación final (calidad del resultado)

Conecta el nodo E a este nodo. Contexto de datos:

> Tabla de ventas enriquecidas (pedido + cliente). `es_cliente_valido` indica
> si el pedido referencia a un cliente existente. `estado` ∈ {pendiente,
> enviado, entregado, cancelado}. `importe` en euros.

Reglas de negocio:

1. Todo pedido debe referenciar a un cliente válido: `es_cliente_valido` debe
   ser siempre verdadero (no puede haber pedidos huérfanos).
2. `importe` debe ser mayor que 0 y menor o igual a 400.
3. `estado` solo puede ser: pendiente, enviado, entregado o cancelado.
4. `email` no puede estar vacío y debe tener formato válido.
5. `pedido_id` debe ser único.

**Generar reglas SQL** → **Ejecutar validación**. Aquí es donde aparecen los
problemas inyectados en los pedidos sintéticos (huérfanos, importes fuera de
rango, estados inválidos): el score baja y se listan las filas que incumplen.

---

## Orden de ejecución para la demo

1. **Verificar conexiones** (topbar) — todo en verde.
2. Nodo A: elige `workspace.dq_demo.clientes`.
3. Nodo B: reglas → generar SQL → ejecutar → muestra el score del maestro.
4. Nodo C: conecta A como referencia → pega el prompt → generar plan →
   generar datos → **volcar a Databricks** (`workspace.sandbox`).
5. Nodo D: selecciona el Job, mapea parámetros, conecta entradas + salida →
   **Ejecutar pipeline**. El nodo E se autocompleta.
6. Nodo F: reglas → generar SQL → **Ejecutar validación** → aparecen los
   incumplimientos inyectados.

## Qué contar (el valor)

- **Una sola herramienta** cubre el ciclo: validar origen → generar datos de
  prueba con casos límite → transformar en Databricks → validar resultado.
- **Reglas de negocio en lenguaje natural** que la IA convierte a SQL
  ejecutable contra Databricks real (no mockeado).
- **Datos sintéticos con esquema y relaciones** derivadas de tablas reales,
  con casos límite a propósito para probar el pipeline.
- **Trazabilidad topológica**: entrada → transformación → salida están
  desacopladas y visibles en el grafo; la salida se autocompleta.
- El "cierre": los defectos que inyectamos en el paso 4 aparecen **cazados**
  en el paso 6 — prueba tangible de que la calidad se controla de punta a
  punta.
