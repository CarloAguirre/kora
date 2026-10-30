# Implementación inicial — Cotizaciones R1

**Fecha:** 2026-10-30 · **Rama:** `feature/calculadora/carlo`.

## Entregado
- R0: `docs/ROADMAP-REIMPLEMENTACION-CALCULADORA-2026-10-30.md` y `docs/DECISION-COTIZACIONES-VERSIONADAS.md`.
- Contratos Zod nuevos: `packages/contracts/src/estimation/quotation.contract.ts`; no reemplazan los contratos de la PoC IA.
- Esquema Drizzle: `project_quotations` (única por proyecto), `quotation_versions` (snapshot numerado, estado, revisión y montos), `quotation_events` (actor, acción, fecha).
- Migración `0048_project_quotations.sql`, journal `_journal.json` y snapshot `0048_snapshot.json`.
- Puerto `QuotationRepository`, adaptador Drizzle, cálculo determinístico, casos de uso y controlador HTTP protegidos.
- Versiones manuales: creación `v1`, copia `vN` desde **una versión del mismo proyecto**, edición exclusiva de borrador con `revision` optimista; conflictos no silenciosos.
- La copia manual borra `sourceRefs` y `answers` IA. Los costos recurrentes no se incluyen en el neto. Valor HH vacío conserva montos nulos.
- Permisos provisionales restrictivos: `projects:manage` o líder del **proyecto propio** con `projects:read_assigned`, comprobados desde API.
- Validación de equipos: IDs del catálogo real de Kora, activos y no eliminados; no existe PMO hardcodeado.

## Endpoints nuevos
Todos bajo `/api/estimations/projects/:projectId/quotation`, requieren sesión y `projects:manage` o `projects:read_assigned` (más verificación de propiedad en caso de líder):
| Método | Ruta relativa | Función |
|---|---|---|
| GET | `/` | Leer cotización + versiones (o `null` si aún no existe) |
| POST | `/versions` | Crear borrador; body `{}` o `{"sourceVersionId":"UUID"}` |
| PATCH | `/versions/:versionId` | Enviar `revision,name,hourlyRate,currency,tax,draft`; recalcula HH/montos en servidor |

## Seguridad y limitaciones de este corte
- **No se han ejecutado migraciones ni pruebas sobre BD real.** Revisar respaldo y entorno QA antes de ejecutar `pnpm --filter @kora/db migrate`.
- Un borrador editado no escribe `projects`, `project_teams`, `project_modules`, `project_payment_milestones`, ni Forecast. No hay endpoints de envío/aprobación/traspaso.
- La API ya está conectada al editor web de borradores (`/proyectos/:projectId/cotizacion`). El flujo PoC `/poc/*` sigue aislado y requiere `projects:manage`.
- En esta entrega no se implementa copiar versiones de OTROS proyectos, ni aplicar una recotización al plan operativo de un proyecto activo o aprobado. Se permite preparar borradores comerciales aislados en `active` cuando `sales_stage` es `prospect|quoted`.
- Se versiona el snapshot comercial, pero no se ha cerrado la decisión de redondeos/UF, por lo que NO debe habilitarse envío ni facturación antes de D06.
- La autorización provisoria de líderes debe confirmarse con Diseño; la consulta general `projects:read_assigned` **no** da acceso a todas las cotizaciones.
- No existe todavía una verificación de integración continua ni validación con postgresql real de transacciones; efectuar typecheck/test antes de merge o desplegar.

## Checklist de validación local (PowerShell)
```powershell
git switch feature/calculadora/carlo
git fetch kora
git merge --ff-only kora/feature/calculadora/carlo
pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/api test
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web test
```
Si no permite FF, detenerse y revisar divergencia antes de integrar; no hacer `reset --hard`.

## Siguiente corte
1. Verificar migración 0048 en QA (y su consistencia con Drizzle Kit).
2. Integración tests reales de creación concurrente/copias/control de revision/permisos.
3. R2 siguiente: mejorar validaciones de campos, experiencia de estados y pruebas E2E con datos QA. La navegación/editor inicial ya existe.
4. R3: validar transiciones, preview y traspaso real solo cuando las decisiones D01–D06 afectadas estén cerradas.

