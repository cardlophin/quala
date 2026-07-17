# Contexto para trabajar en "quala" (antes "atmira-hackathon")

Vas a editar código en este repo. Antes de tocar nada, lee esto completo: te
ahorra descubrir por prueba y error cosas que ya sabemos (incluyendo un par
de trampas reales que hay en el repo).

## Qué es esto

Proyecto de hackathon: un sistema que convierte una descripción de negocio en
lenguaje natural en un dataset sintético. Tiene dos capas separadas:

1. **Planificación (LLM)**: una descripción de negocio entra, un
   "GenerationPlan" en YAML/JSON sale. Vive en `design/rules/`.
2. **Ejecución (motor determinista, sin LLM)**: ese plan se parsea con
   Pydantic y se ejecuta fila a fila, campo a campo, con generadores puros
   en Python. Vive en `quala/backend/synthetic_generation/`.

El plan es el contrato entre ambas capas. La regla de oro del proyecto:
**el prompt reduce la frecuencia de errores del LLM, pero lo que garantiza
corrección final es la validación/reparación en código (Pydantic +
funciones de reparación), no el prompt.** Si vas a añadir una regla de
negocio nueva, pregúntate primero si se puede reforzar estructuralmente en
`models.py` / un generador, no solo pedirla mejor en el prompt.

También existe `quala/frontend/` (React 19 + Vite, canvas tipo n8n). Es un
subsistema aparte con su propia documentación — **no la necesitas si tu
tarea es sobre generación sintética**: lee `quala/frontend/CONTEXT.md` y
`quala/frontend/HANDOFF.md` solo si tu tarea es sobre el frontend. Hoy corre
contra una mock API (`VITE_USE_MOCK_API=true` en `.env.example`), no está
conectado al motor Python. **No existe backend HTTP real** (no hay
`main.py`/`app.py`/FastAPI montado en ningún sitio, a pesar de que
`fastapi`/`uvicorn` están en las dependencias). Si te piden "conectar
frontend y backend", es trabajo desde cero.

## Mapa de archivos (lo que importa)

```
quala/backend/synthetic_generation/     # EL MOTOR (fuente de verdad de ejecución)
  models.py            # Esquema GenerationPlan (Pydantic) — ESTA es la validación real
  parser.py            # parse_plan(dict) -> GenerationPlan, valida contra models.py
  runner.py            # Runner.run(): ejecuta tablas en execution_order, fila a fila
  registry.py          # mapa type string -> clase generador
  catalogs.py           # CatalogRegistry (para linked_fields/static_catalog)
  constraints.py        # build_constraint + validación post-generación
  edge_cases.py          # mutaciones para dataset "invalid"
  generators/*.py        # un archivo por tipo de generador (14 tipos, ver abajo)
  example/
    generated_plan.json  # plan de ejemplo real (customers/orders), usa el patrón VIEJO
                          # (order_date con rango absoluto, sin parent_field_ref)
    example_usage.py      # ejemplo mínimo de uso del Runner

design/rules/
  generation_system_prompt.txt   # prompt monolítico canónico (YAML) — FUENTE DE VERDAD
  generation_planning.py         # llamada a Gemini + extract/sanitize/apply_repairs
                                  # + una COPIA del esquema Pydantic de models.py
                                  # (¡ver advertencia de duplicación abajo!)
  generate_and_run.py            # script end-to-end: descripción -> LLM -> plan
                                  # -> parse_plan (usa el esquema REAL) -> Runner.run()
                                  # flags: --description "...", --offline-plan ruta.json
  example_plan_with_parent_field_ref.json  # plan de referencia con el patrón NUEVO
  pipeline_output/                # salida de generate_and_run.py (gitignored)

prompts/SYNTHETIC_GENERATION.md   # COPIA exacta de generation_system_prompt.txt
                                  # (el modo "6 fases" en prompts/synthetic_generation/*.txt
                                  # se eliminó a propósito: con los LLM actuales, una sola
                                  # llamada monolítica es suficiente y más simple; si ves
                                  # referencias viejas a "fase1/fase2/..." son de esa época
                                  # ya abandonada)
```

## ⚠️ Trampas conocidas en este repo (léelas antes de buscar por tu cuenta)

