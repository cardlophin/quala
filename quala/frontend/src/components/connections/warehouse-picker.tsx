import { Server } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection, useUpdateConnection } from "@/hooks/use-connections";
import { useWarehouses } from "@/hooks/use-warehouses";
import { cn } from "@/lib/utils";

/**
 * Resuelve `warehouse_id` on the fly (seccion 1.2 del refactor de
 * autenticacion): se muestra embebido automaticamente la primera vez que
 * una accion de un nodo necesita ejecutar SQL (ver TableExplorer) y la
 * conexion todavia no tiene warehouse resuelto. Una vez resuelto, se
 * reutiliza para toda la sesion -- este mismo componente, en su estado
 * "colapsado", tambien sirve como el boton "Cambiar warehouse" accesible
 * desde el boton de estado de conexion en la topbar del canvas.
 */
export function WarehousePicker({ connectionId }: { connectionId: string }) {
  const { data: connection } = useConnection(connectionId);
  const { data: warehouses = [], isLoading } = useWarehouses(connectionId);
  const updateConnection = useUpdateConnection();
  const [editing, setEditing] = React.useState(false);

  const current = warehouses.find((w) => w.id === connection?.warehouse_id);
  const showPicker = editing || !connection?.warehouse_id;

  function select(warehouseId: string) {
    updateConnection.mutate({ id: connectionId, patch: { warehouse_id: warehouseId } });
    setEditing(false);
  }

  if (!showPicker && current) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" strokeWidth={1.5} />
          {current.name}
          <Badge variant={current.state === "running" ? "success" : "outline"}>
            {current.state === "running" ? "activo" : "detenido"}
          </Badge>
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Cambiar
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Elige un SQL Warehouse para ejecutar consultas contra esta conexion
      </p>
      <div className="space-y-1.5">
        {warehouses.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => select(w.id)}
            className={cn(
              "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:border-primary/50",
              w.id === connection?.warehouse_id && "border-primary",
            )}
          >
            <span>
              {w.name}{" "}
              <span className="text-xs text-muted-foreground">({w.size})</span>
            </span>
            <Badge variant={w.state === "running" ? "success" : "outline"}>
              {w.state === "running" ? "activo" : "detenido"}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
