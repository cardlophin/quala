// Eliminado: las reglas de negocio ya NO viven en una libreria compartida
// a nivel de proyecto. Cada nodo de Validacion gestiona su propio conjunto
// de reglas (ver ValidationConfig.business_rules en src/types/graph.ts y
// el panel en components/graph/panels/validation-panel.tsx). Para
// reutilizar reglas entre nodos existe la utilidad manual "Copiar reglas
// de otro nodo" dentro de ese mismo panel. Se elimina del workspace real
// al sincronizar.
export {};
