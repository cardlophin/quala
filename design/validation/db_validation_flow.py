import json
import os
import sys
from typing import Any

from databricks import sql
from dotenv import load_dotenv

_ = load_dotenv()

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "no-host")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "no-token")
DATABRICKS_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "no-path")

CATALOG = os.getenv("CATALOG", "workspace")
SCHEMA = os.getenv("SCHEMA", "dq_demo")

CLIENTES_TABLE = f"{CATALOG}.{SCHEMA}.clientes"
PEDIDOS_TABLE = f"{CATALOG}.{SCHEMA}.pedidos"


def fetch_one_dict(cursor, query: str) -> dict[str, Any] | None:
    cursor.execute(query)
    row = cursor.fetchone()
    if row is None:
        return None
    cols = [c[0] for c in cursor.description]
    return dict(zip(cols, row))


def fetch_all_dicts(cursor, query: str) -> list[dict[str, Any]]:
    cursor.execute(query)
    rows = cursor.fetchall()
    cols = [c[0] for c in cursor.description]
    return [dict(zip(cols, row)) for row in rows]


def main():
    feedback = {
        "status": "ok",
        "source_tables": {
            "clientes": CLIENTES_TABLE,
            "pedidos": PEDIDOS_TABLE,
        },
        "verdicts": [],
        "metrics": {},
        "failed_rules": [],
        "sample_invalid_rows": {},
        "message": None,
    }

    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST,
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN,
        ) as connection:
            with connection.cursor() as cursor:
                clientes_total = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {CLIENTES_TABLE}",
                )
                pedidos_total = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {PEDIDOS_TABLE}",
                )
                missing_cliente_id = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {CLIENTES_TABLE} WHERE id IS NULL",
                )
                duplicate_cliente_id = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM (
                        SELECT id
                        FROM {CLIENTES_TABLE}
                        GROUP BY id
                        HAVING COUNT(*) > 1
                    ) t
                    """,
                )
                missing_email = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {CLIENTES_TABLE} WHERE email IS NULL",
                )
                invalid_edad = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM {CLIENTES_TABLE}
                    WHERE edad IS NULL OR edad < 18
                    """,
                )
                orphan_pedidos = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM {PEDIDOS_TABLE} p
                    LEFT JOIN {CLIENTES_TABLE} c
                      ON p.cliente_id = c.id
                    WHERE p.cliente_id IS NOT NULL
                      AND c.id IS NULL
                    """,
                )
                invalid_importe = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM {PEDIDOS_TABLE}
                    WHERE importe IS NULL OR importe < 0
                    """,
                )
                invalid_estado = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM {PEDIDOS_TABLE}
                    WHERE estado IS NULL
                       OR estado NOT IN ('pagado', 'pendiente', 'cancelado')
                    """,
                )

                if (
                    clientes_total
                    and pedidos_total
                    and missing_cliente_id
                    and duplicate_cliente_id
                    and missing_email
                    and invalid_edad
                    and orphan_pedidos
                    and invalid_estado
                    and invalid_importe
                ):
                    feedback["metrics"] = {
                        "clientes_total": clientes_total["n"],
                        "pedidos_total": pedidos_total["n"],
                        "missing_cliente_id": missing_cliente_id["n"],
                        "duplicate_cliente_id_groups": duplicate_cliente_id["n"],
                        "missing_email": missing_email["n"],
                        "invalid_edad": invalid_edad["n"],
                        "orphan_pedidos": orphan_pedidos["n"],
                        "invalid_importe": invalid_importe["n"],
                        "invalid_estado": invalid_estado["n"],
                    }

                    rules = [
                        ("clientes_row_count > 0", clientes_total["n"] > 0),
                        ("pedidos_row_count > 0", pedidos_total["n"] > 0),
                        (
                            "missing_count(clientes.id) = 0",
                            missing_cliente_id["n"] == 0,
                        ),
                        (
                            "duplicate_count(clientes.id) = 0",
                            duplicate_cliente_id["n"] == 0,
                        ),
                        ("missing_count(clientes.email) = 0", missing_email["n"] == 0),
                        ("clientes.edad >= 18", invalid_edad["n"] == 0),
                        (
                            "all pedidos.cliente_id exist in clientes.id",
                            orphan_pedidos["n"] == 0,
                        ),
                        ("pedidos.importe >= 0", invalid_importe["n"] == 0),
                        ("pedidos.estado in catálogo", invalid_estado["n"] == 0),
                    ]

                    for rule_name, passed in rules:
                        feedback["verdicts"].append(
                            {"rule": rule_name, "passed": passed}
                        )
                        if not passed:
                            feedback["failed_rules"].append(rule_name)

                    if orphan_pedidos["n"] > 0:
                        feedback["sample_invalid_rows"]["orphan_pedidos"] = (
                            fetch_all_dicts(
                                cursor,
                                f"""
                            SELECT p.*
                            FROM {PEDIDOS_TABLE} p
                            LEFT JOIN {CLIENTES_TABLE} c
                            ON p.cliente_id = c.id
                            WHERE p.cliente_id IS NOT NULL
                            AND c.id IS NULL
                            LIMIT 10
                            """,
                            )
                        )

                    if invalid_importe["n"] > 0:
                        feedback["sample_invalid_rows"]["invalid_importe"] = (
                            fetch_all_dicts(
                                cursor,
                                f"""
                            SELECT *
                            FROM {PEDIDOS_TABLE}
                            WHERE importe IS NULL OR importe < 0
                            LIMIT 10
                            """,
                            )
                        )

                    if invalid_estado["n"] > 0:
                        feedback["sample_invalid_rows"]["invalid_estado"] = (
                            fetch_all_dicts(
                                cursor,
                                f"""
                            SELECT *
                            FROM {PEDIDOS_TABLE}
                            WHERE estado IS NULL
                            OR estado NOT IN ('pagado', 'pendiente', 'cancelado')
                            LIMIT 10
                            """,
                            )
                        )

                    if feedback["failed_rules"]:
                        feedback["status"] = "failed_rules"

    except Exception as e:
        feedback["status"] = "error"
        feedback["message"] = str(e)
        print(json.dumps(feedback, indent=2, ensure_ascii=False))
        sys.exit(1)

    print(json.dumps(feedback, indent=2, ensure_ascii=False))

    if feedback["status"] == "failed_rules":
        sys.exit(2)


if __name__ == "__main__":
    main()
