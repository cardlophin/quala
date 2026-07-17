import { Badge } from "@/components/ui/badge";

/**
 * Logs de ejecucion del pipeline en streaming simulado (seccion 4.1.5 del
 * refactor de paneles de nodo): PipelinePanel va revelando `logs` linea a
 * linea con setTimeout para imitar un stream real; este componente solo se
 * encarga de pintarlos, sin saber nada de la simulacion en si.
 */
export function PipelineLogsStream({
  logs,
  finalStatus,
}: {
  logs: string[];
  finalStatus?: "success" | "failed";
}) {
  if (logs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Logs</p>
        {finalStatus ? (
          <Badge variant={finalStatus === "success" ? "success" : "destructive"}>
            {finalStatus === "success" ? "Exito" : "Error"}
          </Badge>
        ) : null}
      </div>
      <pre className="max-h-64 overflow-y-auto rounded-md border bg-muted p-3 font-mono text-xs">
        {logs.join("\n")}
      </pre>
    </div>
  );
}
