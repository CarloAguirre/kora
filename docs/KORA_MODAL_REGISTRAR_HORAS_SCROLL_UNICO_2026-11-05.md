# Kora · Registro de horas: un solo scroll en el modal (2026-11-05)

## Reproducción
En el modal centrado «Registrar horas», al expandir el formulario aparecían
dos barras verticales adyacentes: una del `<dialog>` y otra del
`Modal.body` (que ya tiene `max-height: min(60vh, 560px)` y `overflow-y:auto`).

## Diagnóstico
El contenedor `<dialog>` nativo puede limitarse automáticamente a la altura
de la ventana y crear su propio scroll. El cuerpo interno ya se desplaza;
el formulario diario y semanal no tenían un overflow vertical adicional.

## Solución acotada
- Propiedad opcional `bodyScrollOnly?: boolean` en `Modal`, **false por defecto**.
- El modificador `dialog.bodyScrollOnly[open]` usa flex vertical con altura
  máxima según la ventana y `overflow:hidden` en el diálogo.
- El cuerpo se convierte en el **único contenedor con scroll**: `min-height:0`,
  `flex:1`, `max-height:none`, `overflow-y:auto`.
- Header y footer no se contraen; los bordes/redondeos se mantienen.
- La opción se activa **únicamente** en la ruta de **alta** de
  `HourEntryFormDialog` (ambas pestañas). Los modales de **edición**, **detalle**,
  drawers de Líder/PMO y cualquier otro uso de `Modal` conservan su comportamiento.

## Pruebas
`HourEntryFormDialog.scroll.test.tsx` verifica activación en alta diaria y
semanal, valor por defecto en modal estándar y lateral, y reglas CSS del
modificador. No se envían registros ni se cambia información de la BD.

## Integración (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run src/modules/hours/components/HourEntryFormDialog.scroll.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Error prueba scroll modal" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }
```

## Validación visual pendiente
Probar «Registrar horas» en vista diaria y semanal, con varios registros y
ventana de menor altura. Debe verse **una barra vertical dentro del modal**.
Comprobar que cabecera y botón de cierre siguen accesibles; repetir el test
de regresión en «Editar registro» y en un modal lateral de Proyecto.

No hay migraciones, cambios de API ni lógica de registro o aprobación.
El CI/build en entorno local no fue ejecutado desde el conector.
