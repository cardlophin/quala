/**
 * Logo real de Databricks para el encabezado del formulario de conexion
 * (seccion 1.1 del refactor de autenticacion). El asset vive en
 * `public/logo-databricks.svg` (servido desde la raiz, igual que
 * `logo-quala.png`), asi que se referencia con una ruta absoluta en vez de
 * importarlo como modulo.
 */
export function DatabricksMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-databricks.svg"
      alt="Databricks"
      className={className ?? "h-5 w-auto"}
    />
  );
}
