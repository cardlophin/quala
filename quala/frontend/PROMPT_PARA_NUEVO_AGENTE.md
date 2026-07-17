Vas a retomar el desarrollo del frontend de **Quala**, una herramienta de validación de datos y generación de datos sintéticos sobre Databricks. Es una app React 19 + TypeScript + Vite + React Router v7 + Tailwind v4 + shadcn/ui + Zustand + TanStack Query, con interfaz completamente en español. El núcleo del producto es un canvas de grafo estilo n8n (ruta `/projects/:id`, construido con @xyflow/react) donde el usuario conecta nodos de 4 tipos: Fuente de datos, Generar datos sintéticos, Pipeline y Validación.

No tienes memoria de sesiones anteriores, pero el proyecto sí: en la raíz de este repo (junto a `package.json`) hay un `HANDOFF.md` y varios `CONTEXT.md` (uno por directorio relevante) que documentan exactamente qué está implementado, qué decisiones de diseño ya se tomaron y qué falta. Son la fuente de verdad para retomar el trabajo sin releer todo el código.

Antes de tocar nada, haz esto en orden:

1. Lee `HANDOFF.md` en la raíz — tiene el resumen ejecutivo de la última sesión y el mapa de todos los `CONTEXT.md` con enlaces.
2. Sigue el orden de lectura recomendado que indica ese mismo `HANDOFF.md` (normalmente: `CONTEXT.md` raíz → `src/types/CONTEXT.md` → `src/lib/CONTEXT.md` → `src/components/graph/CONTEXT.md` → `src/components/graph/nodes/CONTEXT.md` y `src/components/graph/panels/CONTEXT.md` → `src/pages/CONTEXT.md`).
3. Revisa la sección "Trabajo pendiente de mayor prioridad" del `HANDOFF.md` y la sección "Pendiente de implementar" de cada `CONTEXT.md` relevante para la tarea que te pidan — ahí está lo que falta, no en el código.

Reglas importantes de este proyecto que debes respetar:

- El grafo del canvas es la fuente de verdad. Ningún panel de nodo debe permitir configurar manualmente su entrada: siempre se deriva de las aristas (edges) conectadas en el canvas.
- El alias visible de una fuente conectada nunca se inventa a partir del nombre del nodo. Siempre se calcula con el helper compartido `resolveSourceAlias` (`src/lib/format.ts`) a partir del nombre real de la tabla. No reimplementes esta lógica en un componente.
- Cada panel de configuración de nodo (`src/components/graph/panels/`) monta su propio `NodeConfigDialog` (`src/components/graph/node-config-dialog.tsx`), que es un modal con pestañas fijas, contenido con scroll y una barra de acción fija al fondo. No existe ya un `Sheet` lateral para esto.
- Antes de dar por terminado cualquier cambio, verifica con `npx tsc --noEmit` y `npx vite build` que compila limpio.

Cuando termines tu tarea, actualiza el o los `CONTEXT.md` de los directorios que hayas tocado (no los borres ni los reescribas desde cero): añade una sección "Cambios en esta sesión" arriba y actualiza el resto del archivo para que refleje el estado real del código después de tu cambio. Así el siguiente agente puede retomar igual que tú lo hiciste ahora.

Mi tarea concreta es: [DESCRIBE AQUÍ LO QUE NECESITAS QUE HAGA EL AGENTE]
