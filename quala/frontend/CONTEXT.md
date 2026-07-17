# Contexto: frontend (raíz)

## Última actualización
2026-07-06

## Qué vive aquí
Frontend de Quala: React 19 + TypeScript + Vite + React Router v7 + Tailwind v4 + shadcn/ui + Zustand + TanStack Query. Interfaz en español para validación de datos y generación sintética sobre Databricks, centrada en un canvas de grafo estilo n8n (`/projects/:id`).

## Estado actual
App funcional con mock API (sin backend real todavía). El proyecto se compone en un grafo de 4 tipos de nodo (Fuente de datos, Generar datos sintéticos, Pipeline, Validación) conectados por aristas; cada nodo abre un Dialog modal con pestañas para configurarse. Conexión a Databricks vía OAuth M2M. Ver el `CONTEXT.md` de cada subdirectorio para el detalle.

## Decisiones de diseño tomadas
- "El grafo es la fuente de verdad, los paneles son ventanas a esa verdad": ningún panel de nodo permite configurar manualmente su entrada; siempre se deriva de las aristas del canvas.
- Migración completa de los paneles de nodo de Sheet lateral a Dialog modal con pestañas, para no comprimir el canvas y separar configuración/parámetros/resultados sin un único scroll larguísimo.
- Los alias de fuentes conectadas nunca se inventan a partir del label del nodo; se derivan siempre del nombre real de tabla (helper compartido `resolveSourceAlias`, ver `src/lib/CONTEXT.md`).

## Pendiente de implementar
1. Confirmar el contenido de "PROBLEMA 1", mencionado por el usuario en el mensaje de corrección de bugs de nodos pero cuyo texto completo nunca se compartió en esta sesión — puede haber trabajo pendiente ahí sin documentar.
2. Decidir si el nodo "Generar datos sintéticos" debe aceptar como esquema de referencia también salidas de `pipeline`/`validation`, no solo `data_source` (decisión de alcance tomada para poder avanzar, no confirmada explícitamente por el usuario como definitiva).
3. QA manual en navegador de todo lo implementado en esta sesión — la verificación hecha fue `tsc --noEmit` + `vite build` + diff entre directorio de trabajo y repositorio real, no interacción real en la UI.
4. (No bloqueante) Code-splitting: el bundle principal ya supera 500kB (965kB actual) y Vite avisa en cada build.

## Bugs conocidos / deuda técnica
`pipeline-input-resolver.tsx` (código muerto, neutralizado con `export {}`) puede reaparecer en este repositorio como stub vacío después de sincronizar desde el directorio de trabajo temporal de un agente, porque ese directorio temporal no permite borrar el archivo por una limitación del entorno (mount de solo-adición). Si reaparece, basta con volver a borrar la copia de aquí; no hace falta restaurar ni revisar código.

## Dependencias con otros directorios
Todo el árbol depende de `src/types/graph.ts` (modelo de nodos/aristas) y de los helpers en `src/lib/` (`resolveSourceAlias`, `graph-rules.ts`). Ver el mapa completo en `HANDOFF.md`.

## Para el siguiente agente
Empieza por `HANDOFF.md` en esta misma carpeta. Si vas a tocar paneles de nodo, lee primero `src/components/graph/CONTEXT.md` (contiene el shell compartido `NodeConfigDialog`) y `src/components/graph/panels/CONTEXT.md`.
