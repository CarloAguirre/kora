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
- La API todavía no está conectada al editor web. El flujo PoC `/poc/*` sigue aislado.
- En esta entrega no se implementa copiar versiones de OTROS proyectos, ni tratar recotización de un proyecto activo o aprobado.
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
```
Si no permite FF, detenerse y revisar divergencia antes de integrar; no hacer `reset --hard`.

## Siguiente corte
1. Verificar migración 0048 en QA (y su consistencia con Drizzle Kit).
2. Integración tests reales de creación concurrente/copias/control de revision/permisos.
3. R1-b/R2: editor web de borradores y navegación desde listado/ficha.
4. R3: validar transiciones, preview y traspaso real solo cuando las decisiones D01–D06 afectadas estén cerradas.
