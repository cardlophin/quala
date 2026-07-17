import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  GenerationPlan,
  PipelineDatabricksResource,
  RuleSet,
  SchemaContextSource,
} from "@/types";

// Mutaciones especificas de cada tipo de nodo del canvas. No usan
// invalidacion de cache de TanStack Query porque su resultado se guarda
// directamente en el `data` del nodo de React Flow (ver ProjectCanvasPage),
// que a su vez dispara el autosave del grafo completo.

export function useRunValidation() {
  return useMutation({
    mutationFn: ({
      ruleSet,
      connectionId,
      warehouseId,
    }: {
      ruleSet: RuleSet;
      connectionId?: string | null;
      warehouseId?: string | null;
    }) =>
      api.runValidation(
        ruleSet,
        connectionId ? { connectionId, warehouseId } : undefined,
      ),
  });
}

export function useGeneratePlan() {
  return useMutation({
    mutationFn: ({
      description,
      schemaContext,
    }: {
      description: string;
      schemaContext?: SchemaContextSource[] | null;
    }) => api.generatePlan(description, schemaContext),
  });
}

export function useRunGeneration() {
  return useMutation({
    mutationFn: (plan: GenerationPlan) => api.runGeneration(plan),
  });
}

export function useWriteSynthetic() {
  return useMutation({
    mutationFn: (params: {
      connectionId: string;
      plan: GenerationPlan;
      catalog: string;
      schema: string;
      warehouseId?: string | null;
    }) => api.writeSyntheticToDatabricks(params),
  });
}

export function useRunPipeline() {
  return useMutation({
    mutationFn: ({
      resource,
      inputTable,
      params,
      connectionId,
    }: {
      resource: PipelineDatabricksResource;
      inputTable: string;
      params?: Record<string, string> | null;
      connectionId?: string | null;
    }) => api.runPipeline(resource, inputTable, params, connectionId),
  });
}
