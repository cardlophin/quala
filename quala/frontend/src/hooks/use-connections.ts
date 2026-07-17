import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DatabricksConnection } from "@/types";

const CONNECTIONS_KEY = ["connections"] as const;

export function useConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: api.fetchConnections,
  });
}

export function useConnection(id: string | undefined) {
  return useQuery({
    queryKey: [...CONNECTIONS_KEY, id],
    queryFn: () => api.fetchConnection(id!),
    enabled: Boolean(id),
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Omit<DatabricksConnection, "id" | "status" | "last_tested_at">,
    ) => api.createConnection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<DatabricksConnection>;
    }) => api.updateConnection(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (input: { host: string; client_id: string; client_secret: string }) =>
      api.testConnection(input),
  });
}
