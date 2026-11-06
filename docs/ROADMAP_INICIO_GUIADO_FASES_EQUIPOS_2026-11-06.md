# Kora · Inicio guiado del Roadmap sin fases
Fecha: 2026-11-06  
Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Necesidad
Cuando un proyecto de desarrollo recién iniciado todavía no tiene fases operativas, el tab **Roadmap** debe mostrar el estado vacío y la secuencia de planificación del prototipo v6. El flujo: **Crear la primera fase → Nueva fase → (si falta asignación) Primero agrega equipos → Resumen / Equipos asignados**.

## Implementación
- `ProjectModulesCard.tsx`: se elimina el retorno anticipado que impedía abrir el modal cuando `project.modules.length === 0`. Se muestra un estado inicial con 0 fases, 0 bloques, 0 tareas, explicación del bloque y tres pasos. Solo con `canManage` se muestra «Crear la primera fase». «Planificar» se activa inicialmente para proyectos vacíos con permisos.
- Se reutiliza `useCreateProjectModule` / `createModule.mutateAsync` y el modal «Nueva fase» existente. No hay guardados simulados, migraciones ni nuevas rutas API.
- Si `teamOptions` contiene equipos, después de persistir la fase aparece `NewWorkBlockModal`, conservando la lógica anterior.
- Si faltan equipos, se abre `Modal` «Primero agrega equipos», que permite «Entendido» o «Ir a Equipos asignados». Un intento posterior de agregar bloque sin equipos abre el mismo aviso, en vez de limitarse a un toast.
- `DevelopmentProjectDetailView.tsx`: al elegir «Ir a Equipos asignados», se cambia al tab «Resumen», se ubica la sección `#project-assigned-teams` mediante `scrollIntoView` y se solicita abrir directamente el editor de equipos. También se ofrece el Roadmap para proyectos `status=active`, aunque la etapa comercial siga previa a `approved`.
- `ProjectTeamsManagementCard.tsx`: `startManaging` habilita la edición al entrar desde el Roadmap, sin modificar la gestión normal cuando el usuario navega manualmente.
- Se usan **`Modal`, `Button`, `TextField`, `Card`** y los tokens CSS de Kora (`--kora-navy`, superficies, bordes, tipografía). Los colores de las capturas eran referenciales.

## Alcance / invariantes
- Solo vista interna de proyectos de desarrollo. Sin cambios en el Roadmap del portal cliente o los proyectos de soporte.
- El tab Roadmap se habilita también en proyectos de desarrollo **Prospecto / No iniciado** (`salesStage=prospect`, `status=draft`). El gate anterior por etapa comercial evitaba mostrar el estado vacío y habría vuelto a ocultarlo después de crear la primera fase. Se añade el estado `draft` a los estados habilitados, conservando las otras restricciones; no se cambia el estado del proyecto ni sus horas. Los permisos de gestión siguen en `canManageProject` y en el backend.
- Conserva permisos de `canManageProject`; los usuarios de consulta no pueden crear fases ni equipos.
- No inventa equipos, HH, fechas, bloques ni tareas.
- La creación real de fase sigue requiriendo validación backend; un error conserva el formulario y muestra el toast existente.
- No se integra a `master`.

## Pruebas añadidas
- `ProjectModulesCard.phase-controls.test.tsx`: estado vacío, contador y 3 pasos; creación inicial con cero equipos, modal de equipos y callback; creación con equipos abre el bloque; solo lectura.
- `DevelopmentProjectDetailView.test.tsx`: recorrido real Roadmap → modal → Resumen → modo gestionar equipos; proyecto activo sin aprobación comercial y Prospecto / No iniciado, con y sin fases.

## Validación local (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló el typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx `
  src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Fallaron las pruebas Roadmap" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló el build Web" }
```

**Nota**: Los commits se hicieron vía conector GitHub. No se ha ejecutado Vite, Vitest ni TypeScript en la máquina local del usuario desde esta conversación; los resultados de esas validaciones deben comprobarse al ejecutar los comandos anteriores.
