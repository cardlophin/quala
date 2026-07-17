import { createBrowserRouter, redirect } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { RouteErrorBoundary } from "@/components/shared/route-error-boundary";
import { useSessionStore } from "@/store";
import {
  ConnectionsPage,
  HistoryPage,
  LoginPage,
  NewProjectPage,
  ProjectCanvasPage,
  ProjectsIndexPage,
  SettingsPage,
} from "@/pages";

/**
 * Guarda de AUTENTICACION (identidad de usuario), separada por completo
 * de si el usuario tiene o no conexiones Databricks configuradas. Las
 * conexiones son un recurso mas dentro de la app (CRUD en /connections,
 * o contextual desde /projects/new), no una condicion para entrar.
 */
function appLayoutLoader({ request }: { request: Request }) {
  const { isAuthenticated } = useSessionStore.getState();

  if (!isAuthenticated) {
    const url = new URL(request.url);
    const from = encodeURIComponent(url.pathname + url.search);
    throw redirect(`/login?from=${from}`);
  }

  return null;
}

function loginLoader({ request }: { request: Request }) {
  const { isAuthenticated } = useSessionStore.getState();
  if (isAuthenticated) {
    throw redirect("/projects");
  }
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    loader: loginLoader,
    errorElement: <RouteErrorBoundary />,
  },
  // Compatibilidad con el enlace/ruta antiguos: la conexion Databricks ya
  // no es un paso de bienvenida, ahora es un recurso que se gestiona en
  // /connections.
  {
    path: "/onboarding",
    loader: () => redirect("/connections"),
  },
  {
    path: "/",
    element: <AppLayout />,
    loader: appLayoutLoader,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, loader: () => redirect("/projects") },
      { path: "projects", element: <ProjectsIndexPage /> },
      { path: "projects/new", element: <NewProjectPage /> },
      // Unica pantalla de trabajo del proyecto: el canvas de grafo. Ya no
      // existen subrutas de wizard (planner/pipeline/validation/results/
      // compare); esa funcionalidad vive en los paneles de configuracion
      // de cada nodo, dentro de esta misma pagina.
      { path: "projects/:id", element: <ProjectCanvasPage /> },
      { path: "connections", element: <ConnectionsPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
