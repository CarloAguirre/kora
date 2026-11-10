# R4-e · Kora v5 — flujo comercial versionado y tabla Proyectos

**Rama:** \`feature/calculadora/carlo\`  
**Fecha:** 2026-11-02  
**Documento de referencia:** «Especificación · Calculadora de estimaciones integrada a Kora», 26 de octubre de 2026, secciones 2, 4, 5, 7, 8, 9, 11 y 12. **Se reutiliza el diseño visual existente de Kora**; el HTML \`kora-proyectos-v5.html\` guía los estados, el orden y la disposición.

**Estado técnico:** cambios publicados en GitHub. Compilación, tests e integración PostgreSQL aún no ejecutados en este corte; no PR, despliegue ni migración nueva.

## 1. Proyectos: filtros y columna Cotización

El listado **Proyectos Desarrollo** añade:

- Filtro **Tipo de proyecto**: \`projects.sales_stage\` = Prospecto (\`prospect\`), Cotización (\`quoted\`), Aprobado (\`approved\`).
- Filtro **Cotización**: Sin cotización, En cotización, Enviada al cliente, Traspaso pendiente, Traspasada, Planificación preliminar aplicada (compatibilidad con eventos históricos R4-c).
- Columnas **Tipo de proyecto** y **Cotización** en la tabla existente, conservando \`DataTable\`, \`MultiSelect\`, gráfico, paginación y estilos Kora. Las versiones enviadas también se distinguen con línea azul discreta en la ficha.

El estado Cotización se calcula de **registros reales** \`project_quotations\`, \`quotation_versions\` y \`quotation_events\` en PostgreSQL. No se deduce de \`sales_stage\`, por lo que un proyecto \`approved\` sin versiones nuevas de la calculadora mostrará "Sin cotización" (no se inventa un traspaso del sistema anterior).

La búsqueda, el orden y la paginación usan backend. Los datos comerciales del resultado se ocultan para actores sin \`projects:manage\` o que no sean el Líder PM asignado. El filtro comercial también se acota al líder para evitar inferir estados de proyectos ajenos mediante conteos.

## 2. Elegibilidad y permisos

Se permite crear **versiones** para proyectos de desarrollo con \`sales_stage\` \`prospect\`, \`quoted\` o \`approved\`, y estado operativo \`draft\` o \`active\`. No se permite modificar cotizaciones de proyectos detenidos, terminados, cancelados o de soporte. Cuando un cliente vuelve tras una detención, primero debe reactivarse el proyecto conforme a las políticas de Kora.

Gerencia/PMO (\`projects:manage\`) y el Líder PM asignado (\`projects:read_assigned\` + coincidencia con \`project.leaderUserId\`) pueden usar IA, crear, copiar, editar, enviar, aprobar y traspasar cotizaciones, con verificación en el backend. Una copia entre dos proyectos exige autorización de ambos; no hereda las fuentes ni la aceptación IA del origen. El usuario no asignado no accede por estas rutas. **Crear un proyecto desde un prospecto** sigue regido por la política de creación existente y no se delega al Líder PM.

La recotización comercial **no modifica** ejecución, HH consumidas, fechas, pagos o Roadmap por el mero hecho de crear una nueva versión.

## 3. Estados y acciones comerciales separadas

Cuatro endpoints auditados en \`QuotationController\`:

| Acción | Endpoint POST por proyecto y versión | Cambio permitido |
| --- | --- | --- |
| Aceptar propuesta IA | \`/versions/:versionId/accept-ai\` | \`ai_review_status: pending → accepted\`, versión permanece \`draft\`, evento \`ai_proposal_accepted\` |
| Marcar enviada | \`/versions/:versionId/mark-sent\` | \`draft → sent\`, \`sent_at\` y evento \`quotation_marked_sent\`. No envía email |
| Registrar aprobación | \`/versions/:versionId/approve-client\` | \`draft/sent → approved\`, fecha, evento; \`projects.sales_stage=approved\`. Otra versión aprobada vuelve a \`sent\` |
| Traspasar cotización aprobada | \`/versions/:versionId/transfer-approved\` | Solo \`approved\` vigente. Escritura de datos operativos y evento \`quotation_transferred\` |

Las acciones son transaccionales individualmente, con control de revisión, bloqueo de filas, autorización y registro append-only. Marcar enviada y aprobar exigen valor HH positivo, horas/equipos y plan de pagos al 100 %. Para versiones IA se requiere aceptar explícitamente la propuesta. Una versión enviada o aprobada es inmutable; se crean nuevas versiones ante cambios.

**Aceptar IA jamás escribe** \`projects\`, \`project_teams\`, \`project_modules\`, hitos ni horas. El antiguo endpoint \`apply-plan\` que escribía desde borrador ahora devuelve conflicto, y su botón se quitó. La EDT aparece en consulta hasta el traspaso.

La aprobación desde Borrador muestra confirmación explícita de que no hay envío registrado. La opción **Aprobar y traspasar ahora** efectúa las dos acciones de servidor de forma secuencial: si la aprobación se registra pero el traspaso falla por datos preexistentes, se informa y **queda un traspaso pendiente real**; no se dice que ambas operaciones fueran una única transacción.

## 4. Traspaso: alcance seguro y explícito

La primera versión del traspaso solo opera en proyectos \`approved\` y **No iniciados** (\`status=draft\`) sin HH vendidas/consumidas, facturas, registros de horas, equipos, módulos, contrato ni fecha de inicio. Se aceptan exclusivamente los dos hitos predeterminados de Kora aún intactos, pendientes y en monto cero; se reemplazan por el plan comercial aprobado únicamente al traspasar. Se revisan las HH de equipos contra el total y la distribución de módulos. Para una EDT IA editada manualmente con divergencias todavía no conciliadas se rechaza el traspaso, sin inventar la redistribución de WBS.

En la misma transacción PostgreSQL se registran equipos activos, cupos, HH vendidas, módulos/fases y plan de pagos; se guardan \`projects.contract_amount\` y moneda; se emite \`quotation_transferred\` con autor, fecha y módulo(s). Se preservan HH consumidas y no se crean fechas ficticias de tareas ni se modifica automáticamente \`projects.status\`: el Hito 0 se maneja luego con las reglas existentes.

**Proyectos aprobados con ejecución/facturación:** pueden recotizar y aprobar nuevas versiones, pero el traspaso **se bloquea** hasta implementar una conciliación histórica específica (D05). No se reemplazan silenciosamente equipos, HH consumidas o hitos facturados; esta porción de los flujos 6a/13 sigue pendiente de negocio.

## 5. Regla del primer inicio del proyecto

Al pasar \`No iniciado → Activo\`, un prospecto o cotizado debe haber pasado a Aprobado. Un proyecto con cotización real debe tener la **versión aprobada y traspasada**. Se comprueba tanto en el cambio manual de estado como al resolver una aprobación de Gerencia y en el disparador de Hito 0 al facturar el primer hito.

Para preservar proyectos heredados del sistema anterior, los aprobados que **no tienen registros de la calculadora nueva** conservan su comportamiento previo; esta compatibilidad no se debe confundir con una aprobación/traspaso ficticios.

## 6. UI y observabilidad

El editor de Kora \`QuotationWorkspacePage\` incorpora \`QuotationCommercialLifecycleCard\`, con acciones y confirmaciones separadas. La ficha \`ProjectQuotationCard\` permite abrir cada versión, registrar aprobación, traspasar desde una versión aprobada y consultar los importes de la versión traspasada. El resumen comercial nunca se expone en la vista de cliente; se muestra solo en la ficha interna a usuarios autorizados. Se mantienen componentes y estilos del proyecto, sin copiar el CSS del prototipo.

El asistente IA R4-d conserva el PDF KDM de demostración como fuente temporal de Drive. **Gemini sí procesa el PDF y genera las estimaciones** cuando está configurado, pero el documento no corresponde necesariamente al proyecto real. Las acciones comerciales avisan de esa procedencia; evitar usarlas con clientes reales hasta conectar y validar el Drive adecuado.

## 7. QA local

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

pnpm --filter @kora/contracts exec vitest run src/estimation/quotation.contract.spec.ts
pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-commercial-eligibility.spec.ts src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts src/modules/projects/application/use-cases/change-project-status.use-case.spec.ts src/modules/projects/application/use-cases/issue-project-payment-milestone-invoice.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationPlanningAcceptanceCard.test.tsx src/modules/estimation/components/QuotationCommercialLifecycleCard.test.tsx src/modules/estimation/components/NewProjectQuotationModal.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

### Validación manual/BD (solo DEV/QA, no producción)

1. En Proyectos Desarrollo verificar que **Tipo de proyecto** filtra prospectos incluso cuando hay 0 cotizaciones. Verificar **Cotización** y los badges desde versiones reales. Cambiar páginas/orden y revisar resultados.
2. Como usuario sin la calculadora, comprobar que no aparece información comercial. Como Gerencia y como Líder PM asignado, abrir Cotizaciones y crear versión manual/IA con el mismo nivel de permisos. Un líder no asignado debe obtener 403.
3. En un proyecto aprobado y activo existente, crear una nueva versión sin modificar horas ni pagos operativos. No intentar traspasar si existe ejecución previa.
4. En un prospecto limpio, crear versión, guardar equipos y HH; si es IA, aceptar propuesta (debe seguir \`draft\` y no crear módulos). Marcar enviada, comprobar que la edición devuelve conflicto.
5. Registrar aprobación de una versión enviada (y, por separado, de una no enviada con confirmación). Comprobar \`quotation_versions.status='approved'\` y \`projects.sales_stage='approved'\`. No debe cambiar \`projects.sold_hours\` hasta el traspaso.
6. Probar **Aprobar y traspasar después**: el listado y ficha deben mostrar «Traspaso pendiente», y no debe poder activar el proyecto con cotización sin transferir.
7. Traspasar la versión aprobada en DEV/QA sin registros históricos: deben aparecer equipos, HH y fases reales, plan comercial, evento de auditoría y estado «Traspasada». No inventar fechas de tareas, no duplicar con segunda solicitud.
8. Probar facturación del primer hito sin traspasar una cotización aprobada: debe impedir iniciar automáticamente el proyecto. Verificar que las reglas para proyectos heredados sin cotización no cambiaron.
9. Comprobar rollback/no duplicación bajo solicitudes concurrentes en PostgreSQL; pendiente de test de integración automatizado.

Consulta de auditoría rápida:

~~~sql
SELECT
  p.name, p.sales_stage, p.status,
  qv.version_number, qv.status AS version_status, qv.ai_review_status,
  qv.total_hours, qv.total_amount,
  EXISTS (
    SELECT 1 FROM quotation_events e
    WHERE e.version_id = qv.id AND e.action = 'quotation_transferred'
  ) AS transferred
FROM projects p
LEFT JOIN project_quotations pq ON pq.project_id = p.id
LEFT JOIN quotation_versions qv ON qv.quotation_id = pq.id
WHERE p.type = 'development' AND p.deleted_at IS NULL
ORDER BY p.name, qv.version_number;
~~~

## Límites que siguen abiertos

- D05: recotización con ejecución, reemplazo de fases/horas asignadas existentes, hitos ya facturados y conciliación histórica. El traspaso los rechaza por seguridad.
- La opción de **aprobación + traspaso ahora** usa dos llamadas, no una transacción única compuesta. Si la segunda falla se conserva aprobación y se expone estado pendiente.
- La generación IA de una *nueva versión a partir de una anterior* todavía no realiza una lectura profunda de la versión base para preguntar exclusivamente diferencias ni conserva automáticamente todos los elementos comerciales anteriores; la opción **Copiar** sí preserva los datos comerciales, pero pierde la evidencia IA de forma deliberada.
- La EDT manual se traspasa como fases/módulos preliminares. Las tareas operativas fechadas requieren planificación posterior. La EDT referencial IA mantiene WBS en JSONB del snapshot de origen.
- La vista general muestra «Sin cotización» cuando no hay registros en el módulo nuevo, incluso en proyectos heredados Aprobados (no significa que antes no existiera una propuesta comercial fuera de la calculadora).
- Sin conexión real de Drive y sin validación local contra PostgreSQL: **no desplegar ni usar este corte para aprobar clientes reales** hasta ejecutar QA.
