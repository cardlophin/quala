"""Punto de entrada del backend HTTP de Quala.

Arranque local:
    cd quala/backend
    uvicorn api.main:app --reload --port 8000

El frontend apunta aqui via VITE_API_BASE_URL (http://localhost:8000) con
VITE_USE_MOCK_API=false.
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Los modulos del motor se importan como paquete raiz `synthetic_generation.*`
# (convencion del repo). Anadimos quala/backend al sys.path para los slices
# futuros (generacion sintetica) sin depender del cwd.
_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from .config import get_settings  # noqa: E402
from . import store  # noqa: E402
from .routers import connections, pipeline, projects, synthetic, validation  # noqa: E402


@asynccontextmanager
async def lifespan(_app: FastAPI):
    store.init_db()
    yield


app = FastAPI(title="Quala API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(projects.router)
app.include_router(validation.router)
app.include_router(synthetic.router)
app.include_router(pipeline.router)


@app.get("/health", tags=["health"])
def health():
    return {
        "status": "ok",
        "databricks_defaults": settings.has_databricks_defaults,
        "gemini_configured": bool(settings.gemini_api_key),
    }
