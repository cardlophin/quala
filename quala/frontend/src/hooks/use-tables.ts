import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { GenerateSqlRulesRequest } from "@/types";

export function useCatalogs(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalogs", connectionId],
    queryFn: () => api.fetchCatalogs(connectionId!),
    enabled: Boolean(connectionId),
  });
}

export function useSchemas(
  connectionId: string | null | undefined,
  catalog: string | null | undefined,
) {
  return useQuery({
    queryKey: ["schemas", connectionId, catalog],
    queryFn: () => api.fetchSchemas(connectionId!, catalog!),
    enabled: Boolean(connectionId && catalog),
  });
}

export function useTables(
  connectionId: string | null | undefined,
  catalog?: string | null,
  schema?: string | null,
) {
  return useQuery({
    queryKey: ["tables", connectionId, catalog, schema],
    queryFn: () => api.fetchTables(connectionId!, catalog!, schema!),
    enabled: Boolean(connectionId && catalog && schema),
  });
}

export function useTableSchema(
  fullName: string | undefined,
  connectionId?: string | null,
) {
  return useQuery({
    queryKey: ["table-schema", connectionId, fullName],
    queryFn: () => api.fetchTableSchema(fullName!, connectionId),
    enabled: Boolean(fullName),
  });
}

/**
 * Version multi-tabla de useTableSchema: usada por el panel de Validacion
 * para resolver el esquema de TODAS sus fuentes conectadas a la vez (ver
 * ConnectedSource en types/graph.ts), necesario para pasarle el contexto
 * completo a generateSqlRules/suggestBusinessRules cuando hay 2+ fuentes.
 * El orden del resultado coincide con `fullNames`.
 */
export function useTableSchemas(fullNames: string[], connectionId?: string | null) {
  return useQueries({
    queries: fullNames.map((fullName) => ({
      queryKey: ["table-schema", connectionId, fullName],
      queryFn: () => api.fetchTableSchema(fullName, connectionId),
      enabled: Boolean(fullName),
    })),
  });
}

export function useTablePreviewRows(
  fullName: string | undefined,
  connectionId?: string | null,
) {
  return useQuery({
    queryKey: ["table-preview", connectionId, fullName],
    queryFn: () => api.fetchTablePreviewRows(fullName!, connectionId),
    enabled: Boolean(fullName),
  });
}

export function useGenerateSqlRules() {
  return useMutation({
    mutationFn: (request: GenerateSqlRulesRequest) => api.generateSqlRules(request),
  });
}

export type AiSchemaSource = {
  alias: string;
  table: string;
  columns: {
    name: string;
    type: string;
    is_primary_key?: boolean;
    is_foreign_key?: boolean;
  }[];
};

/** Sugerencias de reglas con IA a partir del ESQUEMA (columnas + PK/FK),
 * disparadas manualmente por el usuario con un botón (no auto). */
export function useSuggestRulesAi() {
  return useMutation({
    mutationFn: ({
      sources,
      connectionId,
    }: {
      sources: AiSchemaSource[];
      connectionId?: string | null;
    }) => api.suggestBusinessRulesAi(sources, connectionId),
  });
}

/** Ver validateResourceExists (Jobs/Pipelines): equivalente para nodos "Fuente de datos". */
export function useValidateTableExists() {
  return useMutation({
    mutationFn: ({
      fullName,
      connectionId,
    }: {
      fullName: string;
      connectionId?: string | null;
    }) => api.validateTableExists(fullName, connectionId),
  });
}

/**
 * Sugerencias automaticas de reglas (LLM) para el nodo de Validacion,
 * SIEMPRE derivadas del esquema de las fuentes CONECTADAS a ESE nodo
 * concreto (nunca de un esquema generico de proyecto). Con multi-entrada
 * puede haber varias fuentes a la vez -- se le pasa una por cada una (con
 * su alias) para que tambien pueda sugerir reglas relacionales (JOIN)
 * cuando hay 2+. El caller es responsable de pasar un array vacio cuando
 * el nodo no tiene ninguna fuente conectada, para que la query se quede
 * deshabilitada.
 */
export function useSuggestedRules(
  sources: { alias: string; table: string }[],
  connectionId?: string | null,
) {
  return useQuery({
    queryKey: ["suggested-rules", connectionId, sources],
    queryFn: () => api.suggestBusinessRules(sources, connectionId),
    enabled: sources.length > 0,
  });
}
