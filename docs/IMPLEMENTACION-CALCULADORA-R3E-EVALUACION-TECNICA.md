# R3-e — Evaluación técnica del acta de conciliación
**Fecha:** 30/10/2026 · **Rama:** `feature/calculadora/carlo` · **Estado:** implementación publicada, suite local pendiente.

## Propósito

R3-d permite guardar actas de discusión con autoría e historial; R3-e agrega un segundo nivel de revisión humana independiente del guardado. Se permite emitir una **evaluación técnica** del último acta registrada, con justificación y segundo usuario. Esto NO aprueba la cotización, no cambia `quotation_versions.status`, no acepta la IA y no permite traspasar actividades/HH/facturas.

### Resultados posibles

- `changes_requested`: el evaluador solicita ajustes a las correspondencias WBS/operativas.
- `reviewed_for_discussion`: el acta fue revisada técnicamente y puede discutirse con el equipo. NO equivale a aprobarla comercialmente ni a ratificar D04–D06.

Siempre se registra `status=technical_review_only` y `transferEnabled=false`; el expediente queda en los eventos de auditoría, no en la cotización operativa.

## Política de permisos provisional y conservadora

- `GET` historial: usuarios autorizados a leer esa cotización (permiso `projects:manage` o `projects:read_assigned` del líder responsable).
- `POST` evaluación técnica: únicamente quien tenga `projects:manage`; la API vuelve a validar el rol y el acceso al proyecto. No es suficiente hacer aparecer el botón en frontend.
- **Separación de funciones:** el usuario que creó la última acta no puede evaluarla él mismo.
- La cotización debe seguir en `draft`, proyecto `development` comercialmente elegible y misma revisión exacta.
- Sólo puede evaluarse la **última acta de esa versión**. Una evaluación por acta (primer resultado gana): después de solicitar cambios, se guarda una nueva acta y se realiza otra evaluación, sin reemplazar ni borrar el evento previo.
- Una revisión marcada `reviewed_for_discussion` se rechaza si hay módulos/actividades pendientes, faltan fundamentos o hay HH/EDT desactualizadas, múltiples destinos de módulo o tarea. `changes_requested` sí admite pendientes: precisamente solicita corregirlos.
- Un cambio relevante de los datos que forman parte del acta canónica obliga a crear otra. Cada resultado exige fundamento escrito de 10 a 2.000 caracteres.

**Pendiente de confirmar con producto:** D02 es todavía una decisión de negocio; este flujo usa `projects:manage` como barrera temporal. En ningún caso un resultado técnico concede autoridad de aprobación contractual.

## Persistencia (sin migración)

Se reutiliza `quotation_events` de la migración 0048 con `action='reconciliation_review_assessed'`. Evento nuevo e independiente de `reconciliation_review_saved`, con:

- `version_id` y `actor_user_id` del servidor.
- `occurred_at` de PostgreSQL.
- `metadata.reviewId` ID del acta original; `versionRevision`, `decision`, `reason`, `status=technical_review_only`, `transferEnabled=false`.

Se usa transacción con `SELECT ... FOR UPDATE` de `quotation_versions` y se revalida antes de insertar que la versión siga siendo el mismo `draft`, la revisión coincida, el acta sea la última guardada, el creador sea otro usuario y no exista ya un evento de evaluación de esa acta. Esto evita dos evaluaciones concurrentes o revisar un acta desplazada por otra.

**No se alteran** `projects`, `project_teams`, `project_modules`, tareas, `quotation_versions`, estados contractuales, hitos de pago, Forecast ni horas registradas. La tabla de eventos continúa sujeta a borrado en cascada si se elimina físicamente el proyecto/versión; no presentarla como archivo de auditoría legal externo.

## Endpoints

GET `/api/estimations/projects/:projectId/quotation/versions/:versionId/reconciliation-assessments`

Devuelve hasta 25 evaluaciones técnicas recientes de la versión, incluyendo ID, acta de referencia, revisión comercial, responsable, fecha, decisión y comentario.

POST `/api/estimations/projects/:projectId/quotation/versions/:versionId/reconciliation-assessments`

~~~json
{
  "reviewId": "UUID-DE-ACTA-GUARDADA",
  "versionRevision": 3,
  "decision": "changes_requested",
  "reason": "Falta conciliar las tareas existentes con las actividades del EDT."
}
~~~

El `reviewId` debe corresponder a la última acta guardada de la versión del proyecto en la ruta. La respuesta contiene `technical_review_only` y `transferEnabled: false`.

## Interfaz React

En Cotizaciones → versión → Analizar conflictos → Preparar acta, al final aparece **Evaluación técnica de actas**:

- Visualiza evaluaciones pasadas junto al registro de cada acta.
- Un usuario habilitado de gestión puede evaluar la última acta de otro autor y registrar un fundamento.
- Si la creó él mismo, hay un mensaje de separación de responsabilidades.
- «Solicitar cambios» permite devolver una acta incompleta; «Revisada para discusión» exige una acta consistente.
- No se ofrecen botones de aprobación comercial, activación ni traspaso.

## Validaciones del corte

1. Un gerente distinto del autor marca `changes_requested` sobre un acta con WBS pendientes; se crea un evento.
2. El mismo gerente intenta evaluar de nuevo la misma acta; se rechaza con 409, no sobreescribe la decisión.
3. Quien guardó el acta intenta autoevaluarse; recibe 403.
4. Un líder sin `projects:manage` intenta evaluar; recibe 403 aunque tenga acceso al proyecto.
5. Si se registra una acta nueva, no se evalúa la anterior como si fuera vigente.
6. Si la revisión comercial cambia después del guardado, se rechaza la evaluación.
7. Si se alteran HH o vínculos relevantes y la reconstrucción canónica difiere, debe crearse acta nueva.
8. Acta incompleta + `reviewed_for_discussion`: 409; mismo acta + `changes_requested`: permitido.
9. La API únicamente inserta `quotation_events`; no cambia tablas de ejecución ni estado comercial.
10. Comprobar visualmente el historial y que jamás aparezca «Aprobada» como resultado de evaluación técnica.

## Comandos PowerShell

~~~powershell
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

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/quotation-reconciliation-reviews.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationReconciliationReviewCard.test.tsx src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

## SQL de auditoría (solo lectura)

~~~sql
SELECT id, version_id, actor_user_id, occurred_at,
       metadata->>'reviewId' AS acta_id,
       metadata->>'decision' AS decision_tecnica,
       metadata->>'status' AS alcance,
       metadata->>'transferEnabled' AS traspaso_habilitado
FROM quotation_events
WHERE action = 'reconciliation_review_assessed'
ORDER BY occurred_at DESC
LIMIT 25;
~~~

## Limitaciones y siguiente corte

El acta es una evidencia para conversación de diseño, no una aprobación. La reconstrucción canónica detecta cambios que alteren los campos del acta; no es una firma criptográfica del estado operativo completo ni un bloqueo transaccional de todas sus tablas. El backend no ejecuta conversiones de fases a tareas ni traspasos. Las políticas definitivas D02/D04/D05/D06 deben acordarse con el equipo antes de desarrollar la aprobación contractual y su transición operativa.

**Sin migración nueva, sin despliegue, sin cambios a master, y sin ejecución de test desde el conector GitHub.**