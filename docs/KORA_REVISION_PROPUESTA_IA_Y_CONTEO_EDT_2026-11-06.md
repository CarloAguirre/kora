# Kora · Revisión de propuesta Gemini y contador EDT

Fecha: 2026-11-06. Rama `feature/calculadora-roadmap-diseno-v5-02`.

## Flujo de la propuesta IA
1. Versión `origin: ai`, `aiReviewStatus: pending`: mostrar bloque violeta con información real de documentos y respuestas y las acciones **Ajustar antes de aceptar** y **Usar tal cual**.
2. Ajustar: activa visualmente la revisión; no cambia las HH ni la EDT hasta que el usuario edita. Presenta botones superiores de descartar/guardar y footer Kora. Si aún no hay cambios, el guardado se deshabilita.
3. Guardar: reutiliza `useSaveQuotationDraft` y la revisión del servidor; al completar vuelve a la pantalla de aceptación. Descartar restaura el snapshot persistido y sale del modo de ajuste.
4. Usar tal cual: llama una sola vez a `acceptAi` real. El backend valida mapeo WBS×perfil, HH y revisión transaccional. Si falta una correspondencia de equipos o hay cambios sin guardar se informa con snackbar; no se aprueba al cliente ni se traspasa el proyecto.
5. Tras aceptación: mensaje compacto de propuesta aceptada. El nombre del actor se muestra inmediatamente cuando la acción la realizó la sesión actual; no se inventa su identidad al abrir otra sesión.

La autoasignación de equipos de propuestas IA nuevas no ensucia el borrador antes de que el usuario pulse Ajustar. Se mantiene la compatibilidad de borradores antiguos revisados.

## Contador de tareas
Las actividades WBS pueden involucrar varios perfiles. El contador anterior calculaba `new Set(tasks.map(task => task.wbs)).size` y lo etiquetaba como **tareas**, mientras el desplegable dibuja todas las filas WBS×perfil.

Ahora el contador **tareas** coincide con las filas realmente desplegadas; si difiere de los WBS únicos, se indica además el número de **actividades**. Las HH son la suma de las mismas filas. Ejemplo: `2 tareas · 1 actividad · 15 HH`; no se altera el presupuesto ni el número real de actividades.

## Comandos PowerShell
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw 'Error typecheck Web' }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/QuotationAiReviewBanner.test.tsx `
  src/modules/estimation/components/QuotationDraftSaveBar.test.tsx `
  src/modules/estimation/components/QuotationPhaseWorkspace.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.ai-review.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Error pruebas Web' }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw 'Error build Web' }
```

Sin cambios de base de datos ni backend y sin modificar master. Las pruebas deben ejecutarse localmente: este conector sólo ha escrito el código en GitHub.
