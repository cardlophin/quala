import os

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.pipelines import (
    NotebookLibrary,
    PipelineLibrary,
)
from databricks.sdk.service.workspace import ImportFormat, Language
from dotenv import load_dotenv

_ = load_dotenv()

w = WorkspaceClient(
    host=os.getenv("DATABRICKS_HOST"),
    client_id=os.getenv("DATABRICKS_CLIENT_ID"),
    client_secret=os.getenv("DATABRICKS_CLIENT_SECRET"),
    auth_type="oauth-m2m",
)

print(f"Conectado: {w}")

NOTEBOOK_PATH = "/Workspace/Shared/mi_pipeline_notebook"

codigo_pipeline = """
from pyspark import pipelines as dp
from pyspark.sql.functions import col, current_timestamp, count, sum, when

source_table = spark.conf.get("source_table")

@dp.table(name="clientes_bronze", comment="Clientes leidos desde origen")
def clientes_bronze():
    return spark.read.table(source_table).withColumn("loaded_at", current_timestamp())

@dp.table(name="clientes_resumen", comment="Resumen de clientes por ciudad")
def clientes_resumen():
    df = spark.read.table("clientes_bronze")
    return (
        df.groupBy("ciudad")
        .agg(
            count("*").alias("total_clientes"),
            sum(when(col("email").isNotNull() & (col("email") != ""), 1).otherwise(0)).alias("clientes_con_email"),
            sum(when(col("edad").isNotNull(), 1).otherwise(0)).alias("clientes_con_edad")
        )
        .withColumn("processed_at", current_timestamp())
    )
"""

w.workspace.upload(
    path="/Workspace/Shared/mi_pipeline_notebook",
    content=codigo_pipeline.encode(),
    format=ImportFormat.SOURCE,
    language=Language.PYTHON,
    overwrite=True,
)
print("Notebook del pipeline subido correctamente")

created_pipeline = w.pipelines.create(
    name="quala-pipeline-nodo",
    catalog="workspace",
    target="sandbox",
    libraries=[PipelineLibrary(notebook=NotebookLibrary(path=NOTEBOOK_PATH))],
    serverless=True,
    continuous=False,
)

print(f"Pipeline creado con ID: {created_pipeline.pipeline_id}")

pipeline = w.pipelines.get(pipeline_id=created_pipeline.pipeline_id)
print(f"\nNombre: {pipeline.name}")
print(f"Catalogo: {pipeline.spec.catalog}")
print(f"Schema: {pipeline.spec.target}")
print(f"Creador: {pipeline.creator_user_name}")
