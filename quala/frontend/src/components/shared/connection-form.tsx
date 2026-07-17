import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Lock,
  XCircle,
  Zap,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { DatabricksMark } from "@/components/shared/databricks-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateConnection,
  useTestConnection,
  useUpdateConnection,
} from "@/hooks/use-connections";
import {
  connectionSchema,
  type ConnectionFormValues,
} from "@/lib/schemas/connection-schema";
import type { DatabricksConnection } from "@/types";

interface ConnectionFormProps {
  /** Se llama con la conexion recien creada (o migrada) tras guardarla. */
  onCreated?: (connection: DatabricksConnection) => void;
  submitLabel?: string;
  /**
   * Modo migracion (seccion 1.3): precarga nombre/host de una conexion
   * legacy (PAT + http_path) y, al guardar, ACTUALIZA esa misma conexion
   * en vez de crear una nueva -- el http_path/token antiguos se
   * descartan, el warehouse se resuelve de nuevo despues via
   * WarehousePicker.
   */
  migrateFrom?: DatabricksConnection;
}

/**
 * Formulario de conexion Databricks via OAuth M2M (Service Principal):
 * host + client_id + client_secret, sin http_path (se resuelve on the fly,
 * ver WarehousePicker). "Probar conexion" solo confirma que las
 * credenciales autentican contra el host. Reutilizado en:
 * - /connections, dentro de un Dialog ("+ Nueva conexion" o "Migrar a
 *   OAuth" sobre una conexion legacy).
 * - /projects/new, inline, cuando el proyecto necesita una conexion y
 *   todavia no existe ninguna (flujo contextual, no bloqueante).
 */
export function ConnectionForm({
  onCreated,
  submitLabel = "Guardar conexion",
  migrateFrom,
}: ConnectionFormProps) {
  const [showSecret, setShowSecret] = React.useState(false);
  const [testPassed, setTestPassed] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: migrateFrom?.name ?? "",
      host: migrateFrom?.host ?? "",
      client_id: "",
      client_secret: "",
    },
  });

  const testConnection = useTestConnection();
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const isSaving = createConnection.isPending || updateConnection.isPending;

  const [host, clientId, clientSecret] = watch(["host", "client_id", "client_secret"]);
  const canTest = Boolean(host && clientId && clientSecret);

  function onTest() {
    setTestPassed(false);
    testConnection.mutate(
      { host, client_id: clientId, client_secret: clientSecret },
      {
        onSuccess: (result) => {
          if (result.status === "success") setTestPassed(true);
        },
      },
    );
  }

  async function onSubmit(values: ConnectionFormValues) {
    if (migrateFrom) {
      // Migracion: se actualiza la conexion existente y se descartan
      // explicitamente los campos legacy (http_path/token).
      const connection = await updateConnection.mutateAsync({
        id: migrateFrom.id,
        patch: {
          name: values.name,
          host: values.host,
          client_id: values.client_id,
          client_secret: values.client_secret,
          warehouse_id: undefined,
          token: undefined,
          http_path: undefined,
          status: "untested",
        },
      });
      onCreated?.(connection);
      return;
    }

    const connection = await createConnection.mutateAsync({
      name: values.name,
      host: values.host,
      client_id: values.client_id,
      client_secret: values.client_secret,
    });
    onCreated?.(connection);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center gap-2">
        <DatabricksMark />
        <p className="text-sm text-muted-foreground">
          Conecta tu Service Principal de Databricks
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" placeholder="Produccion EU" {...register("name")} />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="host">Host</Label>
        <Input
          id="host"
          placeholder="adb-xxxx.azuredatabricks.net"
          {...register("host")}
        />
        {errors.host ? (
          <p className="text-xs text-destructive">{errors.host.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="client_id">Client ID</Label>
        <Input
          id="client_id"
          placeholder="00000000-0000-0000-0000-000000000000"
          {...register("client_id")}
        />
        {errors.client_id ? (
          <p className="text-xs text-destructive">{errors.client_id.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="client_secret">Client Secret</Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            id="client_secret"
            type={showSecret ? "text" : "password"}
            className="px-9"
            {...register("client_secret")}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showSecret ? "Ocultar client secret" : "Mostrar client secret"}
          >
            {showSecret ? (
              <EyeOff className="size-4" strokeWidth={1.5} />
            ) : (
              <Eye className="size-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
        {errors.client_secret ? (
          <p className="text-xs text-destructive">{errors.client_secret.message}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Recomendado: crea un Service Principal dedicado en tu workspace de
          Databricks en vez de usar un token personal. Esto evita que la
          conexion se rompa si el usuario que lo creo pierde acceso.{" "}
          <a
            href="https://docs.databricks.com/en/admin/users-groups/service-principals.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2"
          >
            Documentacion <ExternalLink className="size-3" />
          </a>
        </p>
      </div>

      <div className="space-y-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={!canTest || testConnection.isPending}
          onClick={onTest}
        >
          {testConnection.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Zap />
          )}
          Probar conexion
        </Button>

        {testConnection.data ? (
          testConnection.data.status === "success" ? (
            <Badge variant="success" className="w-full justify-center py-1.5">
              <CheckCircle2 /> Conexion exitosa
            </Badge>
          ) : (
            <Badge
              variant="destructive"
              className="w-full justify-center py-1.5 text-center"
            >
              <XCircle />
              <span className="truncate">
                {testConnection.data.message ?? "No se pudo conectar"}
              </span>
            </Badge>
          )
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={!testPassed || isSaving}>
        {isSaving ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
