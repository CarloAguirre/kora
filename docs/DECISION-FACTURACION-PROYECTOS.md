# Decisión: Facturación de Proyectos, Hito 0 y el rol Finanzas

## Contexto

`project_payment_milestones` (el cronograma de tramos de pago de un proyecto
de desarrollo) existía desde antes solo como lectura: lo consumía el portal
de cliente para mostrar "Facturación" al cliente, pero no había forma de
crear tramos, ni de marcarlos facturados/pagados. Los 9 prototipos HTML de
referencia (`kora-facturacion-soporte.html` y otros) mostraban además un
décimo perfil, `kora-perfil-finanzas.html`: un rol nuevo, "Finanzas", con una
sola pantalla que junta Soporte y Proyectos, y una regla de negocio nueva:
**Hito 0**.

## Modelo de tramos: manual, no 2×50%

El prototipo de la pestaña "Proyectos" de `kora-facturacion-soporte.html`
sugiere un esquema rígido de 2 tramos (Inicio / Marcha blanca). Los ejemplos
de `kora-perfil-finanzas.html` lo contradicen: Kabeli Selección tiene 3
tramos, CTP tiene 1 (pago único), GoldFields tiene un tramo "Desvío de horas
(extra)" que no es ni Inicio ni Marcha blanca. Se optó por **configuración
manual por proyecto** (nombre + monto + orden, cantidad libre) en vez de un
esquema fijo — `project_payment_milestones` ya soportaba esto sin cambios de
forma; solo se hizo `percent` nullable (un tramo "extra" no es un % de nada).

**Actualización:** todo proyecto de desarrollo nace igual con un cronograma
mínimo **Inicio 50% + Marcha blanca 50%** (monto 0, a completar a mano) —
lo crea `CreateProjectUseCase`, y la migración `0035` se lo agregó a los
proyectos existentes que no tenían ningún tramo. Sigue siendo editable/libre:
se pueden renombrar, quitar o agregar tramos.

**Edición completa:** editar un tramo (`PATCH .../payment-milestones/:id`) ya
no se limita a los `pending` — es una corrección manual que permite cambiar
cualquier campo, incluido el estado, folio y fechas (p.ej. devolver a
"Pendiente" un tramo facturado por error). No dispara Hito 0; eso sigue
siendo exclusivo de "Subir factura". Se edita desde la pestaña Extras del
proyecto y desde la tabla de `/facturacion`.

## Hito 0: reutiliza campos existentes, sin columnas nuevas de estado

"Aprobado" = `projects.salesStage === 'approved'` (ya existía).
"Contratado - Activo" = `projects.status === 'active'` (ya existía,
transición desde `'draft'`). No se crearon campos de estado nuevos para
representar estos dos conceptos — ya vivían en el proyecto.

Al marcar como pagado el tramo de menor `sortOrder` de un proyecto que sigue
`approved`/`draft`, `MarkProjectPaymentMilestonePaidUseCase` decide:
- Si `project_billing_settings.auto_activate_first_payment` es `true` y el
  comando no trae `pauseForManagementApproval` → activa el proyecto
  (`status: 'active'`) en la misma transacción que el pago.
- Si no → `projects.pending_management_approval = true`, y un admin/pmo lo
  resuelve a mano vía `PATCH /projects/:id/resolve-management-approval`.

No existe ningún mecanismo de eventos de dominio consumido en el código (los
`domain events` de `Project` solo se usan en tests unitarios) — por eso Hito
0 es lógica inline dentro del caso de uso que marca el pago, no un
listener separado.

## El interruptor global: una tabla nueva, angosta a propósito

No existía ningún mecanismo de configuración/feature-flag en el codebase
(sin `system_settings`, sin `feature_flag`, ningún módulo "settings"). En vez
de construir un motor de configuración genérico para un único toggle, se creó
`project_billing_settings`: una tabla de una sola fila (`id: 'singleton'`)
con `auto_activate_first_payment: boolean`. La administra Gerencia
(`admin`/`pmo`, permiso `projects:manage`) vía
`GET/PATCH /projects/billing-settings`; Finanzas (`billing:read`) solo la ve,
informativa.

## El rol Finanzas: no reemplaza nada existente

`finanzas` es un rol nuevo con solo `['billing:read', 'billing:manage']` —
sin `projects:*`, `clients:*`, `tickets:*` ni `hours:*`. Su pantalla
(`/facturacion`, `BillingLedgerPage`) es una vista NUEVA que junta Soporte y
Proyectos en una tabla plana — no reemplaza `/facturacion-soporte` ni
`/soporte/:planId`, que admin/pmo siguen usando sin cambios.

## Fuera de alcance

- El adjunto de una factura/comprobante de un tramo de proyecto sigue siendo
  solo el nombre del archivo — no hay almacenamiento de archivos en ningún
  lugar de Kora todavía (mismo criterio que `support_invoices`).
- El libro combinado no recalcula un historial multi-período completo de
  Soporte: reutiliza el período vigente (mismo cálculo que
  `GetSupportBillingOverviewUseCase`) más el historial real de
  `support_invoices` — no se construyó un calculador de períodos pasados
  nuevo.
