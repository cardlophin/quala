import json
import os
import sys

from databricks import sql
from dotenv import load_dotenv

_ = load_dotenv()

# ============================================================
# CONFIGURACIÓN HARDCODEADA
# ============================================================

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "no-host")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "no-token")
DATABRICKS_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "no-path")

CATALOG = "workspace"
SCHEMA = "default"
SOURCE_TABLE = f"{CATALOG}.{SCHEMA}.clientes"


def fetch_one_dict(cursor, query: str):
    cursor.execute(query)
    row = cursor.fetchone()
    if row is None:
        return None
    cols = [c[0] for c in cursor.description]
    return dict(zip(cols, row))


def fetch_all_dicts(cursor, query: str):
    cursor.execute(query)
    rows = cursor.fetchall()
    cols = [c[0] for c in cursor.description]
    return [dict(zip(cols, row)) for row in rows]


def main():
    feedback = {
        "status": "ok",
        "source_table": SOURCE_TABLE,
        "verdicts": [],
        "metrics": {},
        "failed_rules": [],
        "sample_invalid_rows": {},
    }

    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST,
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN,
        ) as connection:
            with connection.cursor() as cursor:
                total = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS total_rows FROM {SOURCE_TABLE}",
                )

                missing_id = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {SOURCE_TABLE} WHERE id IS NULL",
                )

                duplicate_id = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM (
                        SELECT id
                        FROM {SOURCE_TABLE}
                        GROUP BY id
                        HAVING COUNT(*) > 1
                    ) t
                    """,
                )

                missing_nombre = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {SOURCE_TABLE} WHERE nombre IS NULL",
                )

                missing_email = fetch_one_dict(
                    cursor,
                    f"SELECT COUNT(*) AS n FROM {SOURCE_TABLE} WHERE email IS NULL",
                )

                invalid_edad = fetch_one_dict(
                    cursor,
                    f"""
                    SELECT COUNT(*) AS n
                    FROM {SOURCE_TABLE}
                    WHERE edad IS NULL OR CAST(edad AS INT) < 18
                    """,
                )

                if (
                    (some_total := total)
                    and (some_missing_id := missing_id)
                    and (some_duplicate_id := duplicate_id)
                    and (some_missing_nombre := missing_nombre)
                    and (some_missing_email := missing_email)
                    and (some_invalid_edad := invalid_edad)
                ):
                    feedback["metrics"] = {
                        "total_rows": some_total["total_rows"],
                        "missing_id": some_missing_id["n"],
                        "duplicate_id_groups": some_duplicate_id["n"],
                        "missing_nombre": some_missing_nombre["n"],
                        "missing_email": some_missing_email["n"],
                        "invalid_edad": some_invalid_edad["n"],
                    }

                    rules = [
                        ("row_count > 0", some_total["total_rows"] > 0),
                        ("missing_count(id) = 0", some_missing_id["n"] == 0),
                        ("duplicate_count(id) = 0", some_duplicate_id["n"] == 0),
                        ("missing_count(nombre) < 5", some_missing_nombre["n"] < 5),
                        ("missing_count(email) = 0", some_missing_email["n"] == 0),
                        ("edad >= 18", some_invalid_edad["n"] == 0),
                    ]

                    for rule_name, passed in rules:
                        feedback["verdicts"].append(
                            {"rule": rule_name, "passed": passed}
                        )
                        if not passed:
                            feedback["failed_rules"].append(rule_name)

                    if some_missing_id["n"] > 0:
                        feedback["sample_invalid_rows"]["missing_id"] = fetch_all_dicts(
                            cursor,
                            f"SELECT * FROM {SOURCE_TABLE} WHERE id IS NULL LIMIT 10",
                        )

                    if some_duplicate_id["n"] > 0:
                        feedback["sample_invalid_rows"]["duplicate_id"] = (
                            fetch_all_dicts(
                                cursor,
                                f"""
                            SELECT *
                            FROM {SOURCE_TABLE}
                            WHERE id IN (
                                SELECT id
                                FROM {SOURCE_TABLE}
                                GROUP BY id
                                HAVING COUNT(*) > 1
                            )
                            LIMIT 10
                            """,
                            )
                        )

                    if some_missing_nombre["n"] > 0:
                        feedback["sample_invalid_rows"]["missing_nombre"] = (
                            fetch_all_dicts(
                                cursor,
                                f"SELECT * FROM {SOURCE_TABLE} WHERE nombre IS NULL LIMIT 10",
                            )
                        )

                    if some_missing_email["n"] > 0:
                        feedback["sample_invalid_rows"]["missing_email"] = (
                            fetch_all_dicts(
                                cursor,
                                f"SELECT * FROM {SOURCE_TABLE} WHERE email IS NULL LIMIT 10",
                            )
                        )

                    if some_invalid_edad["n"] > 0:
                        feedback["sample_invalid_rows"]["invalid_edad"] = (
                            fetch_all_dicts(
                                cursor,
                                f"""
                            SELECT *
                            FROM {SOURCE_TABLE}
                            WHERE edad IS NULL OR CAST(edad AS INT) < 18
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