## R1-b / R2 — Navegación y editor manual (30-oct-2026)

- API web y hooks de React Query: `quotation.api.ts` y `quotation.queries.ts`, con invalidación por proyecto.
- Ruta nueva: `/proyectos/:projectId/cotizacion` protegida por `projects:manage` o `projects:read_assigned`. En el backend se verifica que un Líder PM sea realmente dueño del proyecto.
- El editor resuelve el slug de URL a UUID con `useProjectDetail`: evita enviar el slug a la API de cotizaciones.
- Se pueden crear versiones en blanco, copiar versiones del mismo proyecto, cambiar de versión y modificar borradores. Si hay cambios locales sin guardar al navegar entre versiones, se solicita confirmación.
- Campos: nombre, valor HH/moneda/impuesto, equipos (del catálogo Kora), personas, dedicación, semanas/días, estimación por fases, costos únicos/recurrentes, plan de pago, supuestos y exclusiones.
- Las fases permiten definir semana inicial, duración y HH por equipo. Al cambiar un equipo, la referencia en las fases se actualiza; al quitarlo, se limpian sus HH de fase.
- El resumen muestra montos **guardados**, no una simulación autoritativa del navegador. Advierte cuando hay modificaciones sin guardar.
- Acceso desde `/calculadora`, modal `+ Nueva estimación` (opción manual) y tarjeta `Cotizaciones` en la ficha interna de proyectos de desarrollo.
- La PoC IA conserva `/proyectos/:id/estimacion?mode=ai`. Solo usuarios con `projects:manage` pueden abrir la opción IA porque su API aún usa ese permiso; integrar líderes IA corresponde a R4.
- Los formularios no exponen enviar, aprobar o traspasar, ni modifican tablas de ejecución.

## Preflight PostgreSQL solicitado (solo lectura)

```sql
SELECT sales_stage AS etapa_comercial, status AS estado_proyecto, COUNT(*) AS cantidad
FROM projects
WHERE type = 'development' AND deleted_at IS NULL
GROUP BY sales_stage, status
ORDER BY sales_stage, status;
```

**Resultado recibido 30-oct-2026**: 207 proyectos de desarrollo, de los cuales 39 están en `prospect|quoted`: 2 `draft` y 37 `active`. La regla R1 cambió para permitir borradores aislados en `draft|active` cuando la etapa comercial sea `prospect|quoted`. Etapa `approved`, estado `on_hold|finished|cancelled` y soporte permanecen fuera de escritura hasta definir recotización. Véase `docs/VALIDACION-ESTADOS-COTIZACIONES-2026-10-30.md`.

## Pendientes para considerar estable

1. **No se han ejecutado CI/typecheck/test ni migraciones PostgreSQL** desde el conector GitHub. Los tests solo quedaron añadidos como código; no afirmar que pasaron.
2. Confirmar que la migración 0048, su snapshot/journal y Drizzle Kit no producen diferencias ni fallos contra una BD QA limpia y una BD QA con historial.
3. Revisar API con dos sesiones concurrentes y conflicto 409, copia serializada, validación de equipos activos y versiones bloqueadas.
4. Validar UI completa, incluida navegación con slug, 403/409, pago por fase/fecha, proyecto sin cotización, recarga y permisos de Líder PM.
5. La lista `/calculadora` todavía reutiliza una página de proyectos con límite de 200; la pantalla final de Cotizaciones con filtros específicos de versiones corresponde a R2 posterior. La lista actual ya recorre todas las páginas de proyectos de desarrollo.
6. Resolver D01–D06 con Diseño/Levantamiento antes de cerrar importes comerciales, recotizaciones o traspaso.

## Corte R2-b: artefacto JSON IA y simulación Zurich (30-10-2026)

Ver docs/ARTEFACTO-JSON-IA-COTIZACIONES-2026-10-30.md. Contrato Zod para artefacto trazable, importador del JSON de ejemplo Zurich, mapeo explícito de roles a equipos Kora, conversión de tramos en fases, versión de IA simulada pendiente de revisión y almacenamiento íntegro en quotation_versions.draft.analysis (JSONB de 0048). Corregido aislamiento del nuevo hook en tests de ficha. Sin tests ejecutados desde los commits de este corte y sin nuevas migraciones.
