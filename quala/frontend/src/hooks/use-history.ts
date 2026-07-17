import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useHistory() {
  return useQuery({
    queryKey: ["history"],
    queryFn: api.fetchHistory,
  });
}
