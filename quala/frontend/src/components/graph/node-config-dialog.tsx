import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import * as React from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/graph/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { QualaNodeStatus } from "@/types";

export interface NodeConfigTab {
  value: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

/**
 * Shell comun del panel de configuracion de un nodo: Dialog modal
 * centrado con pestanas, no un Sheet lateral (migracion "Sheet -> Dialog
 * con pestanas"), para que el canvas no se comprima mientras el panel esta
 * abierto y para poder separar configuracion/datos/esquema sin amontonar
 * todo en un solo scroll vertical largo.
 *
 * Estructura de arriba a abajo, todo fijo salvo el contenido de la
 * pestana activa:
 *  1. Encabezado: icono + nombre editable (click to edit) + badge de
 *     estado + boton cerrar, con separacion explicita entre badge y
 *     boton (antes chocaban).
 *  2. Barra de pestanas (subrayado en la activa), especifica por tipo de
 *     nodo -- la arma cada panel via la prop `tabs`.
 *  3. Contenido de la pestana activa, UNICA zona con scroll interno.
 *     Las pestanas inactivas se mantienen montadas (forceMount + ocultas
 *     con `hidden`, no desmontadas) para que su estado local (inputs sin
 *     confirmar, scroll, etc.) sobreviva a cambiar de pestana y volver.
 *  4. Barra de accion fija al fondo (opcional): el boton de accion
 *     principal del nodo, visible siempre sin importar la pestana activa
 *     ni cuanto se haya scrolleado el contenido.
 */
export function NodeConfigDialog({
  open,
  onOpenChange,
  icon: Icon,
  nodeTypeLabel,
  label,
  onLabelChange,
  status,
  tabs,
  defaultTab,
  actionBar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  /** Tipo de nodo fijo, ej. "Validacion" / "Pipeline" (no editable). Tambien
   * sirve de placeholder visual mientras el usuario no le haya puesto un
   * nombre propio al nodo (label === nodeTypeLabel). */
  nodeTypeLabel: string;
  /** Nombre propio del nodo, editable (ej. "Validar pedidos antes de facturar"). */
  label: string;
  onLabelChange: (label: string) => void;
  status: QualaNodeStatus;
  tabs: NodeConfigTab[];
  /** Pestana activa al abrir el dialog. Por defecto, la primera. */
  defaultTab?: string;
  /** Barra de accion fija al fondo (ej. boton "Ejecutar pipeline"). Si no
   * se pasa, no se renderiza barra de accion (ej. Fuente de datos). */
  actionBar?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);
  const firstTabValue = tabs[0]?.value;
  const [activeTab, setActiveTab] = React.useState(defaultTab ?? firstTabValue);

  React.useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  // Cada vez que el dialog se abre (para este nodo u otro) vuelve a la
  // primera pestana -- pero mientras sigue abierto para el MISMO nodo,
  // cambiar de pestana nunca reinicia nada (criterio de aceptacion 3).
  React.useEffect(() => {
    if (open) setActiveTab(defaultTab ?? firstTabValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startEditing() {
    setDraft(label);
    setEditing(true);
  }

  function confirm() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onLabelChange(trimmed);
    setEditing(false);
  }

  function cancelEditing() {
    setDraft(label);
    setEditing(false);
  }

  const isPlaceholder = label === nodeTypeLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-h-[720px] w-full max-w-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
      >
        <DialogHeader className="shrink-0 gap-0 space-y-0 border-b px-6 py-4">
          {/* Titulo accesible para Radix (requerido), oculto visualmente:
              el nombre editable de abajo cumple el mismo rol para el ojo
              humano pero necesita quedar fuera de <DialogTitle> para no
              chocar con el rol de encabezado. */}
          <DialogTitle className="sr-only">
            {nodeTypeLabel}: {label}
          </DialogTitle>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon className="size-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={confirm}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    else if (e.key === "Escape") cancelEditing();
                  }}
                  className="h-7 border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
                  aria-label="Nombre del nodo"
                />
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className={cn(
                    "-mx-1 block max-w-full truncate rounded-sm px-1 text-left text-base font-semibold hover:bg-accent/60",
                    isPlaceholder && "font-normal text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              )}
            </div>
            {/* Separacion explicita entre el badge y el boton de cerrar
                (gap-3 propio, ademas del gap-2.5 general de la fila) --
                antes quedaban pegados. */}
            <StatusBadge status={status} className="ml-2 shrink-0" />
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="ml-3 shrink-0 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col gap-0 overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 mb-1 h-auto w-fit shrink-0 justify-start gap-1 rounded-xl bg-muted p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={tab.disabled}
                className="flex-none rounded-lg border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              forceMount
              className={cn(
                "flex-1 overflow-y-auto px-6 py-5 outline-none",
                activeTab === tab.value ? "" : "hidden",
              )}
            >
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>

        {actionBar ? (
          <div className="shrink-0 border-t bg-muted/30 px-6 py-4">{actionBar}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
