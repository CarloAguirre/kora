# Kora 2.0 — Portal externo de cliente (corte de implementación, 10-11-2026)

**Rama exclusiva:** `feature/calculadora-roadmap-diseno-v5-02`.  
**Comparación final:** contra el HEAD del PR correspondiente; no fusionado a `master`.  
**Referencia funcional:** `Perfil-cliente.html` proporcionado por producto.  
**Regla principal:** conservar SIN CAMBIOS las rutas y pantallas `/clientes/:clientId/vista-cliente*` usadas por PMO/administración. La nueva funcionalidad es exclusiva de las rutas `/portal/*` y el rol `cliente`.

## Arquitectura implementada

### BD
- `0063_portal_cliente_externo.sql` (Drizzle) agrega `client_portal_accounts` (vínculo usuario-contacto-empresa/habilitación), `client_portal_project_grants`, `client_portal_support_grants`, `client_portal_delivery_receipts`.
- Las autorizaciones son **explícitas por proyecto y contrato**, no implícitas por pertenecer a una empresa.
- Una entrega posee como máximo una recepción de cliente; se conserva usuario y timestamp de recepción independientes de `project_module_deliveries.status = approved`.
- Migración pendiente de aplicar a ambientes reales; **no ejecutar en producción sin respaldo y checklist de integración**.

### API
- `ClientPortalModule`, `ClientPortalService`, `ClientPortalController`, `ClientPortalAccessController`.
- `GET /api/portal/me`: identidad de la empresa y contacto autenticado.
- `GET /api/portal/projects`, `GET /api/portal/projects/:project`: proyectos autorizados y detalle proyectado sin repositorios internos en frontend.
- `POST /api/portal/projects/:project/deliveries/:deliveryId/receive`: recepción idempotente a nivel BD (segunda confirmación devuelve conflicto); exige permiso y que la entrega pertenezca al proyecto autorizado y esté aprobada internamente.
- `GET /api/portal/support`, `GET /api/portal/support/:contract`: solo contratos concedidos; tickets acotados al proyecto soporte del contrato.
- `GET /api/clients/:clientId/portal-access` y `PATCH .../contacts/:contactId`: gestión exclusivamente interna con permisos administrativos.
- El backend valida **rol cliente**, cuenta/contacto/empresa activos, coincidencia de correos y concesión del recurso específico; no confía en identificadores de cliente proporcionados por el navegador.
- Autenticación contraseña y Google: se autoriza un correo externo solo para el usuario de rol `cliente` con concesión activa. La revocación impide la consulta del portal incluso con un token anterior.

### Frontend
- API y hooks React Query exclusivos en `modules/client-portal/api/client-portal.api.ts`.
- **Nuevas** páginas `ExternalClientPortalPage`, `ExternalClientProjectDetailPage` y `ExternalClientSupportDetailPage`, disponibles únicamente bajo `/portal/*`.
- Se reutilizan `DashboardLayout`, `ClientCompanyHeader`, `PortalTable`, `StatusPill`, `StatPill`, `Card`, `Button`, `Modal`, `PhaseRoadmap`, `ProjectProgressOverview`, `ProjectBillingCard`, `ProjectBitacora`.
- Detalle: fases, tramos, tareas, entregas y recepciones del cliente; modal para dar OK con confirmación y bitácora de recepciones.
- Soporte: listado, contrato, filtros por proyecto y estado, detalle de ticket con descripción y solución visible.
- `ClientPortalAccessManager` dentro de la ficha de cliente interna (`/clientes/:id`), visible solo para autorizados; **no modifica** `ClientPortalPreviewPage` ni sus rutas ni sus consultas.

## Fronteras importantes

- Confirmar **recepción** no equivale a aprobar técnicamente un entregable ni a modificar el contrato, cronograma de facturación o estado de bloque.
- La lectura externa se proyecta mediante listas permitidas (no exponer `ProjectDetail` ni `TicketDetail` completos).
- El prototipo original puede tener estados demostrativos; la API nueva consulta PostgreSQL real.
- El UI Kit de Kora es la referencia de apariencia, no el CSS del HTML de diseño.

## Pendiente de cerrar en una iteración adicional
1. Confirmar reglas de privacidad antes de mostrar en bitácora eventos internos o **historial completo de tickets**; actualmente se publica la bitácora segura de recepciones, y en soporte la descripción/solución, no todo el historial interno.
2. Precisar si los contactos externos pueden ver todas las cifras comerciales: los contratos se otorgan explícitamente, pero aún no existen permisos financieros de granularidad distinta.
3. Verificar la política de evidencia documental: antes de Dar OK, ofrecer enlaces a entregables cuando estén persistidos y expresamente autorizados.
4. QA en una BD real de prueba con dos empresas y varios contactos, incluyendo revocación con sesión activa y dos OK simultáneos.
5. Validación visual real contra el HTML en navegador con rol `cliente` (sin comprometer la vista previa PMO).
6. Verificar recuperación de usuario, invitación y primer acceso en ambiente QA, más correo saliente y OAuth de dominio externo.

## Check de integración local (PowerShell)
```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git status -sb
git fetch kora
git merge --no-edit kora/feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/client-portal/client-portal.controller.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/client-portal/api/client-portal.api.test.ts
git status -sb
```

**Regla de DB:** migraciones solo en PostgreSQL QA/local con respaldo previo, nunca sobre producción por arrastre de una rama en integración. El proyecto incorpora otras migraciones y es necesario reconciliar historial con master antes del merge.

## QA mínimo manual
1. Admin configura en ficha cliente el contacto A y solo proyecto P1.
2. Contacto A inicia sesión, ve P1, no P2 ni cliente B (tampoco mediante URL directa).
3. Contacto B de otra empresa no puede abrir URLs del cliente A.
4. El líder interno marca una entrega como aprobada; el cliente A puede «Dar OK» y obtiene constancia con autor/fecha; un segundo OK no duplica.
5. Admin revoca acceso del contacto A: con su sesión abierta, /portal/me, /portal/projects y detalle deben denegar acceso.
6. Admin/PMO revisa `/clientes/:id/vista-cliente` y páginas de detalle: **mismas pantallas y comportamiento anterior**, sin acciones de recepción externas.
