# ADR / decisiones pendientes — Cotizaciones versionadas en Kora
**Estado:** propuesta técnica, no aprobación comercial. **Fecha:** 2026-10-30.

## Reglas explícitas de la especificación
- Una cotización ligada a cada proyecto; versiones numeradas, fuente manual/copia/IA; una sola versión aprobada.
- Estados: `borrador → enviada al cliente → aprobada`; se permite aprobación directa de borrador con confirmación. Enviada/aprobada: no editable.
- Aprobación permite traspasar ahora o después; aprobado-pendiente **no** modifica el plan de ejecución.
- Horas por equipo: colaboradores/cupos × semanas × hh/semana × dedicación; modo por fases: suma de horas por equipo en fases. Las fases son semanas relativas a inicio real. La Fase 1 es propia de Kora.
- Valor HH y moneda (UF, USD, CLP), impuesto (IVA19/IGV18/exento), únicos/recurrentes, pago en hitos (100%) y supuestos son comerciales. El agente IA nunca propone valor HH.
- La vista cliente no cambia. El resumen comercial posterior al traspaso solo lo ven usuarios autorizados.
- Fijas F01–F05, dinámicas por impacto hasta 5 iniciales y 2 de seguimiento, prefill de evidencia y opción «No lo sé / supuesto».

## Máquina de estados propuesta
`quotation` (1 por project_id) posee `versions[]`. `version` es `draft | sent | approved`; aceptación IA es estado **ortogonal** `pending | accepted`. Un borrador se edita, `sent`/ `approved` permanecen congelados. `approved` único por cotización; traspaso `pending|completed` vinculado a versión. Revisar cambio de `approved` antiguo a `sent` cuando se apruebe otra, sin perder auditoría de aprobaciones.
**En R1 NO implementar envío, aprobación ni traspaso; incorporar solo snapshots editables de borrador y copia.**

## D01 · Equipos: BLOQUEA EDITOR
Especificación lista cinco equipos (`Desarrollo`, `UX-UI`, `QA`, `RPA`, `IA`), HTML agrega PMO, PoC sugiere Tech Lead y Arquitectura. Consultar catálogo real `teams`; no crear equipos implícitos por cadena, resolver si PMO/Líder/Arquitectura son perfil imputable o costo sin HH.

## D02 · Permisos: BLOQUEA ENDPOINTS EXPUESTOS
Documento permite Líder PM, Gerencia, PMO, pero HTML limita al Líder PM a proyectos a cargo. Kora tiene `projects:manage` para admin/PMO y `projects:read_assigned` para líderes. **Política conservadora preliminar para R1**: admin/PMO con `projects:manage`, líder únicamente si `projects.leader_user_id` coincide; nadie más. Validar con producto si un Líder PM puede editar cotizaciones ajenas; la restricción es explícita en backend, nunca solo UI.

## D03 · Drive: BLOQUEA IA PRODUCTIVA
Documento exige carpeta visible para cuenta Google conectada del usuario. Hoy se usa Service Account, y `openid email profile` no autoriza acceso delegado. Definir OAuth delegado/alcances, consentimiento, refresh seguro y política de usuarios sin Google. Mantener Service Account solamente para pruebas autorizadas. Match de carpetas por nombre: sugerencia, confirmación explícita ante duda.

## D04 · EDT/tareas: BLOQUEA AUTOMATISMO DE TRASPASO
La EDT original es granular (RF/HU/actividad/rol); la nueva propuesta solo prescribe equipos y fases/módulos en semanas. El documento deja abierta la pregunta de qué hacer con tareas al editar HH. **No borrar ni prorratear tareas existentes** por modificar cotización. Si se requiere tareas reales, se hará un paso de conciliación EDT → tareas tras aceptación humana. No confundir peso de módulo con horas de todas sus tareas.

## D05 · Reaprobación después de transferir: BLOQUEA REEMPLAZO DE DATOS REALES
Documento permite aprobar otra versión, pero prototipo cierra la edición después de traspasar. Recalcular un proyecto activo con horas consumidas/facturas puede corromper su historial. Requerir flujo controlado de cambio de alcance con diferencias y protección de hitos ya facturados/pagados. Antes de acordarlo, ninguna cotización reemplaza ejecución existente automáticamente.

## D06 · Tarifas/impuestos y cálculo: BLOQUEA MONTOS COMERCIALES
Documento: HH única por proyecto; HTML: valor HH por versión. **Propuesta técnica reversible**: cada versión conserva snapshot tarifario; si se acuerda un valor base de proyecto, solo se copia al crear la versión y no cambia versiones enviadas. `Neto = HH × valorHH + costos únicos`; impuesto sobre neto; mensual/anual separados. Decidir redondeos, decimales UF y base imponible de costos externos; no imponer supuestos financieros mediante Gemini.

## Casos de conciliación con Kora
- `projects.type` identifica desarrollo/soporte, no prospecto/aprobado. La fase comercial es `sales_stage` y el estado operacional es `status`.
- `project_teams.member_count` es cupo máximo, no personas asignadas. `project_modules` y sus tareas ya afectan avance y Forecast.
- `project_payment_milestones` tiene estados `pending/to_invoice/invoiced/paid`. No reemplazar tramos facturados.
- `ChangeProjectStatusUseCase` y la activación automática por Hito 0 requieren revisión conjunta en R3 antes de bloquear `active`.
- Ninguna acción sobre borradores debe actualizar Proyectos o disparar correos, triggers de facturación ni Forecast.

## Aceptación pendiente
Acordar con Diseño/Levantamiento los seis puntos, documentar decisión definitiva y actualizar contrato/prototipo cuando diverjan. Hasta entonces, las recomendaciones son **propuestas**, no reglas aprobadas.

## Evidencia de PostgreSQL y regla operativa provisional (30-oct-2026)

El resultado de la consulta de estados (ver `VALIDACION-ESTADOS-COTIZACIONES-2026-10-30.md`) revela 37 proyectos `development` en `prospect|quoted` que también están `active`. La Calculadora **puede preparar un borrador comercial aislado** en esos proyectos, igual que si estuvieran `draft`; esto NO valida ni reemplaza un contrato o alcance operativo, y NO habilita transferencia sobre un proyecto activo. La etapa `approved` se mantiene de solo lectura para borradores nuevos en esta fase. La decisión D05 sigue abierta para el reemplazo de la versión transferida y la protección de HH/facturas históricas.
