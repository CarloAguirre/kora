# Kora — Estimación IA con EDT por actividad y perfil (v2)
Fecha: 2026-11-02

## Referencia y alcance
Se tomó como **referencia estructural**, NO como cotización numérica para otros clientes, el libro `EDT_Zurich_MJE_Portal(3).xlsx`:
- `EDT_Detalle`: filas WBS con tramo, módulo, submódulo, actividad, referencias, clasificación, responsable principal y HH por perfil.
- `Resumen_Modulos`: matriz módulo × perfil; HH derivadas de las actividades.
- `Tramos`: tramos cronológicos y participación paralela de equipos.
- `Carga_Equipo`: HH y capacidades por perfil.
- `Supuestos`: reserva técnica separada de las HH base, restricciones y exclusiones.
- Otros elementos del libro (`Plan_Diario`, `Roadmap_Semanal`, `Hitos`, etc.) **no se convierten automáticamente en fechas, pagos, recursos nominales ni ejecución real**.

El libro tiene 45 actividades WBS, 7 módulos, 6 tramos y 257 HH base repartidas en Fullstack 148, UX/UI 52, QA 33, Tech Lead 20, PMO 4. Reserva de 10% (25,7 HH) separada. Estos valores son de Zurich y NO se cargan en KDM.

## Flujo implementado
1. Primera generación Gemini: propone nombres de perfiles y una capacidad preliminar por rol.
2. Segunda generación Gemini: usa el PDF KDM de demo + respuestas y retorna filas `WBS × perfil` con **HH propuestas directamente por actividad**, tramo relativo, módulo, submódulo y referencias. Una actividad con dos roles usa dos filas del mismo WBS.
3. Servidor agrupa las filas por WBS; suma `roleEffort[]`, `task.hours`, módulos, tramos, y finalmente `edt.totalHours`. Valida nombres/códigos, perfiles permitidos, duplicados, HH positivas con dos decimales, y estructura de referencia.
4. La propuesta final `aiPoc.proposal` se reconcilia desde la EDT. El total preliminar de la primera generación **no se impone** como presupuesto a las tareas.
5. Al mapear roles a equipos reales Kora, las **fases comerciales se generan por tramo EDT**, no una fase por rol. Cada fase incluye HH por equipo sumadas desde las actividades del tramo. Diferentes roles pueden compartir equipo sin duplicar esfuerzo.
6. La UI muestra tramos y semanas relativas, HH base, reserva y total con reserva, módulos, HH por rol y equipo, y tareas desplegables con referencias y clasificación.
7. Los cambios quedan en una versión comercial borrador. Aceptación IA, envío, aprobación del cliente y traspaso siguen siendo acciones separadas, con reglas existentes.

## Contratos y compatibilidad
`quotationReferenceEdtSchema` acepta `kora.quotation.reference-edt.v1` (legado) y `v2` (detallado).
- Campos retenidos: `module.name`, `module.totalHours`, `task.wbs`, `task.role`, `task.hours`.
- Campos v2: `stageCode`, `submodule`, `referenceIds`, `classification`, `roleEffort[]`, `stages[]`, `reservePercent`, `reserveHours`, `totalWithReserve`.
- `task.role` refleja el perfil predominante para lectores legados; **la descomposición autoritativa por perfil es `task.roleEffort[]`** en v2.
- `totalHours` es la **base sin reserva**. La reserva nunca duplica las HH de cotización.
- No se añadieron tablas ni migraciones. Los borradores v1 siguen validándose.

## Restricciones que se conservan
- No asumir que la documentación Zurich es la fuente real de la PoC KDM.
- No modificar tarifas HH ni impuestos mediante Gemini.
- No asignar personas, fechas comprometidas ni acciones de proyecto operativo desde la generación.
- No sobrescribir evidencia IA ni saltar la revisión/aprobación comercial.
- La proyección EDT a equipos requiere asignar perfiles explícitamente a equipos Kora.

## Validación recomendada
```powershell
git fetch kora
git switch feature/calculadora-edt-detallada-zurich
pnpm exec turbo run build '--filter=@kora/web' '--filter=@kora/api' --force
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web test
pnpm --filter @kora/api test
pnpm --filter @kora/contracts test
```

**Prueba funcional real:** generar una nueva versión IA con el PDF KDM de demo; validar EDT v2, horas de actividades, módulos, tramos y reserva; mapear todos los perfiles, guardar y comprobar que las HH comerciales coinciden exactamente con la EDT base. Usar una **versión nueva**: las anteriores v1 no se reescriben.

**Límite conocido:** el esquema actual trabaja con tramos en semanas relativas; no produce automáticamente el cronograma diario ni la estimación de hitos/pagos del Excel de Zurich.
