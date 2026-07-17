// Selector de capa de datos: mock o backend real, segun VITE_USE_MOCK_API.
//
// Por defecto usa el mock (VITE_USE_MOCK_API distinto de "false"). Pon
// VITE_USE_MOCK_API=false + VITE_API_BASE_URL=http://localhost:8000 para
// hablar con el backend FastAPI real.
//
// Los hooks importan `api` desde aqui (en vez de "@/lib/mock-api"), asi que
// cambiar de mock a real no toca ningun hook. Como ambos modulos exponen las
// MISMAS firmas, TypeScript verifica que no diverjan.

import * as mock from "./mock-api";
import * as real from "./api";

const useMock = import.meta.env.VITE_USE_MOCK_API !== "false";

export const api = useMock ? mock : real;
export const usingMockApi = useMock;
