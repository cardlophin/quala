# `quala`

Quala es una plataforma de **calidad y generación de datos sobre Databricks**,
con una interfaz de **canvas de grafo estilo n8n** donde compones un flujo
conectando nodos. Cubre el ciclo completo:

- **Validar** la calidad de tablas reales de Databricks escribiendo reglas de
  negocio en lenguaje natural que una IA traduce a SQL y ejecuta contra el
  workspace.
- **Generar datos sintéticos** realistas a partir de una descripción de negocio
  y/o del esquema de una tabla real, con un motor determinista (Pydantic +
  generadores puros), y volcarlos a Databricks.
- **Transformar** con pipelines de Databricks (Jobs o Lakeflow/DLT), encadenando
  entradas y salidas en la propia topología del grafo.

### Los 4 tipos de nodo

- **Fuente de datos** — referencia una o varias tablas reales de Databricks (o
  es la tabla de salida de un pipeline).
- **Generar datos sintéticos** — descripción → plan (YAML/JSON) vía LLM →
  dataset determinista; opcionalmente toma el esquema de una Fuente conectada.
- **Pipeline** — ejecuta un Job o un Lakeflow Pipeline de Databricks, mapeando
  sus parámetros (entrada/salida/otros) a las tablas de los nodos conectados.
- **Validación** — reglas de negocio → SQL (IA) → ejecución contra Databricks,
  con score de calidad y filas que incumplen.

Flujo típico: `datos → validación → pipeline → datos → validación`.

## Arquitectura

- **Frontend** (`quala/frontend`): React 19 + TypeScript + Vite + React Router +
  Tailwind v4 + shadcn/ui + Zustand + TanStack Query + `@xyflow/react` (canvas).
- **Backend / API** (`quala/backend/api`): FastAPI + Uvicorn + Pydantic v2,
  persistencia en SQLite (stdlib), integración con Databricks vía `databricks-sdk`
  (OAuth M2M) y con Google **Gemini** (`google-genai`) para traducir reglas a SQL
  y planificar la generación sintética.
- **Motor sintético** (`quala/backend/synthetic_generation`): esquema
  `GenerationPlan` (Pydantic) + `Runner` determinista + Faker.

El contrato entre front y back es 1:1: cada función de `src/lib/mock-api.ts`
tiene su endpoint equivalente en la API. Con `VITE_USE_MOCK_API=true` el front
funciona sin backend (datos simulados).

## Organización de carpetas

```
quala/
├── quala/
│   ├── frontend/                    # SPA React (canvas n8n)
│   │   ├── src/
│   │   │   ├── components/graph/     # nodos, paneles, canvas, visor de esquema
│   │   │   ├── pages/                # project-canvas-page (grafo)
│   │   │   ├── hooks/                # TanStack Query (use-*.ts)
│   │   │   ├── lib/                  # api.ts (real), mock-api.ts, api-client, graph-rules
│   │   │   ├── types/                # modelo de datos (graph, validation, ...)
│   │   │   └── store/               # Zustand (conexión, sesión, tema)
│   │   └── .env                     # config del front (Vite)
│   └── backend/
│       ├── api/                     # capa HTTP FastAPI
│       │   ├── main.py               # app + routers + CORS
│       │   ├── config.py             # settings desde .env
│       │   ├── schemas.py            # modelos Pydantic (espejo de types/*.ts)
│       │   ├── store.py              # persistencia SQLite
│       │   ├── routers/              # connections, projects, validation, synthetic, pipeline
│       │   └── services/             # databricks, rules (Gemini), validation, synthetic
│       └── synthetic_generation/    # motor determinista (parser + Runner + generadores)
├── design/rules/                    # planner LLM (Gemini) + prompt canónico + esquema
├── prompts/                         # copia del prompt de generación sintética
├── demo/                            # guía de demo + código del pipeline (notebook + dbt)
├── pyproject.toml / uv.lock          # dependencias Python
└── .env                             # secretos (Databricks, Gemini) — NO commitear
```

## Requisitos previos

