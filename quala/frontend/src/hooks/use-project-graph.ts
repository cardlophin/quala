import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ProjectGraph } from "@/types";

const GRAPH_KEY = ["project-graph"] as const;

export function useProjectGraph(
  projectId: string | undefined,
  connectionId: string | null | undefined,
) {
  return useQuery({
    queryKey: [...GRAPH_KEY, projectId],
    queryFn: () => api.fetchProjectGraph(projectId!, connectionId ?? null),
    enabled: Boolean(projectId),
    // El grafo se edita constantemente en memoria (nodos/edges); no hace
    // falta refetch automatico, solo la carga inicial.
    staleTime: Infinity,
  });
}

export function useSaveProjectGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (graph: ProjectGraph) => api.saveProjectGraph(graph),
    onSuccess: (_data, graph) => {
      queryClient.setQueryData([...GRAPH_KEY, graph.project_id], graph);
    },
  });
}
