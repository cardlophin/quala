import os

from dotenv import load_dotenv
from ollama import chat

_ = load_dotenv()

MODEL_NAME = os.getenv("MODEL_NAME", "qwen3")

SYSTEM_PROMPT = """
Eres un traductor experto de reglas de negocio a SQL de validación para Databricks SQL.

Tu tarea es convertir reglas de negocio escritas en lenguaje natural en consultas SQL ejecutables para validar calidad de datos.

Contexto de tablas:
- clientes(id, nombre, email, edad, ciudad)
- pedidos(pedido_id, cliente_id, fecha, importe, estado)

Relaciones:
- pedidos.cliente_id referencia a clientes.id

Instrucciones:
1. Devuelve una salida en JSON válido.
2. Genera una entrada por cada regla recibida.
3. Cada regla debe traducirse a una consulta SQL que devuelva un conteo de incumplimientos.
4. Si la regla valida existencia mínima de registros, devuelve una consulta que calcule el total de filas.
5. Si la regla es entre tablas, usa JOIN o LEFT JOIN según corresponda.
6. Si la regla usa catálogos, tradúcelos con IN (...).
7. Si la regla usa formato email, usa RLIKE.
8. No inventes columnas ni tablas.
9. Si una regla es ambigua, marca "translatable": false y explica por qué.
10. No añadas explicaciones fuera del JSON.

Formato de salida:
{
  "rules": [
    {
      "rule_name": "string corto",
      "business_rule": "texto original",
      "translatable": true,
      "sql_query": "SELECT COUNT(*) AS failed_rows FROM ...",
      "success_condition": "failed_rows = 0"
    }
  ]
}
""".strip()

USER_PROMPT = """
Reglas de negocio:
1. La columna clientes.id no puede ser nula.
2. La columna clientes.id debe ser única.
3. La columna clientes.email debe tener formato de correo válido.
4. Todo pedidos.cliente_id debe existir en clientes.id.
5. La columna pedidos.importe debe ser mayor o igual que 0.
6. La columna pedidos.estado solo puede contener pagado, pendiente o cancelado.
7. La columna pedidos.fecha no puede ser futura.

Usa estas tablas con nombres completos:
- workspace.dq_demo.clientes
- workspace.dq_demo.pedidos
""".strip()


def main():
    stream = chat(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT},
        ],
        think=True,
        stream=True,
    )

    started_thinking = False
    started_answer = False

    for chunk in stream:
        if getattr(chunk.message, "thinking", None):
            if not started_thinking:
                print("Thinking:\n", end="", flush=True)
                started_thinking = True
            print(chunk.message.thinking, end="", flush=True)

        elif getattr(chunk.message, "content", None):
            if started_thinking and not started_answer:
                print("\n\nAnswer:\n", end="", flush=True)
                started_answer = True
            elif not started_thinking and not started_answer:
                started_answer = True
            print(chunk.message.content, end="", flush=True)

    print()


if __name__ == "__main__":
    main()