- **Python ≥ 3.12** y [`uv`](https://docs.astral.sh/uv/) (recomendado) — o `pip` + venv.
- **[Bun](https://bun.sh)** para el frontend (o npm/pnpm si lo prefieres).
- Un **workspace de Databricks** con un **Service Principal** (OAuth M2M) y un
  **SQL Warehouse**.
- Una **API key de Google Gemini**.

## Configuración

### 1. Secretos del backend — `.env` en la raíz del repo

```dotenv
DATABRICKS_HOST="https://<tu-workspace>.cloud.databricks.com"
DATABRICKS_CLIENT_ID="<service-principal-client-id>"
DATABRICKS_CLIENT_SECRET="<service-principal-secret>"

GEMINI_API_KEY="<tu-api-key-de-gemini>"
MODEL_NAME="gemini-2.0-flash"

# Opcionales
# QUALA_DB_PATH="./quala.sqlite3"                 # ruta de la BD SQLite
# QUALA_CORS_ORIGINS="http://localhost:5173"       # orígenes permitidos (CORS)
```

> El backend crea/usa un fichero SQLite (`quala.sqlite3`) para conexiones,
> proyectos y grafos. No requiere ninguna base de datos externa.

### 2. Config del frontend — `.env` en `quala/frontend/`

```dotenv
VITE_APP_NAME=Quala
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_API=false        # true = usar datos mock sin backend
```

## Cómo levantar el proyecto

### Backend (API)

Desde la **raíz del repo**, instala dependencias y arranca Uvicorn:

```bash
# 1. Instalar dependencias (crea el entorno virtual)
uv sync
#   Alternativa sin uv:
#   python -m venv .venv && source .venv/bin/activate && pip install -e .

# 2. Arrancar la API (el paquete `api` se importa desde quala/backend)
cd quala/backend
uv run uvicorn api.main:app --reload --port 8000
#   (con venv activado, sin uv: uvicorn api.main:app --reload --port 8000)
```

Comprueba que responde:

- Salud: <http://localhost:8000/health>
- Docs interactivas (OpenAPI): <http://localhost:8000/docs>

### Frontend

En **otra terminal**:

```bash
cd quala/frontend
bun install
bun run dev
```

Abre <http://localhost:5173>. (Si tu dev server usa otro puerto, añádelo a
`QUALA_CORS_ORIGINS` en el `.env` de la raíz.)

**Orden importante:** arranca primero el backend y luego el frontend. Con
`VITE_USE_MOCK_API=false`, si el backend no está en marcha, la app no cargará
datos.

### Modo mock (sin backend ni Databricks)

Para explorar la interfaz sin backend, pon `VITE_USE_MOCK_API=true` en
`quala/frontend/.env` y reinicia el front. Usa datos simulados en memoria.

## Verificación / build

```bash
# Frontend: type-check y build de producción
cd quala/frontend
bun run typecheck      # tsc --noEmit
bun run build          # tsc --noEmit && vite build

# Motor sintético (backend, sin red): parse_plan + Runner sobre un plan de ejemplo
cd quala/backend
uv run python -c "import sys; sys.path.insert(0,'.'); \
import json; from synthetic_generation.parser import parse_plan; \
from synthetic_generation.runner import Runner; \
p=parse_plan(json.load(open('../../design/rules/example_plan_with_parent_field_ref.json'))); \
r=Runner(p).run(); print('tablas:', list(r.valid_tables), 'valido:', r.validation_report.is_valid)"
```

## Demo end-to-end

En `demo/` tienes una guía paso a paso (`GUIA_DEMO.md`) de un caso realista
(calidad de ventas de e-commerce) con el contenido listo para pegar en cada nodo,
más el código del pipeline de transformación para subir a Databricks (notebook
PySpark en `demo/databricks/` y una versión dbt en `demo/dbt/`).

## Notas

- **Secretos:** el `.env` de la raíz contiene credenciales reales; no lo subas al
  repositorio y rota las claves antes de cualquier despliegue.
- **Continuidad del proyecto:** cada directorio relevante tiene su `CONTEXT.md`
  (y el frontend un `HANDOFF.md`) con el estado del código y las decisiones de
  diseño; son la fuente de verdad para retomar el trabajo.
