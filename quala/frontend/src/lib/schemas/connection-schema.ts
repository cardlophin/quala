import { z } from "zod";

// OAuth M2M (Service Principal): ya no se pide http_path/token, se pide
// client_id/client_secret. El warehouse se resuelve despues, on the fly
// (ver WarehousePicker), no en este formulario.
export const connectionSchema = z.object({
  name: z.string().min(1, "Dale un nombre a la conexion"),
  host: z
    .string()
    .min(1, "El host es obligatorio")
    .regex(/\./, "Introduce un host valido, ej. adb-xxxx.azuredatabricks.net"),
  client_id: z.string().min(1, "El Client ID del Service Principal es obligatorio"),
  client_secret: z.string().min(8, "El Client Secret no parece valido"),
  // catalog/schema ya NO se piden aqui: se eligen despues en la interfaz
  // (selector en cascada catalogo -> esquema -> tabla, ver TableExplorer),
  // una vez conectado y con warehouse resuelto.
});

export type ConnectionFormValues = z.infer<typeof connectionSchema>;
