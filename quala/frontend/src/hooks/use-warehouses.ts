import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useWarehouses(connectionId: string | undefined) {
  return useQuery({
    queryKey: ["warehouses", connectionId],
    queryFn: () => api.fetchWarehouses(connectionId!),
    enabled: Boolean(connectionId),
  });
}
