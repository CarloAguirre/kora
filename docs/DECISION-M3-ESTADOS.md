# Decisión: modelo de estado de proyectos (M3)

Bloqueaba el arranque de M3 según `docs/PLAN-MODULOS.md`. Se resolvió con evidencia
directa del esquema, no por interpretación: el CHECK constraint de
`estado_proyecto` es la prueba.

## Lo que parecía una contradicción

```
    etapa    | fase_proyecto | estado_proyecto | proyectos
-------------+---------------+-----------------+-----------
 Finalizado  | Finalizado    | Activo          |    92   ← "contradictorio"
```

## Lo que en realidad dice el esquema

```sql
"proyecto_estado_proyecto_check" CHECK (estado_proyecto = ANY (
  ARRAY['Activo', 'Inactivo', 'No Iniciado', 'Detenido']
))
```

**`'Finalizado'` nunca fue un valor legal de `estado_proyecto`.** No es que 92
proyectos tengan un dato contradictorio: es que `estado_proyecto` nunca pudo
expresar "terminado" en primer lugar. Son dos campos con propósitos distintos
que coexistieron sin que nadie los reconciliara — exactamente lo que predijo
el plan, y exactamente por lo que se separan en dos conceptos en la v2.

## El tipo de proyecto tampoco es lo que parecía

El catálogo `tipo_proyecto` tiene 14 valores, pero solo 4 se usan:

```
 Aprobado    | 140   ← etapa del embudo comercial
 Soporte     |  27   ← tipo real de proyecto
 Cotización  |  19   ← etapa del embudo comercial
 Prospecto   |   8   ← etapa del embudo comercial
```

Los otros 10 (Desarrollo, Mobile App, API, Integración...) tienen **cero
proyectos**: es catálogo muerto de un diseño anterior. `plan_soporte` y
`soporte_horas` —los campos de compromiso de soporte— solo están poblados en
proyectos con `tipo_proyecto = 'Soporte'`, lo que confirma que ese es el
verdadero discriminador de tipo; Prospecto/Cotización/Aprobado son etapas de
venta de un proyecto de desarrollo, no tipos de proyecto.

## Modelo adoptado

```ts
type: 'development' | 'support'
  // 'support'     si tipo_proyecto legado = 'Soporte'
  // 'development' en cualquier otro caso

salesStage: 'prospect' | 'quoted' | 'approved' | null
  // solo tiene sentido en type='development'; null en 'support'

status: 'draft' | 'active' | 'on_hold' | 'finished' | 'cancelled'
  // finished   si etapa O fase_proyecto legados = 'Finalizado' (manda sobre estado_proyecto)
  // on_hold    si no y estado_proyecto = 'Detenido'
  // draft      si no y estado_proyecto = 'No Iniciado'
  // cancelled  si no y estado_proyecto = 'Inactivo'
  // active     en cualquier otro caso

phase: 'discovery' | 'development' | 'testing' | 'pilot' | 'closed' | null
  // espejo de fase_proyecto legado; null cuando venía vacío (típico en soporte)
```

`status` es la única fuente de verdad del ciclo de vida administrativo.
`phase` es metodológica y solo aplica a proyectos de desarrollo. Ninguno de
los dos puede quedar en un estado que contradiga al otro, porque son columnas
independientes con dominios distintos — el problema de la v1 no puede volver
a ocurrir porque ya no hay dos campos compitiendo por decir la misma cosa.

## Qué queda fuera del alcance de M3

`soporte_proyecto`, `soporte_plan_contrato` y la reconciliación financiera de
horas de soporte se migran en **M5**, donde vive la lógica real (mayormente en
funciones PL/pgSQL como `soporte_has_active_usable_plan`). M3 migra
`plan_soporte` (texto) y `soporte_horas` (numérico) como el compromiso de
soporte declarado en el propio proyecto — el dato legado, no la reconciliación.
