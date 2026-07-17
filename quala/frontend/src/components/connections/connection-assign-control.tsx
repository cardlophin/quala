import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionFormDialog } from "@/components/shared/connection-form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnections } from "@/hooks/use-connections";
import { useUpdateProject } from "@/hooks/use-projects";

interface ConnectionAssignControlProps {
  projectId: string;
  currentConnectionId?: string | null;
  /** Se llama tras persistir con exito, para que el padre pueda p.ej. cerrar un modo "editar". */
  onAssigned?: () => void;
}

/**
 * Select de conexiones existentes + atajo para crear una nueva
 * (reutilizando el mismo ConnectionFormDialog de /connections). Elegir o
 * crear una conexion aqui persiste inmediatamente `connection_id` en el
 * proyecto via useUpdateProject; TanStack Query invalida la cache y
 * cualquier pantalla que dependa de `useProject(id)` se actualiza sola,
 * sin recargar la pagina.
 */
export function ConnectionAssignControl({
  projectId,
  currentConnectionId,
  onAssigned,
}: ConnectionAssignControlProps) {
  const { data: connections = [] } = useConnections();
  const updateProject = useUpdateProject();

  async function assign(connectionId: string) {
    await updateProject.mutateAsync({
      id: projectId,
      patch: { connection_id: connectionId },
    });
    onAssigned?.();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={currentConnectionId ?? undefined}
        onValueChange={assign}
        disabled={updateProject.isPending}
      >
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue placeholder="Selecciona una conexion" />
        </SelectTrigger>
        <SelectContent>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ConnectionFormDialog
        trigger={
          <Button variant="secondary" size="sm">
            <Plus /> Crear nueva conexion
          </Button>
        }
        onCreated={(connection) => assign(connection.id)}
      />
    </div>
  );
}
