import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionUser {
  name: string;
  email: string;
}

interface SessionState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  login: (user: SessionUser) => void;
  logout: () => void;
}

// Estado de identidad del usuario (login), separado por completo de las
// conexiones Databricks (ver src/store/connection-store.ts): un usuario
// puede tener sesion abierta sin ninguna conexion configurada.
//
// Mock por ahora (no hay backend de auth todavia). Cuando exista,
// sustituir `login` por una llamada real y `isAuthenticated` por la
// presencia de un token/cookie de sesion valido.
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: "quala-session" },
  ),
);
