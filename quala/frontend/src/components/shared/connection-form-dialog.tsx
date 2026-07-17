import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DatabricksConnection } from "@/types";
import { ConnectionForm } from "./connection-form";

interface ConnectionFormDialogProps {
  trigger: React.ReactNode;
  title?: string;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (connection: DatabricksConnection) => void;
  /** Ver ConnectionForm: si se pasa, el dialog reabre en modo migracion. */
  migrateFrom?: DatabricksConnection;
}

export function ConnectionFormDialog({
  trigger,
  title,
  description = "Conecta un workspace de Databricks para poder generar o validar datos contra el.",
  open,
  onOpenChange,
  onCreated,
  migrateFrom,
}: ConnectionFormDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title ?? (migrateFrom ? "Migrar conexion a OAuth" : "Nueva conexion Databricks")}
          </DialogTitle>
          <DialogDescription>
            {migrateFrom
              ? `Vuelve a autenticar "${migrateFrom.name}" con un Service Principal. El host y el nombre ya estan precargados; el HTTP path antiguo se descarta y el warehouse se resolvera de nuevo la proxima vez que haga falta.`
              : description}
          </DialogDescription>
        </DialogHeader>
        <ConnectionForm
          migrateFrom={migrateFrom}
          submitLabel={migrateFrom ? "Migrar conexion" : undefined}
          onCreated={(connection) => {
            setOpen(false);
            onCreated?.(connection);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
