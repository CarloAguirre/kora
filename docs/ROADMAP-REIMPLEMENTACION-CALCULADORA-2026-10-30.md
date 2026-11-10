# Roadmap de reimplementación — Calculadora de Kora 2.0
**Fecha:** 2026-10-30 · **Rama:** `feature/calculadora/carlo`
**Fuentes:** `Especificación · Calculadora de estimaciones integrada a Kora.docx` (Leslie, 26/10/2026), `kora-proyectos-cotizaciones-v2.html` (prototipo), `HANDOFF_KORA_CALCULADORA_2026-10-30(1).md` y código de la rama (HEAD inicial `8b8a296`).

## Criterio de producto y alcance
La Calculadora se integra al dominio Proyectos. Una **cotización por proyecto, con múltiples versiones**; el contenido de versiones no modifica las HH vendidas, los equipos, las fases de ejecución, el roadmap ni la facturación **hasta un traspaso explícito de una versión aprobada**. El agente IA propone contenido y evidencia; cálculos y validaciones quedan en la aplicación. La ficha de cliente no presenta información comercial. Las semanas son relativas: las fechas reales se fijan al activar el proyecto.

No confundir `projects.type = development|support`, `projects.sales_stage = prospect|quoted|approved` y `projects.status = draft|active|on_hold|finished|cancelled`.

## Estado observado antes de iniciar
- Reutilizable: `@kora/contracts` con Zod, `EstimationModule`, `AiModule` y Gemini real, resolución/inventario y lectura limitada de Drive, vistas `/calculadora` y `/proyectos/:id/estimacion`.
- Incompleto: `/poc/analyze` no lee fuentes documentales, el workspace llama `/poc/proposal` con `answers: []`, el formulario de cuestionario no está conectado, la persistencia de cotizaciones/versiones aún no existe.
- El HTML es **simulación con localStorage y reglas de ejemplo**, no referencia de backend. Tiene contradicciones con la especificación; ver `DECISION-COTIZACIONES-VERSIONADAS.md`.
- Se mantiene el principio de arquitectura: contratos Zod, casos de uso/puertos, Drizzle en infraestructura, IA sin aritmética autoritativa.

## Entregas por cortes
| Corte | Objetivo | Condición de salida |
| --- | --- | --- |
| **R0** | Documentar contradicciones, responsabilidades de entidades, permisos y estados | Matriz y decisiones abiertas explícitas, sin imponer inferencias del HTML |
| **R1-a** | Contratos, dominio y persistencia inicial de cotizaciones/versiones **sin traspaso** | v1 manual, consulta, edición de borrador, copia v2 y control de revisión/concurrencia |
| **R1-b** | Endpoints y pruebas integrales de persistencia real, permisos y concurrencia | API protegida, transacciones y validaciones antes de integrar UI |
| **R2** | Listado Cotizaciones, sección en ficha interna, editor manual: equipos/fases, tarifa, impuestos, costos, plan de pago y comparador | Navegar, editar y recargar sin alterar el proyecto |
| **R3** | Envío, aprobación de una sola versión y traspaso diferido/inmediato | Mutación atómica, idempotente y auditable; bloqueo de activación si falta traspaso, sin afectar legados indebidamente |
| **R4** | Drive real con permisos de usuario, análisis documentado, preguntas F01–F05 y 0–5+2 dinámicas, aceptación IA y creación de versión | Fuentes, respuestas y proveedor trazables; Gemini solo propone, no fija tarifa |
| **R5** | QA/seguridad/regresiones y documentación final | CU-01 a CU-17 y transiciones, pagos, equipos, acceso y concurrencia cubiertos |
| **R6** | EDT granular, exportaciones/escenarios si producto confirma | No alterar tareas vivas automáticamente al revisar HH de cotización |

### Mapa de datos
`projects` es dueño del tipo comercial, estado operacional, HH vendidas, fechas reales, equipos asignados, módulos/tareas en ejecución y plan real de cobro.
`project_quotations` es dueño del vínculo único a proyecto; `quotation_versions` conserva número, autor, origen, estado, revisión IA, snapshot de contenido comercial, HH calculadas y referencias documentales. Aprobación/traspaso y snapshot comercial transferido se incorporan con reglas transaccionales en R3. No reutilizar el puerto de contexto PoC (`EstimationRepository`) como repositorio implícito de cotizaciones sin redefinir su contrato.

### Casos críticos
1. Crear/editar/copiar v1/v2; verificar `revision` optimista y estados inmutables.
2. Probar que editar un borrador no toca `projects.sold_hours`, `project_teams`, `project_modules`, tareas o facturación.
3. Restringir tarifas/costos a perfiles habilitados incluso por API.
4. Bloquear modificación de enviada/aprobada; nueva versión desde snapshot original.
5. Enviar: tarifa válida, plan 100%, IA aceptada. Aprobar sin envío: confirmación previa.
6. Traspaso: previa campo-a-campo, historial y protección si hay horas consumidas o hitos facturados.
7. Iniciar: para proyectos comerciales nuevos exigir aprobación+traspaso, sin romper proyectos existentes ni flujos automáticos de Hito 0.
8. Distinguir `drive_real`/fixture KDM y proveedor `gemini`/simulado.

## Estrategia de implementación
Trabajar **solo** en `feature/calculadora/carlo` mediante conector GitHub; no modificar master, abrir PR ni desplegar. Commits por corte verificable. Reportar SHA remoto y pruebas realmente ejecutadas. Remoto del equipo local del usuario: `kora`; integrar con `git fetch kora` y `git merge --ff-only kora/feature/calculadora/carlo` únicamente cuando el historial permita FF (no hacer reset destructivo).

## Decisiones pendientes y gates
Las seis decisiones D01–D06 y sus recomendaciones se registran en `docs/DECISION-COTIZACIONES-VERSIONADAS.md`. Resolver D01/D02 antes del editor comercial, D03 antes de OAuth productivo, D04/D05 antes de traspasar EDT/recotizaciones, D06 antes de aprobación de montos. R1 puede incorporar un agregado independiente y migrable, pero **no habilitar estados o transferencias no acordadas**.
