import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PipelineDatabricksResource } from "@/types";

export function useJobs(connectionId: string | undefined) {
  return useQuery({
    queryKey: ["databricks-jobs", connectionId],
    queryFn: () => api.fetchJobs(connectionId!),
    enabled: Boolean(connectionId),
  });
}

export function useLakeflowPipelines(connectionId: string | undefined) {
  return useQuery({
    queryKey: ["databricks-lakeflow-pipelines", connectionId],
    queryFn: () => api.fetchLakeflowPipelines(connectionId!),
    enabled: Boolean(connectionId),
  });
}

/**
 * Verificacion de existencia de un recurso (Job o Pipeline). Se invoca en
 * 3 puntos del flujo del nodo Pipeline (seccion 6 del refactor de grafo):
 * al guardar la seleccion, justo antes de ejecutar, y desde el boton
 * manual "Verificar conexiones" del canvas.
 */
export function useValidateResourceExists() {
  return useMutation({
    mutationFn: ({
      resource,
      connectionId,
    }: {
      resource: PipelineDatabricksResource;
      connectionId?: string | null;
    }) => api.validateResourceExists(resource, connectionId),
  });
}
