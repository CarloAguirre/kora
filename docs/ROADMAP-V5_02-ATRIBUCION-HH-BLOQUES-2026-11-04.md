# Kora — HH consumidas por bloque de trabajo (iteración 0054)

## Objetivo

Resolver la ausencia de vínculo trazable entre `hour_entries` (registro
real de HH) y `project_module_segments` (bloques del Roadmap), sin inferir
horas de un bloque por nombre, por fecha o por pertenencia al equipo.

### Cambios realizados

1. `packages/db/migrations/0054_hour_entry_segment_attribution.sql`:
   columna `hour_entries.segment_id` (UUID FK nullable, `ON DELETE SET NULL`)
   e índice parcial por `segment_id,status`.
2. `@kora/contracts`, agregado `HourEntry`, puertos, mapper Drizzle y
   casos de uso de alta/edición: `segmentId` se persiste, se actualiza
   con el registro y se expone en los DTO de lectura.
3. Autoridad en el backend:
   - `segmentId` debe existir en la fase `moduleId` del proyecto.
   - El autor debe ser miembro activo del equipo del segmento o el líder
     efectivo de ese equipo en ese proyecto.
   - Si la fase tiene bloques, un alta de horas de tipo `Proyecto` exige
     el segmento explícito.
   - Si el autor participa de un equipo con bloques en el Roadmap y
     registra horas `Proyecto`, se exige indicar fase y bloque.
     Los registros generales de personal sin participación en esos equipos,
     los proyectos aún sin Roadmap y las horas de `Prospecto` conservan
     el flujo anterior, sin atribución especulativa.
   - Un registro anterior no asociado puede seguir consultándose. Al
     editarlo seleccionando un bloque se valida su identidad, sin borrarlo.
4. Formularios `Registro diario`, `Registro semanal` y
   `Editar registro`: selección de fase y bloque, filtrada por equipo
   activo/líder. Al cambiar de proyecto/fase se limpia el segmento.
   La validación del registro diario también deshabilita el envío
   si falta fase/bloque cuando el usuario participa en el Roadmap,
   sin impedir HH generales fuera de esos equipos.
   El modo lectura muestra el nombre del bloque cuando corresponde.
5. `DrizzleProjectModuleRepository`: suma `SUM(hour_entries.hours)`
   agrupado **exclusivamente** por FK `segment_id`, con `status=approved`.
   El DTO `ProjectDetail.modules[].segments[]` expone `consumedHours`.
6. `TeamProgressCard`: HH consumidas reales por bloque, agregadas
   por fase, sin cambiar el avance basado en tareas aprobadas/cierre.
7. Invalidación de queries de proyectos después de alta, edición,
   aprobación, rechazo o eliminación de HH.

### Preservación de histórico

La columna es `nullable` para no inventar atribuciones sobre miles de
horas anteriores. `docs/SQL_AUDITORIA_HH_BLOQUES_0054.sql` incluye
solo consultas para mostrar consumo identificado y pendientes de conciliación,
y candidatos por fase/equipo/fechas. **No se realiza backfill automático**:
incluso un solo candidato por fecha no demuestra en qué bloque se trabajó.
Si un usuario decide asociar registros existentes debe revisar sus tareas/
descripciones antes de aplicar un UPDATE autorizado. Los registros sin
segmento siguen apareciendo en las HH totales del proyecto/equipo.

### Reglas de suma

- `status=approved` se considera **HH consumidas**.
- `pending` y `rejected` no se suman en ese campo.
- `segment_id=NULL` no se atribuye a ningún bloque.
- Se conserva la relación con fase/proyecto/usuario; la nueva FK es adicional.
- La cancelación lógica de una tarea no elimina horas efectivamente
  registradas y aprobadas.
- El progreso real permanece calculado con HH *estimadas de tareas aprobadas*.
  El consumo real del bloque es independiente del porcentaje de avance.

### Validación en PowerShell

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build

# Usar URL de la BD correcta (en apps/api/.env).
$line = Get-Content .\apps\api\.env |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
  Select-Object -First 1
if (-not $line) { throw 'Falta DATABASE_URL en apps/api/.env' }
$env:DATABASE_URL = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
try {
  pnpm db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Fallo al aplicar migraciones' }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/hours/application/use-cases/create-hour-entry.use-case.spec.ts src/modules/hours/application/mappers/hour-entry.mapper.spec.ts src/modules/hours/domain/entities/hour-entry.entity.spec.ts src/test/architecture.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/hours/components/DailyEntryForm.segment-validation.test.ts src/modules/projects/lib/team-progress.test.ts src/modules/projects/components/TeamProgressCard.test.tsx src/modules/projects/components/QuotationReferenceTaskModal.test.tsx
pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

### Prueba manual de punta a punta

- Alta de `Proyecto` con fase que tiene varios bloques: la API exige
  elegir uno; registro ajeno se rechaza.
- Un colaborador registra 5 HH en el bloque A; si quedan `pending`,
  el consumo no cambia; al aprobarlas, A suma 5 y B suma 0.
- Registrar horas directamente en B y confirmar que no cambian las de A.
- Cambiar la asignación de un registro aún editable y verificar que las
  cifras se actualicen al refrescar el detalle.
- Auditoría SQL: `hour_entries.segment_id` y `project_id/module_id`
  coinciden con el bloque real; los históricos continúan sin atribución.
- Probar vista del líder y PM/PMO: ambos usan el mismo desglose.

**Estado:** los commits contienen la implementación, pero la integración
en BD local y la ejecución de las pruebas deben realizarse desde el
repositorio con sus dependencias y credenciales. No se han declarado PASS
sin esos resultados.
