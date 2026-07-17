"""Ejemplo de ejecucion end-to-end del pipeline, en modo MONOLITICO.

descripcion de negocio (texto libre)
        |
        v
  UNA sola llamada al LLM (Gemini, generation_planning.generate_plan)
        |
        v
  YAML -> dict (extract_yaml_block + sanitize + parse_yaml_or_die)
        |
        v
  reparaciones estructurales (apply_repairs: orden de fields, claves de
  constraints, catalogos, execution_order, etc.)
        |
        v
  validacion estricta con el MISMO esquema que ejecuta el motor
  (synthetic_generation.parser.parse_plan, Pydantic) -- si el plan no es
  ejecutable, falla aqui con un mensaje claro, no en mitad de la generacion
        |
        v
  ejecucion determinista fila a fila (synthetic_generation.runner.Runner)
        |
        v
  datasets (uno por tabla) + dataset de edge cases + reporte de validacion

Ya no se usa el modo por fases (prompts/synthetic_generation/*): con los
modelos actuales, una unica llamada resuelve el plan completo de forma
suficientemente fiable, y la capa de reparacion/validacion en codigo (no
el prompt) es lo que realmente garantiza que el plan sea correcto. Dividir
en 6 prompts secuenciales solo anadia latencia y complejidad de merge sin
mejorar esa garantia.

Uso:
    python design/rules/generate_and_run.py
    python design/rules/generate_and_run.py --description "..."
    python design/rules/generate_and_run.py --offline-plan design/rules/example_plan_with_parent_field_ref.json

Si no se pasa --offline-plan, el script intenta generar el plan con Gemini.
Si esa llamada falla (sin red, sin API key, cuota, etc.), cae
automaticamente al plan de referencia versionado en el repo
(example_plan_with_parent_field_ref.json), que ya demuestra el generador
"parent_field_ref": order_date de cada pedido se calcula a partir de
registration_date del cliente vinculado, garantizando order_date >=
registration_date por diseno en vez de por rango absoluto aproximado.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR = Path(__file__).resolve().parent
FALLBACK_PLAN_PATH = RULES_DIR / "example_plan_with_parent_field_ref.json"
OUTPUT_DIR = RULES_DIR / "pipeline_output"

# El motor de ejecucion vive en quala/backend y se importa como paquete
# "synthetic_generation" (no "quala.backend.synthetic_generation").
sys.path.insert(0, str(REPO_ROOT / "quala" / "backend"))
# generation_planning.py (llamada al LLM + reparaciones) vive junto a este script.
sys.path.insert(0, str(RULES_DIR))

from synthetic_generation.parser import PlanParseError, parse_plan  # noqa: E402
from synthetic_generation.runner import Runner  # noqa: E402

import generation_planning as planning  # noqa: E402


def generate_plan_dict_via_llm(description: str) -> dict:
    """Una sola llamada al LLM: descripcion de negocio completa entra,
    plan completo sale. Sin fases intermedias."""
    system_prompt = planning.load_system_prompt(planning.SYSTEM_PROMPT_PATH)
    raw_output = planning.generate_plan(system_prompt, description)
    cleaned_yaml = planning.extract_yaml_block(raw_output)
    plan_dict = planning.parse_yaml_or_die(cleaned_yaml)
    return planning.apply_repairs(plan_dict)


def load_fallback_plan() -> dict:
    with open(FALLBACK_PLAN_PATH, "r", encoding="utf-8") as f:
        plan_dict = json.load(f)
    return planning.apply_repairs(plan_dict)


def run_pipeline(plan_dict: dict) -> None:
    """Valida el dict contra el esquema del MOTOR (no una copia) y ejecuta."""
    try:
        plan = parse_plan(plan_dict)
    except PlanParseError as exc:
        print(f"\n[ERROR] El plan generado no valida contra el esquema del motor:\n{exc}")
        raise SystemExit(1)

    print(f"\nPlan valido. Tablas: {[t.name for t in plan.tables]}")
    print(f"Execution order: {plan.runner.execution_order}")
    if plan.assumptions:
        print("Assumptions declaradas por el plan:")
        for a in plan.assumptions:
            print(f"  - {a}")

    result = Runner(plan).run()

    print("\n=== Metadata ===")
    print(f"Seed={result.metadata.seed} Locale={result.metadata.locale}")
    print(f"Row counts: {result.metadata.row_counts}")
    print(f"Edge cases generados: {result.metadata.edge_cases_generated}")

    print("\n=== Validation report ===")
    if result.validation_report.is_valid:
        print("Todas las constraints pasaron.")
    else:
        for issue in result.validation_report.issues[:20]:
            print(
                f"[{issue.table}] {issue.constraint_type} "
                f"(row {issue.row_index}, field {issue.field_name}): {issue.message}"
            )

    # Chequeo explicito de la regla de negocio que motivo parent_field_ref:
    # order_date >= registration_date del cliente vinculado.
    if "orders" in result.valid_tables and "customers" in result.valid_tables:
        customers_by_id = {c.get("customer_id"): c for c in result.valid_tables["customers"]}
        violations = [
            o
            for o in result.valid_tables["orders"]
            if o.get("customer_id") in customers_by_id
            and "order_date" in o
            and "registration_date" in customers_by_id[o["customer_id"]]
            and o["order_date"] < customers_by_id[o["customer_id"]]["registration_date"]
        ]
        print(
            f"\nChequeo order_date >= registration_date: "
            f"{len(violations)} violaciones sobre {len(result.valid_tables['orders'])} pedidos."
        )

    OUTPUT_DIR.mkdir(exist_ok=True)

    for table_name, rows in result.valid_tables.items():
        with open(OUTPUT_DIR / f"{table_name}.json", "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False, default=str)

    for key, rows in result.invalid_tables.items():
        safe_key = key.replace("::", "__")
        with open(OUTPUT_DIR / f"invalid_{safe_key}.json", "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False, default=str)

    with open(OUTPUT_DIR / "plan_used.json", "w", encoding="utf-8") as f:
        f.write(plan.model_dump_json(indent=2))

    print(f"\nResultados guardados en: {OUTPUT_DIR}")


def main() -> None:
    arg_parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    arg_parser.add_argument(
        "--description",
        type=str,
        default=None,
        help="Descripcion de negocio en lenguaje natural. Por defecto usa el ejemplo customers/orders de generation_planning.USER_PROMPT.",
    )
    arg_parser.add_argument(
        "--offline-plan",
        type=str,
        default=None,
        help="Ruta a un plan JSON ya generado. Salta la llamada al LLM (util sin red, sin API key, o para tests deterministas).",
    )
    args = arg_parser.parse_args()

    if args.offline_plan:
        print(f"[offline] Usando plan existente: {args.offline_plan}")
        with open(args.offline_plan, "r", encoding="utf-8") as f:
            plan_dict = planning.apply_repairs(json.load(f))
    else:
        description = args.description or planning.USER_PROMPT
        print("Generando plan con el LLM (una sola llamada, modo monolitico)...\n")
        try:
            plan_dict = generate_plan_dict_via_llm(description)
        except Exception as exc:  # noqa: BLE001 - queremos degradar con cualquier fallo de red/API
            print(f"\n[WARN] No se pudo llamar al LLM ({type(exc).__name__}: {exc}).")
            print(f"[WARN] Usando el plan de referencia versionado: {FALLBACK_PLAN_PATH}")
            plan_dict = load_fallback_plan()

    run_pipeline(plan_dict)


if __name__ == "__main__":
    main()
