import * as React from "react";

const TopbarSlotContext = React.createContext<{
  actions: React.ReactNode;
  setActions: (node: React.ReactNode) => void;
} | null>(null);

export function TopbarSlotProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);
  const value = React.useMemo(() => ({ actions, setActions }), [actions]);
  return (
    <TopbarSlotContext.Provider value={value}>
      {children}
    </TopbarSlotContext.Provider>
  );
}

/**
 * Permite que una pagina inyecte contenido especifico (buscador, botones)
 * en el AppTopbar global, sin que el layout tenga que conocer cada pagina.
 * Ej: ProjectsIndexPage usa esto para el buscador + "Nuevo proyecto".
 *
 * IMPORTANTE: `node` entra en el array de dependencias de un useEffect.
 * SIEMPRE hay que pasar un nodo memoizado con `React.useMemo` (con las
 * dependencias reales de las que depende ese JSX). Pasar JSX inline sin
 * memoizar crea una referencia nueva en cada render, lo que dispara un
 * bucle de renders infinito (setActions -> re-render -> nuevo nodo ->
 * efecto -> setActions -> ...) que dejaba la app "congelada" hasta
 * refrescar la pagina — ver ProjectsIndexPage y ConnectionsPage para el
 * patron correcto.
 */
export function useTopbarActions(node: React.ReactNode) {
  const ctx = React.useContext(TopbarSlotContext);
  React.useEffect(() => {
    ctx?.setActions(node);
    return () => ctx?.setActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}

export function useTopbarSlotValue() {
  const ctx = React.useContext(TopbarSlotContext);
  return ctx?.actions ?? null;
}
