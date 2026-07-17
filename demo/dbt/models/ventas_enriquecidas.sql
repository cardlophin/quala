-- Enriquecimiento de pedidos con datos del cliente.
-- LEFT JOIN a propósito: conservamos los pedidos cuyo cliente NO existe
-- (casos límite sintéticos) para que la validación final los detecte.
{{ config(materialized='table') }}

with clientes as (
    select
        cliente_id,
        nombre,
        email,
        ciudad
    from {{ source('quala', 'clientes') }}
),

pedidos as (
    select
        pedido_id,
        cliente_id,
        fecha_pedido,
        importe,
        estado
    from {{ source('quala_sandbox', 'pedidos_sinteticos') }}
)

select
    p.pedido_id,
    p.cliente_id,
    c.nombre        as nombre_cliente,
    c.email,
    c.ciudad,
    p.fecha_pedido,
    p.importe,
    p.estado,
    c.cliente_id is not null                              as es_cliente_valido,
    case
        when p.importe >= 200 then 'VIP'
        when p.importe >= 100 then 'Medio'
        else 'Bajo'
    end                                                   as segmento
from pedidos p
left join clientes c on p.cliente_id = c.cliente_id
