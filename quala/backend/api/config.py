"""Configuracion del backend, leida de variables de entorno / .env.

No usamos pydantic-settings (no esta en las dependencias) para no anadir un
paquete nuevo: basta con `python-dotenv` (ya presente) + os.getenv. Todos
los secretos viven en el `.env` de la raiz del repo, NUNCA en codigo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Raiz del repo = .../quala (tres niveles por encima de este archivo:
# api/ -> backend/ -> quala/ -> <repo>). Cargamos el .env de ahi.
REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Ajustes del servicio. Inmutable; se cachea con get_settings()."""

    # --- Databricks (OAuth M2M / Service Principal) ---------------------
    # Valores por defecto tomados del .env; una conexion concreta guardada
    # en la BD puede sobreescribirlos por peticion (multi-workspace).
    databricks_host: str = field(default_factory=lambda: os.getenv("DATABRICKS_HOST", ""))
    databricks_client_id: str = field(
        default_factory=lambda: os.getenv("DATABRICKS_CLIENT_ID", "")
    )
    databricks_client_secret: str = field(
        default_factory=lambda: os.getenv("DATABRICKS_CLIENT_SECRET", "")
    )

    # --- LLM (Gemini via google-genai) para traducir reglas a SQL -------
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    model_name: str = field(default_factory=lambda: os.getenv("MODEL_NAME", "gemini-2.0-flash"))

    # --- Persistencia ---------------------------------------------------
    db_path: str = field(
        default_factory=lambda: os.getenv("QUALA_DB_PATH", str(REPO_ROOT / "quala.sqlite3"))
    )

    # --- CORS: origenes del dev server de Vite --------------------------
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv(
                "QUALA_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
            )
        )
    )

    @property
    def has_databricks_defaults(self) -> bool:
        return bool(
            self.databricks_host
            and self.databricks_client_id
            and self.databricks_client_secret
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
