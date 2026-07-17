# Databricks notebook source
# =====================================================================
# Quala — Nodo de transformación de ventas (demo e-commerce de moda)
# ---------------------------------------------------------------------
# Toma la tabla de clientes (fuente REAL, ya validada en el nodo de
# Validación de origen) y la tabla de pedidos (SINTÉTICA, generada por el
# nodo "Generar datos sintéticos" con casos límite a propósito), las une y
# produce DOS tablas resultado:
#   - ventas_enriquecidas: un pedido por fila, enriquecido con datos del
#     cliente y con banderas de calidad (es_cliente_valido, segmento).
#   - resumen_clientes: agregados por cliente (nº pedidos, importe total,
#     ticket medio).
# Esas tablas resultado se validan después en el nodo de Validación final.
#
# Parametrizado con dbutils.widgets para que el nodo Pipeline de Quala pueda
# pasar la entrada/salida desde la topología del grafo.
# =====================================================================

from pyspark.sql import functions as F

# --- Parámetros (dbutils.widgets) ------------------------------------
# El nodo Pipeline de Quala mapea estos nombres:
#   clientes_table  -> entrada (fuente real de clientes)
#   pedidos_table   -> entrada (salida sintética de pedidos)
#   output_ventas   -> salida (nodo de datos de resultado)  [resolved_output]
#   output_resumen  -> salida secundaria (opcional)
#   umbral_vip      -> valor fijo (importe a partir del cual un pedido es "VIP")
dbutils.widgets.text("clientes_table", "workspace.dq_demo.clientes")
dbutils.widgets.text("pedidos_table", "workspace.sandbox.pedidos_sinteticos")
dbutils.widgets.text("output_ventas", "workspace.sandbox.ventas_enriquecidas")
dbutils.widgets.text("output_resumen", "workspace.sandbox.resumen_clientes")
dbutils.widgets.text("umbral_vip", "200")

clientes_table = dbutils.widgets.get("clientes_table")
pedidos_table = dbutils.widgets.get("pedidos_table")
output_ventas = dbutils.widgets.get("output_ventas")
output_resumen = dbutils.widgets.get("output_resumen")
umbral_vip = float(dbutils.widgets.get("umbral_vip"))

print(f"clientes = {clientes_table}")
print(f"pedidos  = {pedidos_table}")
print(f"salida   = {output_ventas} / {output_resumen}")

# --- Lectura ----------------------------------------------------------
clientes = spark.table(clientes_table)
pedidos = spark.table(pedidos_table)

# Normalizamos el nombre de la clave de cliente: la fuente real puede
# llamarla `cliente_id` o `id`; los pedidos sintéticos usan `cliente_id`.
cliente_key = "cliente_id" if "cliente_id" in clientes.columns else "id"
clientes = clientes.withColumnRenamed(cliente_key, "cliente_id")

# --- Transformación: enriquecer pedidos con datos del cliente ---------
# LEFT JOIN a propósito: los pedidos sintéticos incluyen casos límite
# (cliente_id que no existe) que queremos DETECTAR aguas abajo, no perder.
ventas = (
    pedidos.alias("p")
    .join(clientes.alias("c"), on="cliente_id", how="left")
    .select(
        F.col("p.pedido_id"),
        F.col("p.cliente_id"),
        F.col("c.nombre").alias("nombre_cliente"),
        F.col("c.email"),
        F.col("c.ciudad"),
        F.col("p.fecha_pedido"),
        F.col("p.importe"),
        F.col("p.estado"),
        # Bandera de integridad referencial: ¿el cliente existe realmente?
        F.col("c.cliente_id").isNotNull().alias("es_cliente_valido"),
        # Segmento de negocio por importe
        F.when(F.col("p.importe") >= umbral_vip, F.lit("VIP"))
        .when(F.col("p.importe") >= umbral_vip / 2, F.lit("Medio"))
        .otherwise(F.lit("Bajo"))
        .alias("segmento"),
    )
)

# --- Resumen por cliente (solo pedidos con cliente válido) ------------
resumen = (
    ventas.filter(F.col("es_cliente_valido"))
    .groupBy("cliente_id", "nombre_cliente")
    .agg(
        F.count("*").alias("num_pedidos"),
        F.round(F.sum("importe"), 2).alias("importe_total"),
        F.round(F.avg("importe"), 2).alias("ticket_medio"),
    )
)

# --- Escritura --------------------------------------------------------
(ventas.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(output_ventas))
(resumen.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(output_resumen))

n_ventas = spark.table(output_ventas).count()
n_huerfanos = spark.table(output_ventas).filter(~F.col("es_cliente_valido")).count()
print(f"OK -> {output_ventas}: {n_ventas} filas ({n_huerfanos} pedidos sin cliente válido)")
print(f"OK -> {output_resumen}: {spark.table(output_resumen).count()} clientes")

# El nodo de Validación final revisará estas tablas contra las reglas de
# negocio (integridad referencial, importes, estados, etc.).
