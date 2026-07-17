import { create } from "zustand";

interface ProjectState {
  /** Proyecto actualmente abierto en el wizard/resultados. */
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