1. **El esquema `GenerationPlan` está duplicado en dos archivos**:
   `quala/backend/synthetic_generation/models.py` (el que usa el motor real,
   vía `parser.parse_plan`) y `design/rules/generation_planning.py` (una
   copia local, usada solo para validar lo que devuelve el LLM antes de
   pasarlo al motor). **Si cambias el esquema o añades una validación,
   tienes que tocar los dos archivos o un plan puede validar en uno y
   fallar en el otro.** No hay un tercer sitio: son exactamente estos dos.

2. **El prompt canónico también está duplicado**: `design/rules/generation_system_prompt.txt`
   y `prompts/SYNTHETIC_GENERATION.md` deben tener el mismo contenido. Si
   editas uno, edita el otro (o considera unificarlos con un symlink/import
   si vas a tocar esta zona con frecuencia).

3. **`design/synthetic_generation/CLAUDE.md` está OBSOLETO y es distinto
   al prompt real**: es un prompt de planner más antiguo, en JSON (no YAML),
   con la lista de generadores SIN `parent_field_ref` y sin ninguna de las
   reglas de `row_context`/árbol de decisión cross-table del prompt actual.
   No lo uses como referencia de lo que hace el motor hoy. Si tu agente/IDE
   auto-carga archivos `CLAUDE.md` como contexto de proyecto, este puede
   inyectarte información incorrecta sin que te des cuenta — revísalo con
   cuidado si notas comportamiento raro del LLM planificador.

4. **`quala/backend/agents/planner_agent.py` y
   `quala/backend/agents/validator_agent.py` están completamente vacíos**
   (son placeholders, 1 línea). No asumas que ahí vive lógica real. Parece
   ser la intención futura de mover `generation_planning.py` a una
   arquitectura de agentes, pero no está hecho.

5. **`design/` tiene contenido no relacionado con generación sintética**:
   `design/integration/` (Databricks, git), `design/validation/`
   (validación de reglas SQL contra Databricks), `design/rules/rule_generation.py`
   (traductor de reglas de negocio a SQL vía Ollama), `design/a.py` (script
   suelto de prueba de la API de Gemini). Son partes de otra funcionalidad
   del hackathon (calidad de datos sobre Databricks). No las confundas con
   el pipeline de generación sintética.

6. **No hay suite de tests (pytest)**. La forma de verificar cambios en el
   motor ha sido: escribir un script ad hoc que haga
   `from synthetic_generation.parser import parse_plan` +
   `from synthetic_generation.runner import Runner`, cargar un plan
   (`quala/backend/synthetic_generation/example/generated_plan.json` o
   `design/rules/example_plan_with_parent_field_ref.json`), correr
   `Runner(plan).run()` y revisar `result.validation_report` y algunas filas
   a mano. Sigue ese patrón hasta que exista una suite real.

7. **Los módulos de `synthetic_generation` se importan como paquete raíz
   `synthetic_generation.*`, no como `quala.backend.synthetic_generation.*`.**
   Para ejecutar un script suelto necesitas
   `sys.path.insert(0, "<repo>/quala/backend")` antes de importar (mira
   `design/rules/generate_and_run.py` para el patrón exacto). El
   `pyproject.toml` pide Python `>=3.12`, pero el código en sí también
   corre en 3.10+ (usa uniones `X | None` de PEP 604, no depende de nada
   exclusivo de 3.12).

8. **`google-genai` necesita `httpx[socks]`/`socksio` instalado** si la red
   de tu entorno pasa por un proxy SOCKS (pasó en un sandbox de prueba con
   error `ImportError: socksio`). Si `generate_and_run.py` no logra llamar
   a Gemini por lo que sea, **cae automáticamente** al plan de referencia
   `example_plan_with_parent_field_ref.json` y avisa por consola — no es un
   bug, es el fallback intencional.

## Modelo mental del motor (esto es lo que hay que respetar en cualquier cambio)

- El `Runner` procesa tablas en `runner.execution_order`, y dentro de cada
  tabla genera filas una a una, y dentro de cada fila procesa `fields` EN
  ORDEN. El `row_context` (dict `row` en `runner.py`) de un campo solo
  contiene los campos anteriores de la MISMA fila/MISMA tabla.
- Cruzar de tabla hija a tabla padre solo es posible copiando un ID vía el
  generador `foreign_key`, o — desde hace poco — leyendo cualquier OTRO
  campo ya generado de esa fila padre concreta vía `parent_field_ref` (ver
  sección siguiente). Nunca inventar sintaxis `tabla.campo`: no significa
  nada para el motor.
