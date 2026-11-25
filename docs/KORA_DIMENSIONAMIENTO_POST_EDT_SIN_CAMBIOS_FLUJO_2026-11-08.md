# Kora 2.0 — Dimensionamiento determinístico posterior a la EDT

**Fecha:** 2026-11-08  
**Rama:** `feature/calculadora-roadmap-diseno-v5-02` — PR #7 (draft)  
**Alcance:** corrección de motor y conciliación; **sin cambios en wizard, pantallas ni flujo de usuario**.

## Causa corregida

Antes, Gemini proponía cantidad de personas y duración antes de conocer las HH por actividad. Kora mantenía esa dotación tentativa al conciliar la EDT. Los equipos podían terminar sobredimensionados, y cuando varios perfiles pertenecían al mismo equipo sus personas se sumaban, aunque ejecutaran tareas en semanas distintas. Por otra parte, `validateStageCapacity` podía rechazar una EDT válida si el **headcount preliminar** de Gemini era insuficiente.

## Nuevo contrato operacional

1. La primera llamada Gemini conserva las preguntas, análisis, perfiles y equipos Kora reales. Las dotaciones propuestas son **preliminares**, no cifras que el modelo deba llenar con HH.
2. En la segunda llamada, `allowedRoles` contiene **solo nombre de perfil y teamId**, sin personas, duración u horas previas. La EDT se estima *bottom-up* a partir de documentos y respuestas; no hay nuevas llamadas a Gemini.
3. Después de comprobar WBS, FK, etapa, perfil y HH, `optimizeWorkforceForEdt` distribuye aritméticamente cada esfuerzo entre las semanas permitidas por su etapa, **conservando exactamente los centésimos**. Suma las demandas de etapas solapadas, calcula la carga pico semanal por perfil y obtiene la **mínima dotación simultánea viable** como `ceil(picoSemanal/40)`.
4. `validateStageCapacity` vuelve a verificar la EDT con esta dotación derivada, y no con una cifra especulativa del primer Gemini.
5. `reconcileProposalWithEdt` actualiza `people`, duración en semanas activas y HH medias por persona. `totalHours` y cada `roleEffort.hours` siguen siendo **los definidos en la EDT**, sin multiplicaciones por colaboradores.
6. En `projectPocRolesToQuotationDraft`, para EDT v2, los perfiles que comparten equipo Kora se agrupan por **carga simultánea real**: la dotación es `ceil(picoSemanalEquipo/40)`, en vez de sumar headcounts por rol. Se respetan `edtRoleCollaborators` manuales cuando existen, para no sobrescribir ajustes humanos al remapear.
7. El Líder Técnico conserva la **supervisión de 5 HH por semana** y un único perfil. Las HH de arquitectura hands-on son separadas; si una persona TL sobrepasa su capacidad física en una semana se rechaza, no se crea personal ni se inventan HH.

## Qué significa «100% de esfuerzo»

El motor **minimiza la cantidad de personas necesarias para las ventanas existentes**, tomando una jornada interna de 40 HH/semana como capacidad máxima por persona. No transforma una ocupación del 83,33% en 100% inventando tareas ni recorta las HH para cuadrar. Tampoco altera silenciosamente las fechas y dependencias de la EDT: si 100 HH deben ejecutarse dentro de **una semana**, se necesitan tres personas como dotación de pico (2,5 FTE-semanas), aunque no todos estén asignados la semana completa.

La dotación es **el máximo de personas simultáneas**, no la afirmación de que permanecen asignadas al proyecto todas las semanas. Una fase con carga intermitente no obliga a contratar un equipo a tiempo completo durante todo el horizonte.

**Limitación consciente:** un calendario por semanas enteras y sin dependencias WBS detalladas no permite garantizar exactamente el 100% de ocupación de cada persona sin introducir un modelo de asignación diaria o desplazar plazos. Este cambio optimiza **dotación bajo calendario dado**, y preserva la trazabilidad de la planificación existente.

### Ejemplos

- 100 HH de Desarrollo en semana 1 → pico de 3 personas; esfuerzo = 100 HH.
- 740 HH distribuidas en ocho semanas → pico de 3 personas; esfuerzo = 740 HH, equivalente a 18,5 semanas-persona.
- 40 HH de Desarrollo en semana 1 y 40 HH de QA en semana 2, ambos del mismo equipo Kora → **una persona pico** (si el equipo puede cubrir ambos perfiles), no dos por sumar roles.
- 40 HH de Desarrollo y 40 HH de QA en **la misma semana** → dos personas pico del equipo.
- TL-GOV de 5 HH/semana × 4 semanas → 20 HH, sin inflarse a 160 HH.

## Compatibilidad

- Sin alteraciones de rutas, pantallas, SSE, inputs o permisos.
- Sin cambios en contratos de API ni migraciones PostgreSQL.
- Sin modificación retroactiva de cotizaciones aprobadas o históricas.
- Los controles manuales existentes de dotación, duración y dedicación siguen disponibles; no se sustituyen valores explícitamente ingresados.
- Se conserva el indicador visual de ocupación/capacidad para que los límites del calendario sean verificables.

## Validación

Tests nuevos:
- `estimation-workforce-optimizer.spec.ts`: carga pico, fases solapadas, cálculo al centésimo, equipos compartidos, TL y entradas inválidas.
- `generate-estimation-poc-proposal.use-case.spec.ts`: post-EDT modifica personas sin alterar HH, no duplica llamadas al modelo, y no condiciona las HH a la dotación previa.
- `quotation-poc-projection.spec.ts`: equipos con roles consecutivos o simultáneos y mantenimiento de HH. Se corrigió además un fixture previo que pretendía probar sincronización EDT **sin incluir una EDT**.

```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
git rev-parse --short HEAD

pnpm --filter @kora/contracts typecheck
pnpm --filter @kora/contracts test
pnpm --filter @kora/api typecheck
pnpm --filter @kora/api test
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

**La verificación final debe basarse en la CI de la rama y/o los comandos del checkout local, no en suposiciones.**
