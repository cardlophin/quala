"""Quala backend HTTP API (FastAPI).

Capa HTTP que une el frontend (canvas estilo n8n) con la logica que ya
existe en el repo: el motor de generacion sintetica (`synthetic_generation`),
la integracion con Databricks (`design/integration/databricks`) y la
traduccion de reglas de negocio a SQL.

El contrato de esta API es, 1:1, el de `frontend/src/lib/mock-api.ts`: cada
funcion exportada alli tiene aqui un endpoint equivalente con los mismos
campos y tipos (ver `frontend/src/types/*.ts`).
"""
