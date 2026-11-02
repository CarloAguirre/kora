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

## Corte R2-c · 30/10/2026

Visor de evidencia EDT/ERS/cronograma integrado a cotización con `analysis`, descarga del JSON original, y comparador de versiones por HH, equipo e importe comparable. En API se añade `reconcileQuotationAnalysis`: protege la evidencia original y define servidor-side el estado `synced|modified`. Ver [IMPLEMENTACION-CALCULADORA-R2C-VISOR-COMPARADOR.md](./IMPLEMENTACION-CALCULADORA-R2C-VISOR-COMPARADOR.md) para pruebas y comandos. No se ejecutaron pruebas ni migraciones con el conector.

## R3-a · Previsualización read-only, 30/10/2026

GET /api/estimations/projects/:projectId/quotation/versions/:versionId/transfer-preview y widget para comparar propuesta con estado operativo real. Ver docs/IMPLEMENTACION-CALCULADORA-R3A-PREFLIGHT.md. NO hay envío, aprobación ni traspaso. No requiere migración nueva. Validación local pendiente.

## R3-b — EDT contra ejecución (30/10/2026)

Extiende el GET preflight read-only de R3-a con `edtReconciliation`: comparación informativa de nombres de módulos y tareas, HH base EDT y actividades WBS, evitando fusiones automáticas e identificando homónimos y propuestas desactualizadas. Ver docs/IMPLEMENTACION-CALCULADORA-R3B-EDT-CONCILIACION.md. D04–D06 continúan abiertas; transferEnabled=false.

## R3-c — Acta JSON D04 (30/10/2026)

Se incorpora revisión local de correspondencias humanas entre módulos/actividades EDT y módulos/tareas operativos, exportable como JSON `draft_for_discussion` sin permiso de traspaso. No escribe en BD y no requiere migración. Ver `docs/IMPLEMENTACION-CALCULADORA-R3C-ACTA-CONCILIACION.md`. Pruebas por ejecutar localmente.

## R3-d — Actas de conciliación persistidas (30/10/2026)

GET/POST de historial de actas `draft_for_discussion` registradas como eventos append-only en `quotation_events` con actor y timestamp. API recompone el acta y verifica pertenencia a proyecto, versión/revisión, UUID y estado operativo; UI añade guardar e historial. **Sin migración nueva; sin aprobación ni traspaso de ejecución**. Ver docs/IMPLEMENTACION-CALCULADORA-R3D-ACTAS-AUDITABLES.md. Pruebas pendientes en checkout del usuario.

## R3-e — Evaluación técnica de actas (30/10/2026)

Segundo usuario con `projects:manage` puede registrar evento `reconciliation_review_assessed` para la última acta, indicando `changes_requested` o `reviewed_for_discussion`, con motivos y separación de autoría; no afecta `quotation_versions` ni las HH operativas. Ver docs/IMPLEMENTACION-CALCULADORA-R3E-EVALUACION-TECNICA.md. Pendiente QA en checkout.

## R3-f — Validación comercial previa al envío (01/11/2026)

GET de solo lectura sobre versión persistida, equipos reales y snapshot operativo: comprobaciones por modo equipos/fases, HH, tarifa, impuestos, pagos, IA y datos históricos. Interfaz con bloqueos/advertencias. Siempre `sendEnabled:false` y sin mutaciones. Ver `docs/IMPLEMENTACION-CALCULADORA-R3F-VALIDACION-COMERCIAL.md`; pendiente ejecución de suite local.

## R3-g — Expediente interno de revisión comercial (01/11/2026)

Nuevo GET protegido para construir un JSON interno desde la versión persistida y el preflight R3-f calculado en servidor. Incluye HH, equipos/fases, importes, costos, pagos, hallazgos y D02/D05/D06 pendientes. La UI permite descargarlo sin guardar datos adicionales ni habilitar estados o acciones de envío/aprobación/traspaso. No incluye respuestas del cuestionario ni URLs de fuentes. Ver `docs/IMPLEMENTACION-CALCULADORA-R3G-EXPEDIENTE-INTERNO.md`. QA pendiente.

## R4-a — Preguntas F01–F05 integradas al flujo IA (01/11/2026)

El workspace deja de enviar `answers: []` automáticamente, carga las cinco preguntas fijas y muestra un stepper antes de `/poc/proposal-answered`, que valida IDs, obligatoriedad, tipos, opciones y duplicados. Se corrigió el fallback KDM para que no sustituya documentos de proyectos reales cuando Drive está sin configurar. Sigue pendiente la lectura documental para preguntas dinámicas y la creación de versiones comerciales desde IA. Ver `docs/IMPLEMENTACION-CALCULADORA-R4A-CUESTIONARIO-FIJO.md`. QA local pendiente.

## Integración visual v5 + KDM/Gemini y cotización versionada (02/11/2026)

Cotizaciones se traslada a pestaña de ficha de desarrollo, manteniendo los componentes y estilos existentes. Nuevo modal para IA demo KDM, borrador en blanco o copia (también entre proyectos con permisos). Gemini analiza KDM y genera preguntas dinámicas justificadas por fuentes, cuestionario y propuesta real; la API persiste versión de IA pendiente, y el editor mapea perfiles a equipos con HH deterministas. Sin envío ni traspaso operativo. Ver `docs/IMPLEMENTACION-CALCULADORA-V5-TAB-KDM-GEMINI.md`. QA local pendiente.

## R4-c — EDT Gemini KDM y baseline operativo inicial (02/11/2026)

Se corrigieron imports TS2304 y expectativa de test R4-a. Gemini genera módulos, WBS y tareas desde KDM, con reparto HH exacto y persistencia de EDT en quotation_versions.draft.aiPoc. Gerencia puede aceptar la planificación inicial de la última versión solo en proyectos sin ejecución ni facturación: transacción en project_teams, project_modules y projects.sold_hours, sin cambiar estado comercial ni generar pagos. Roadmap muestra tareas de referencia sin fechas desde la versión aplicada; las tareas operativas siguen independientes. Ver docs/IMPLEMENTACION-CALCULADORA-R4C-EDT-ROADMAP-ACEPTACION.md. Tests y build local pendientes.

## R4-d — Asistente IA v5 con cinco etapas reales (02/11/2026)

El tab Cotizaciones abre un modal IA de Análisis → Entendimiento editable → Condiciones F01–F05 agrupadas → Aclaraciones dinámicas → Confirmación. Se elimina la navegación automática a la PoC y el envío sin revisión. Gemini analiza KDM explícitamente, prellena condiciones solo con evidencia, permite supuestos marcados como pendientes y recibe el resumen confirmado del usuario en roles/EDT. Se conservan diseño Kora, APIs, JSONB y guardado transaccional. Ver `docs/IMPLEMENTACION-CALCULADORA-R4D-ASISTENTE-V5.md`. Pruebas locales pendientes.