- Convención de campos auxiliares ocultos: un campo con prefijo `__` (ej.
  `__shipped_date_full`) es un campo real del plan que ayuda a resolver una
  dependencia (típicamente combinado con `nullability`), y SÍ aparece en el
  row_context normal. Es distinto de las claves internas
  `__linked__<catalog>` y `__fk_row__<parent_table>`, que los generadores
  `linked_fields`/`foreign_key` escriben en `row_context` para pasarse
  estado entre sí y que `Runner._strip_internal_keys` borra siempre antes
  de devolver la fila final (nunca deben aparecer en el dataset de salida).
- Vocabulario cerrado de generadores (14): `faker`, `template`, `sequence`,
  `enum`, `numeric_range`, `date_range`, `linked_fields`, `formula`,
  `foreign_key`, `parent_field_ref`, `static_catalog`, `uuid`,
  `boolean_probability`, `nullability`.
- Vocabulario cerrado de constraints (9): `unique`, `not_null`, `regex`,
  `allowed_values`, `min_max`, `start_before_end`, `formula_match`,
  `foreign_key_exists`, `composite_uniqueness`.

## Lo más reciente: el generador `parent_field_ref`

Antes, cualquier relación padre→hijo que no fuera copiar un ID (ej.
"order_date debe ser posterior a registration_date del cliente") se
resolvía con un rango absoluto independiente sin garantía real, documentado
como limitación en `assumptions`. Eso seguía sin resolver la regla de
negocio.

Ahora, si hay un salto DIRECTO de `foreign_key` (un solo salto, no
"abuelos"), se puede usar `parent_field_ref` para leer cualquier otro campo
ya generado de esa fila padre exacta:

```yaml
- name: customer_id
  generator:
    type: foreign_key
    config: {parent_table: customers, parent_field: customer_id, strategy: random}
- name: order_date
  generator:
    type: parent_field_ref
    config: {parent_table: customers, parent_field: registration_date, mode: date_offset, min_days: 0, max_days: 400, as_type: date}
```

Mecanismo interno: `foreign_key_generator.py` ahora guarda la fila padre
COMPLETA que eligió en `row_context["__fk_row__<parent_table>"]` (antes solo
guardaba el ID). `parent_field_ref_generator.py` lee de ahí. Modos:
`copy`, `date_offset` (suma días aleatorios), `numeric_offset` (suma delta
aleatorio). Requiere, en la MISMA tabla, un campo `foreign_key` con el
mismo `parent_table` colocado ANTES en `fields`.

Esto se valida en `models.py` (`GenerationPlan._validate_parent_field_ref`,
duplicado en `generation_planning.py`): si falta el `foreign_key` previo,
si `parent_table` no está en `depends_on`, o si `execution_order` tiene el
padre después del hijo, **falla explícitamente al parsear el plan** (no
se repara en silencio — es la filosofía "fallar alto, no ocultar"). Si vas
a tocar esto, corre `design/rules/generate_and_run.py` (o un script ad hoc
como en el punto 6 de arriba) para confirmar que sigue funcionando antes de
dar el cambio por bueno.

Archivos tocados por esta feature (por si necesitas el diff mental):
`quala/backend/synthetic_generation/generators/parent_field_ref_generator.py` (nuevo),
`generators/foreign_key_generator.py`, `models.py`, `registry.py`, `runner.py`
(strip de `__fk_row__`), `design/rules/generation_planning.py` (esquema +
`repair_field_order` extendido), `design/rules/generation_system_prompt.txt`
+ `prompts/SYNTHETIC_GENERATION.md` (documentación para el LLM),
`design/rules/example_plan_with_parent_field_ref.json` (plan de referencia),
`design/rules/generate_and_run.py` (script demo).

## Antes de editar

1. Si vas a tocar el esquema del plan: edita `models.py` Y
   `generation_planning.py`, y decide si la reparación correspondiente en
   `apply_repairs`/`REPAIR_PIPELINE` (en `generation_planning.py`) necesita
   actualizarse también.
2. Si vas a tocar el prompt: edita `generation_system_prompt.txt` Y
   `prompts/SYNTHETIC_GENERATION.md`.
3. Si vas a añadir un generador o constraint nuevo: regístralo en
   `registry.py` (o `constraints.py`), añádelo al enum en AMBAS copias del
   esquema, documenta su `config` exacta en el prompt, y decide si necesita
   una validación estructural tipo `_validate_parent_field_ref` en vez de
   confiar solo en que el LLM lo use bien.
4. No hay CI ni tests automáticos: verifica manualmente con un script que
   use `parse_plan` + `Runner`, como se describe arriba.
