"""Ejecucion de un RuleSet contra Databricks -> ValidationFeedback.

Mismo veredicto por regla que el mock (mock-api.runValidation), pero con
datos reales: se ejecuta el `sql_query` de cada regla (que devuelve
failed_rows) y, si incumple, se ejecuta `sample_query` para poblar
sample_invalid_rows.
"""

from __future__ import annotations

from typing import Any

from . import databricks
from .databricks import DatabricksError


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def run_validation(
    connection: dict[str, Any], rule_set: dict[str, Any], warehouse_id: str | None = None
) -> dict[str, Any]:
    rules = rule_set.get("rules", [])

    # Resolver el warehouse una sola vez. Si esto falla es un fallo sistemico
    # (auth / sin warehouse / red): toda la ejecucion es "error".
    try:
        resolved_wh = databricks.resolve_warehouse_id(connection, warehouse_id)
    except DatabricksError as exc:
        return _error_feedback(rules, str(exc))

    verdicts: list[dict[str, Any]] = []
    sample_invalid_rows: dict[str, list[dict[str, Any]]] = {}
    execution_errors = 0
    translatable_count = 0

    for rule in rules:
        name = rule.get("rule_name", "")
        business_rule = rule.get("business_rule", "")
        success_condition = rule.get("success_condition", "")
        sql_query = rule.get("sql_query")

        if not rule.get("translatable") or not sql_query:
            verdicts.append(
                {
                    "rule_name": name,
                    "business_rule": business_rule,
                    "passed": None,
                    "failed_rows": None,
                    "success_condition": success_condition,
                    "skipped_reason": rule.get("reason") or "No se pudo traducir a SQL",
                }
            )
            continue

        translatable_count += 1
        try:
            failed_rows = _to_int(databricks.scalar(connection, sql_query, resolved_wh))
        except DatabricksError as exc:
            execution_errors += 1
            verdicts.append(
                {
                    "rule_name": name,
                    "business_rule": business_rule,
                    "passed": None,
                    "failed_rows": None,
                    "success_condition": success_condition,
                    "skipped_reason": f"Error SQL: {exc}",
                }
            )
            continue

        passed = failed_rows == 0
        verdicts.append(
            {
                "rule_name": name,
                "business_rule": business_rule,
                "passed": passed,
                "failed_rows": failed_rows,
                "success_condition": success_condition,
                "skipped_reason": None,
            }
        )

        if not passed and rule.get("sample_query"):
            try:
                sample_invalid_rows[name] = databricks.run_sql_dicts(
                    connection, rule["sample_query"], resolved_wh
                )
            except DatabricksError:
                sample_invalid_rows[name] = []

    # Si habia reglas traducibles y TODAS fallaron al ejecutarse -> error
    # sistemico (warehouse caido, permisos, etc.), igual que el mock.
    if translatable_count > 0 and execution_errors == translatable_count:
        first_err = next(
            (v["skipped_reason"] for v in verdicts if v["skipped_reason"]), "SQL FAILED"
        )
        return _error_feedback(rules, first_err)

    evaluated = [v for v in verdicts if v["skipped_reason"] is None]
    passed_count = sum(1 for v in evaluated if v["passed"])
    score = 100 if not evaluated else round(passed_count / len(evaluated) * 100)

    return {
        "status": "ok" if evaluated and passed_count == len(evaluated) else "failed_rules"
        if evaluated
        else "ok",
        "source": "databricks",
        "total_rules": len(rules),
        "evaluated_rules": len(evaluated),
        "skipped_rules": len(rules) - len(evaluated),
        "passed_rules": passed_count,
        "failed_rules": [v["rule_name"] for v in evaluated if not v["passed"]],
        "data_quality_score": score,
        "verdicts": verdicts,
        "sample_invalid_rows": sample_invalid_rows,
        "message": None,
    }


def _error_feedback(rules: list[dict[str, Any]], message: str) -> dict[str, Any]:
    return {
        "status": "error",
        "source": "databricks",
        "total_rules": len(rules),
        "evaluated_rules": 0,
        "skipped_rules": 0,
        "passed_rules": 0,
        "failed_rules": [],
        "data_quality_score": 0,
        "verdicts": [],
        "sample_invalid_rows": {},
        "message": message,
    }
