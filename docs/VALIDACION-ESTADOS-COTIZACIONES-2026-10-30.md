# Validación de estados de proyectos — cotizaciones, 30/10/2026

**Origen:** CSV entregado por el equipo desde la consulta SQL contra PostgreSQL. Datos agregados; este documento no contiene registros identificativos de personas o clientes. **Ámbito:** proyectos `type='development'` no eliminados.

## Consulta ejecutada (solo lectura)

```sql
SELECT
    sales_stage AS etapa_comercial,
    status AS estado_proyecto,
    COUNT(*) AS cantidad
FROM projects
WHERE type = 'development'
  AND deleted_at IS NULL
GROUP BY sales_stage, status
ORDER BY sales_stage, status;
```

## Resultado exacto

| sales_stage | status | cantidad |
| --- | --- | ---: |
| prospect | draft | 1 |
| prospect | active | 13 |
| quoted | draft | 1 |
| quoted | active | 24 |
| approved | draft | 2 |
| approved | active | 41 |
| approved | on_hold | 18 |
| approved | finished | 107 |
| **Total** | | **207** |

Conclusiones sustentadas por esta foto: `prospect|quoted` suma 39; 37 son `active` y 2 `draft`. `approved` suma 168. **No inferir que estado `active` equivale a una versión cotizada aprobada y transferida.** El CSV no informa facturación, HH vendidas/consumidas ni existencia de versiones `quotation_versions`.

## Hallazgo y corrección implementada

La condición anterior de R1 exigía `project.status === 'draft'` para crear/editar versiones. Eso excluía 37/39 proyectos de desarrollo en etapa `prospect|quoted`, pese a que su estado operativo era `active`.

La regla se centraliza en `isQuotationDraftEligibleProject()` dentro de `@kora/contracts`; usada por el caso de uso NestJS, el editor, la tarjeta de cotizaciones y el selector/listado de Calculadora:

- Permitir **solo borradores comerciales** si `type=development`, `salesStage=prospect|quoted` y `status=draft|active`.
- `approved` (aunque esté `draft` operacional), `finished`, `cancelled`, `on_hold` y `support` no habilitan escritura. Lectura de historial sí se conserva para usuarios autorizados.
- Permisos de backend siguen siendo `projects:manage` o `projects:read_assigned` para el **líder del proyecto concreto**; no se amplía acceso por estar `active`.
- No se hace ningún write a `projects.sold_hours`, `project_teams`, `project_modules`, `project_module_tasks`, `project_payment_milestones` ni Forecast. No hay aprobación ni traspaso en R1/R2.
- En Calculadora se incorporan los proyectos `prospect` al listado, y se recorren todas las páginas (no solo 200). Se muestran primero los `prospect`, después `quoted` y finalmente los `approved`.

**Advertencia:** Permitir registrar un borrador de cotización sobre un proyecto marcado `active` no autoriza una revisión/traspaso de alcance al proyecto ejecutado. Para ello se exige un procedimiento R3 con revisión de HH consumidas y facturas; pendiente decisión D05. Es intencional que no se hayan habilitado los campos operativos.

## Matriz de pruebas de elegibilidad

| type | salesStage | status | editar borrador |
| --- | --- | --- | --- |
| development | prospect | draft | Sí |
| development | prospect | active | Sí |
| development | quoted | draft | Sí |
| development | quoted | active | Sí |
| development | approved | draft/active/finished/on_hold | No |
| development | quoted | on_hold/finished/cancelled | No |
| support | cualquiera | cualquiera | No |

Se añadieron pruebas unitarias para estas combinaciones, para Líder PM ajeno y para conservación de la lectura de versiones aprobadas. **Pruebas incorporadas al repositorio, no ejecutadas aún**: el conector GitHub no proporciona un proceso local con dependencias y una base QA.

## Preflight adicional opcional para R3 — solo lectura

Este query **NO es requisito para usar borradores**. Servirá para decidir cómo proteger proyectos activos preexistentes antes del traspaso comercial.

```sql
SELECT
  p.sales_stage,
  COUNT(*) AS proyectos_activos,
  COUNT(*) FILTER (WHERE p.sold_hours > 0) AS con_hh_vendidas,
  COUNT(*) FILTER (WHERE p.used_hours > 0) AS con_hh_registradas,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM project_payment_milestones ppm
      WHERE ppm.project_id = p.id
        AND ppm.status IN ('invoiced', 'paid')
    )
  ) AS con_hitos_facturados_o_pagados
FROM projects p
WHERE p.type = 'development'
  AND p.deleted_at IS NULL
  AND p.sales_stage IN ('prospect', 'quoted')
  AND p.status = 'active'
GROUP BY p.sales_stage
ORDER BY p.sales_stage;
```

**No ejecutar** `0048_project_quotations.sql` ni `pnpm --filter @kora/db migrate` en producción basándose solamente en este CSV. Faltan typecheck y validación en QA.
