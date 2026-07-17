import { History } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/hooks/use-history";

export function HistoryPage() {
  const { data: entries, isLoading, isError, refetch } = useHistory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Listado cronologico de todas las ejecuciones de generacion y
          validacion.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="No se pudo cargar el historial."
          onRetry={() => refetch()}
        />
      ) : !entries || entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Todavia no hay ejecuciones"
          description="Cuando generes datos o valides un pipeline, apareceran aqui."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between p-3 text-sm">
              <span>{entry.project_name}</span>
              <span className="text-muted-foreground">{entry.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
