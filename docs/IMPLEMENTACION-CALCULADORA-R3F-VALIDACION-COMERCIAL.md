# R3-f · Validación comercial previa al envío (solo lectura)
**Fecha:** 2026-11-01 · **Rama:** `feature/calculadora/carlo`

## Objetivo y límites

Se incorpora un preflight para evaluar la **versión persistida** de una cotización antes de una eventual acción de envío comercial. **NO implementa envío ni aprobación**, ni modifica `quotation_versions`, `projects`, equipos, módulos/tareas, Forecast, facturación ni HH operativas. La API devuelve `sendEnabled:false` de forma incondicional. `contentChecksPassed:true` significa exclusivamente que no se detectaron problemas estructurales: **no implica aprobación comercial**.

El producto mantiene pendientes D02 (responsabilidades y permisos finales), D05 (recotización con ejecución histórica) y D06 (tratamiento monetario/impositivo). La conciliación D04 del EDT permanece separada en R3-a/e para el traspaso operativo.

## API

`GET /api/estimations/projects/:projectId/quotation/versions/:versionId/commercial-preflight`

- Requiere `projects:manage` o `projects:read_assigned`, con la regla de pertenencia efectiva al proyecto; se rechaza una versión ajena **antes** de leer equipos o información operativa.
- Lee la versión guardada, proyecto/snapshot operativo y catálogo de equipos cotizados, incluyendo equipos que hoy están inactivos/eliminados.
- Responde con `projectId`, `versionId`, `versionNumber`, `revision`, `calculatedAt`, `sendEnabled:false`, `contentChecksPassed`, contadores, métricas y hallazgos por `section` y `severity`.
- Es una lectura puntual, no un estado bloqueado transaccionalmente: si se modifica la versión o proyecto, se debe repetir la consulta. La futura acción de envío requerirá revalidación atómica e idempotente.

### Reglas implementadas

| Área | Bloqueos | Advertencias |
|---|---|---|
| Versión/proyecto | Versión no `draft`; proyecto no elegible; nombre vacío | Proyecto activo con ejecución histórica |
| Equipos | Sin equipos; duplicados; ID inexistente/inactivo/eliminado; dedicación/duración/carga cero | Equipo en modo fases sin HH asignadas |
| Fases/HH | Modo fases sin fases, fase sin HH, referencias de equipos inválidas o duplicadas, total HH cero, desfase con HH persistidas | Nombre de fase repetido, HH por fases superiores a capacidad referencial, fases ignoradas si modo equipos |
| Tarifas/montos | Tarifa ausente/cero, total económico inválido/desactualizado | Costos mensuales/anuales quedan fuera del cálculo actual; política D06 pendiente |
| Plan de pagos | Ausente o suma distinta de 100%; hito con 0%; fecha o fase no informada/inexistente | La política económica sigue sin definición D06 |
| IA | IA sin evidencia, pendiente de aceptación, fixture `simulated_fixture`, o análisis editado sin conciliar | Ninguna regla de IA otorga aprobación por sí misma |

**Precaución matemática:** el cálculo oficial actual `calculateQuotation` aplica costos `once`, pero no incorpora costos `monthly` ni `annual`. El preflight no inventa multiplicadores ni bases de comparación: crea `RECURRING_COSTS_EXCLUDED` y mantiene D06 como pendiente. Las tasas `iva19`, `igv18` o `exempt` son valores admitidos por el contrato, **no** una determinación automática de jurisdicción/impuesto.

Las HH de modo `team` se calculan desde colaboradores × duración convertida a semanas × HH por semana × dedicación; en modo `phases` provienen de las HH de las fases referenciadas a equipos. No se obliga a que la capacidad referencial sea idéntica a las HH de fases, porque pueden ser modelos alternativos; en caso de exceso solo se advierte.

## Pantalla

En `Cotizaciones` se agregó tarjeta **R3-f · Validación comercial**, antes de la previsualización de traspaso. **Validar cotización** consulta el GET bajo demanda, agrupa hallazgos en bloqueos y advertencias, muestra HH/montos/porcentaje de pago, y ofrece **Actualizar validación**. Si el editor tiene cambios locales sin guardar, la tarjeta indica que revisa exclusivamente el último snapshot persistido. **No existe** botón de enviar ni de aprobar.

## Pruebas

- Dominio: `quotation-commercial-preflight.spec.ts` cubre caso estructural completo (pero envío bloqueado), equipos inactivos/inexistentes, fases sin HH, plan de pagos 99,99%, errores de fecha/fase, tarifa, descuadre de monto/HH, costos recurrentes, modo equipos, IA pendiente, EDT editada, ejecución histórica y proyectos cerrados.
- Aplicación: `quotation-commercial-preflight.use-case.spec.ts` cubre permisos de gerente/líder asignado, rechazo de líder ajeno, pertenencia de versión y ausencia de métodos de escritura.
- Frontend: `QuotationCommercialPreflightCard.test.tsx` cubre carga bajo demanda, hallazgos, cambios sin guardar, actualización y ausencia de acciones de envío/traspaso.

## Integración PowerShell

```powershell
git switch feature/calculadora/carlo
git status --short
git fetch kora
git pull --ff-only kora feature/calculadora/carlo
git rev-parse --short HEAD

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-commercial-preflight.spec.ts src/modules/estimation/application/use-cases/quotation-commercial-preflight.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationCommercialPreflightCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
```

## Próximo corte

Primero deben acordarse los gates comerciales antes de habilitar `POST /send`: responsables D02, condiciones de recotización D05 y cálculo monetario D06; además debe implementarse/validarse el flujo real de aceptación de IA. Una futura mutación deberá recalcular preflight bajo condiciones transaccionales y registrar auditoría, nunca confiar en `contentChecksPassed` ni `sendEnabled` de una respuesta anterior.

**Estado de verificación:** commits publicados en GitHub. El conector GitHub no ejecuta pnpm ni despliega, por lo que typechecks/pruebas/build de R3-f deben ejecutarse localmente. Sin migración nueva.
