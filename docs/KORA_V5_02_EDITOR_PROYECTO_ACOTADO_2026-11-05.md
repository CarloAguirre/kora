# Kora v5.02 — Edición de proyecto de desarrollo acotada

**Rama:** `feature/calculadora-roadmap-diseno-v5-02`

## Alcance visual

El lápiz del encabezado de una ficha de **proyecto de desarrollo** abre
`EditDevelopmentProjectDialog`, inspirado en la referencia de diseño:

1. Aviso contextual de cotización, usando `project.quotationStatus`, y enlace
   funcional a la pestaña **Cotizaciones**. No inventa un número de versión:
   la ficha no lo expone.
2. Nombre de proyecto y cliente.
3. Líder Kabeli y responsable comercial.
4. Tipo de proyecto, estado y etapa de avance; proyecto interno.
5. **Fechas y horas:** fechas de inicio/fin, HH estimadas/vendidas y autorización
   de horas extra cuando el actor tiene permiso.
6. **Plan de pago:** se mantiene `PaymentPlanEditor`, su validación y la
   protección de tramos ya facturados; no se envía si no se modificó.
7. Recuadro informativo que remite equipos, líderes, colaboradores y horas
   a **Equipos asignados**; fases, bloques y tareas a **Roadmap**.
8. **Documentación:** links de cotización y contrato.
9. Footer fijo **Cancelar / Guardar cambios**.

No se muestran los editores anteriores de **Equipos e involucrados**,
**Fases · Módulos**, creación/eliminación de tramos ni entregas, notas de
alcance, sumatoria redundante de HH de equipo o documentación final
duplicada. Esas relaciones **no forman parte del payload** del formulario,
evitando sobrescribir datos operativos al guardar información general.

## Flujos preservados

- Cambio de estado y activación manual con motivo obligatorio, presentado
  dentro de los datos generales cuando corresponde.
- Ajuste de HH vendidas tras Hito 0 con motivo obligatorio.
- Cambio de proyecto interno, plan de pago, autorización de horas extra,
  reasignación de líder y asignación comercial con las restricciones vigentes.
- Mutaciones API existentes; sin endpoints ni migraciones nuevas.

La ficha de **soporte** conserva `EditProjectDialog` porque su contrato,
bolsa, política mensual y SLA requieren controles específicos que no están
en la imagen de la ficha de desarrollo.

## Validación local

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/components/EditProjectDialog.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx
```

Pruebas añadidas: campos conservados, secciones retiradas, enlace a
Cotizaciones, edición sin cambios de relaciones, preservación de motivos
obligatorios y proyecto interno. **Ejecución local pendiente.**
