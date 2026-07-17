import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConnectionState {
  /** Conexion Databricks activa/por defecto para nuevos proyectos. */
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string | null) => void;
}

// La LISTA de conexiones vive en el servidor (TanStack Query, ver
// src/hooks/use-connections.ts). Este store solo guarda cual esta activa
// en el cliente, tal como pide la spec (seccion 2).
export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      activeConnectionId: null,
      setActiveConnectionId: (id) => set({ activeConnectionId: id }),
    }),
    { name: "quala-active-connection" },
  ),
);
