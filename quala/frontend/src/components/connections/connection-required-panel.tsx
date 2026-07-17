import { Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionAssignControl } from "./connection-assign-control";

interface ConnectionRequiredPanelProps {
  projectId: string;
}

/**
 * Se muestra EN LUGAR DEL contenido normal de cualquier sub-flujo que
 * necesite hablar con Databricks (explorar tablas en Validacion de
 * datos, ejecutar un pipeline, correr el planner de generacion
 * sintetica) cuando el proyecto todavia no tiene connection_id. Al
 * asignar una conexion aqui, la pantalla que la use se actualiza sola
 * (ver ConnectionAssignControl / useProject).
 */
export function ConnectionRequiredPanel({ projectId }: ConnectionRequiredPanelProps) {
  return (
    <div className="flex justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Plug className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <CardTitle className="text-base font-medium">
            Este proyecto necesita una conexion Databricks para continuar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionAssignControl projectId={projectId} />
        </CardContent>
      </Card>
    </div>
  );
}
