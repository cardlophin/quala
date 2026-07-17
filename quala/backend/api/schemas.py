"""Modelos Pydantic = espejo 1:1 de frontend/src/types/*.ts.

Regla: NO renombrar campos. Cualquier cambio aqui debe reflejarse en el
`types/*.ts` correspondiente del frontend (y viceversa). Los nombres estan
en snake_case en ambos lados, asi que el JSON viaja sin transformar.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# connection.ts
# ---------------------------------------------------------------------------

ConnectionStatus = Literal["untested", "success", "error"]


class DatabricksConnection(BaseModel):
    id: str
    name: str
    host: str
    client_id: str
    client_secret: str
    catalog: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    warehouse_id: Optional[str] = None
    status: ConnectionStatus = "untested"
    last_tested_at: Optional[str] = None
    # Campos legacy (PAT). Solo presentes en conexiones antiguas.
    token: Optional[str] = None
    http_path: Optional[str] = None

    model_config = {"populate_by_name": True}


class ConnectionCreate(BaseModel):
    name: str
    host: str
    client_id: str = ""
    client_secret: str = ""
    catalog: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    warehouse_id: Optional[str] = None
    token: Optional[str] = None
    http_path: Optional[str] = None

    model_config = {"populate_by_name": True}


class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    catalog: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    warehouse_id: Optional[str] = None
    status: Optional[ConnectionStatus] = None
    last_tested_at: Optional[str] = None
    token: Optional[str] = None
    http_path: Optional[str] = None

    model_config = {"populate_by_name": True}


class TestConnectionRequest(BaseModel):
    host: str
    client_id: str
    client_secret: str


class TestConnectionResult(BaseModel):
    status: ConnectionStatus
    message: Optional[str] = None


class SqlWarehouse(BaseModel):
    id: str
    name: str
    size: str
    state: Literal["running", "stopped"]


# ---------------------------------------------------------------------------
# validation.ts
# ---------------------------------------------------------------------------


class ColumnSchema(BaseModel):
    name: str
    data_type: str
    nullable: bool
    is_primary_key: Optional[bool] = None
    is_foreign_key: Optional[bool] = None


class TableSchemaInfo(BaseModel):
    full_name: str
    row_count: Optional[int] = None
    columns: list[ColumnSchema]


class BusinessRuleDraft(BaseModel):
    id: str
    text: str
    source: Literal["manual", "suggested"]


class GenerateSqlRulesSource(BaseModel):
    alias: str
    table: str
    columns: list[dict[str, str]]  # [{name, type}]


class GenerateSqlRulesRequest(BaseModel):
    connection_id: str
    node_id: str
    sources: list[GenerateSqlRulesSource]
    business_rules: list[str]
    # Contexto libre opcional sobre los datos, inyectado en el prompt del LLM.
    context: Optional[str] = None


class SQLRule(BaseModel):
    rule_name: str
    business_rule: str
    translatable: bool
    sql_query: Optional[str] = None
    sample_query: Optional[str] = None
    success_condition: str
    reason: Optional[str] = None
    edited: Optional[bool] = None


class RuleSet(BaseModel):
    rules: list[SQLRule]


class RuleVerdict(BaseModel):
    rule_name: str
    business_rule: str
    passed: Optional[bool] = None
    failed_rows: Optional[int] = None
    success_condition: str
    skipped_reason: Optional[str] = None


class ValidationFeedback(BaseModel):
    status: Literal["ok", "failed_rules", "error"]
    source: str
    total_rules: int
    evaluated_rules: int
    skipped_rules: int
    passed_rules: int
    failed_rules: list[str]
    data_quality_score: int
    verdicts: list[RuleVerdict]
    sample_invalid_rows: dict[str, list[dict[str, Any]]]
    message: Optional[str] = None


class SuggestBusinessRulesRequest(BaseModel):
    connection_id: str
    sources: list[dict[str, str]]  # [{alias, table}]


class SuggestRulesAiRequest(BaseModel):
    """Sugerencia de reglas con IA a partir del ESQUEMA (columnas + PK/FK +
    relaciones), nunca de los datos. `sources` trae el esquema ya resuelto."""

    connection_id: Optional[str] = None
    # [{alias, table, columns: [{name, type, is_primary_key?, is_foreign_key?}]}]
    sources: list[dict[str, Any]]


class GeneratePlanRequest(BaseModel):
    """Generación del plan sintético: descripción de negocio + contexto de
    esquema OPCIONAL (columnas + PK/FK de tablas conectadas, nunca datos)."""

    description: str = ""
    # [{alias, table, columns: [{name, type, is_primary_key?, is_foreign_key?}]}]
    schema_context: Optional[list[dict[str, Any]]] = None


class RunGenerationRequest(BaseModel):
    plan: dict[str, Any]


class WriteSyntheticRequest(BaseModel):
    """Volcado del dataset generado a Databricks (crea el esquema si no existe)."""

    connection_id: str
    plan: dict[str, Any]
    catalog: str
    schema_: str = Field(alias="schema")
    warehouse_id: Optional[str] = None

    model_config = {"populate_by_name": True}


class RunValidationRequest(BaseModel):
    """runValidation del mock solo recibia `rule_set`. El backend real
    necesita saber CONTRA QUE workspace/warehouse ejecutar, asi que se
    anaden connection_id y warehouse_id (cambio de firma documentado)."""

    connection_id: str
    warehouse_id: Optional[str] = None
    rule_set: RuleSet


# ---------------------------------------------------------------------------
# databricks-resources.ts (usado por metastore/pipeline)
# ---------------------------------------------------------------------------


class ResourceVerificationResult(BaseModel):
    exists: bool
    message: str


class ResourceVerifyRequest(BaseModel):
    kind: Literal["job", "pipeline"]
    resource_id: str


class RunPipelineRequest(BaseModel):
    connection_id: str
    kind: Literal["job", "pipeline"]
    resource_id: str
    input_table: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    warehouse_id: Optional[str] = None


# ---------------------------------------------------------------------------
# project.ts
# ---------------------------------------------------------------------------


class Project(BaseModel):
    id: str
    name: str
    connection_id: Optional[str] = None
    created_at: str
    last_run_at: Optional[str] = None
    last_quality_score: Optional[float] = None


class ProjectCreate(BaseModel):
    name: str
    connection_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    connection_id: Optional[str] = None
    last_run_at: Optional[str] = None
    last_quality_score: Optional[float] = None


# ---------------------------------------------------------------------------
# graph.ts
# ---------------------------------------------------------------------------

QualaNodeType = Literal["data_source", "synthetic_generator", "pipeline", "validation"]


class QualaNode(BaseModel):
    id: str
    type: QualaNodeType
    position: dict[str, float]
    data: dict[str, Any]


class QualaEdge(BaseModel):
    id: str
    source: str
    target: str


class ProjectGraph(BaseModel):
    project_id: str
    connection_id: Optional[str] = None
    nodes: list[QualaNode]
    edges: list[QualaEdge]
