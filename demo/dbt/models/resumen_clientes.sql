-- Agregados por cliente (solo pedidos con cliente válido).
{{ config(materialized='table') }}

select
    cliente_id,
    nombre_cliente,
    count(*)                       as num_pedidos,
    round(sum(importe), 2)         as importe_total,
    round(avg(importe), 2)         as ticket_medio
from {{ ref('ventas_enriquecidas') }}
where es_cliente_valido
group by cliente_id, nombre_cliente
