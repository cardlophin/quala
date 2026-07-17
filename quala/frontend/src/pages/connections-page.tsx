import { AlertTriangle, CheckCircle2, Plug, Plus, Server, XCircle } from "lucide-react";
import * as React from "react";
import { useTopbarActions } from "@/components/layout/topbar-slot";
import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { ConnectionFormDialog } from "@/components/shared/connection-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useConnections } from "@/hooks/use-connections";
import { useWarehouses } from "@/hooks/use-warehouses";
import { maskClientId, needsOAuthMigration } from "@/lib/format";
import type { DatabricksConnection } from "@/types";

export function ConnectionsPage() {
  const { data: connections, isLoading, isError, refetch } = useConnections();

  // Ver nota en projects-index-page.tsx: hay que memoizar el nodo que se
  // pasa a useTopbarActions o se produce un bucle de renders infinito.
  const topbarActions = React.useMemo(
    () => (
      <ConnectionFormDialog
        trigger={
          <Button>
            <Plus /> Nueva conexion
          </Button>
        }
      />
    ),
    [],
  );
  useTopbarActions(topbarActions);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Conexiones</h1>
        <p className="text-sm text-muted-foreground">
          Conexiones Databricks guardadas para tus proyectos. Un usuario
          puede tener sesion abierta sin ninguna conexion aqui.
        </p>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={3} />
      ) : isError ? (
        <ErrorState
          message="No se pudieron cargar las conexiones."
          onRetry={() => refetch()}
        />
      ) : !connections || connections.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No tienes conexiones guardadas"
          description="Anade una conexion Databricks para poder crear proyectos."
          action={
            <ConnectionFormDialog
              trigger={
                <Button>
                  <Plus /> Nueva conexion
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => (
            <ConnectionCard key={conn.id} connection={conn} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ connection: conn }: { connection: DatabricksConnection }) {
  const { data: warehouses } = useWarehouses(conn.id);
  const warehouse = warehouses?.find((w) => w.id === conn.warehouse_id);
  const legacy = needsOAuthMigration(conn);

  return (
    <Card>
      <CardHeader>
        <span className="font-medium">{conn.name}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">
          {maskClientId(conn.client_id) || "Sin client_id (conexion antigua)"}
        </p>
        {warehouse && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server className="size-3" strokeWidth={1.5} />
            {warehouse.name}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {conn.status === "success" ? (
            <Badge variant="success">
              <CheckCircle2 /> Conexion exitosa
            </Badge>
          ) : conn.status === "error" ? (
            <Badge variant="destructive">
              <XCircle /> Error de conexion
            </Badge>
          ) : (
            <Badge variant="outline">Sin probar</Badge>
          )}
          {legacy && (
            <Badge variant="warning">
              <AlertTriangle /> Requiere actualizacion
            </Badge>
          )}
        </div>
        {legacy && (
          <ConnectionFormDialog
            migrateFrom={conn}
            trigger={
              <Button size="sm" variant="outline" className="w-full">
                Migrar a OAuth
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
