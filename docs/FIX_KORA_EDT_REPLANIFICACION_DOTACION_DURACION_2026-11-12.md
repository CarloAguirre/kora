# Kora — sincronización dotación, duración y roadmap EDT (2026-11-12)

## Diagnóstico
- El campo `teams[].duration` podía editarse directamente sin modificar el
  calendario de `edtStageSettings`; esto falseaba dedicación real y generaba
  alertas de "duración inferior a semanas con tareas".
- `replanQuotationEdtForWorkforce` redondeaba cada tramo a un mínimo de una
  semana, bloqueando la reducción de plazos aun aumentando colaboradores.
- Las fases EDT son la fuente de calendario; las HH WBS×perfil no se reescriben.

## Corrección
1. Replanificador: candidato sub-semanal seguido por comprobación de carga
   semanal por equipo; acepta solo una planificación más corta, factible
   y compatible con el límite de capacidad (40 HH por persona por defecto).
   Mantiene una alternativa conservadora si no puede compactar.
2. Duración del equipo EDT: se deriva siempre de semanas efectivas del roadmap
   (primera a última semana de sus tareas), nunca de un input inconexo.
3. Editar colaboradores recalcula ventanas de fases + duración por equipo +
   horizonte general + supervisión TL (5 HH por semana efectiva).
4. Editar duración representa un **plazo objetivo máximo**, replanifica desde
   referencias estables y solo se acepta si el calendario es viable; si no,
   se muestra el mínimo calculado y NO se modifican los datos.
5. Las versiones ya existentes se representan con los rangos realmente
   calendarizados. Modificar una versión editable requiere guardar ajustes.

## Casos de prueba
- 320 HH con dos vs cuatro devs => cuatro vs dos semanas.
- Tramos consecutivos 20 HH + 20 HH => una semana (una persona).
- Intentar cambiar duración de cuatro a tres semanas sin dotación suficiente
  genera error, no un 83% ficticio.
- 3 -> 4 -> 3 personas revierte al calendario de origen.
- El snapshot original de IA y las HH no TL permanecen intactas.

No requiere migraciones. No garantiza acortar cuando existen limitaciones reales
de dependencias, fases comerciales o límites de capacidad.
