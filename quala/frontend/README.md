# Quala (frontend)

Frontend de Quala: conecta credenciales de Databricks, genera datos
sinteticos o valida pipelines contra reglas de negocio escritas en
lenguaje natural.

## Stack

Bun + Vite + React 19 + TypeScript, React Router v7 (data router),
Tailwind v4 + shadcn/ui, Zustand, TanStack Query, TanStack Table.

## Empezar

```bash
bun install
bun run dev
```

Copia `.env.example` a `.env` y ajusta las variables si tienes un backend
real. Por defecto `VITE_USE_MOCK_API=true`, asi que la app funciona sin
backend usando `src/lib/mock-api.ts`.

## Scripts

- `bun run dev` — servidor de desarrollo (Vite).
- `bun run build` — typecheck + build de produccion.
- `bun run preview` — sirve el build de produccion localmente.
- `bun run typecheck` — solo `tsc --noEmit`.

## Estado de la implementacion

Esta primera pasada cubre los fundamentos: stack completo, sistema de
diseno/tokens de marca, modelos de datos (`src/types/`), routing con la
guarda de onboarding, layout global (sidebar + topbar), y las paginas de
Onboarding, Nuevo proyecto, Proyectos y Conexiones ya funcionales contra
la capa mock. El resto de pantallas (Planner, Pipeline, Resultados,
Comparador) son placeholders listos para implementarse en la siguiente
iteracion siguiendo la spec.
