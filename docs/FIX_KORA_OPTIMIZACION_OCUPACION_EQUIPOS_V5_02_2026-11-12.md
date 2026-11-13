# Kora v5.02 — mejora de ocupación de equipos

Objetivo: acercar la ocupación semanal real a 90–100% cuando las
actividades y dependencias lo permitan; no inventar HH ni colaboradores.

## Cambios técnicos
- `inferLeanStaffingForEdt`: la dotación preliminar del modelo IA
  se reemplaza por el mínimo pico semanal requerido para la EDT original.
  No altera las ediciones humanas de dotación.
- `replanEdtStagesToFullTime`: considera fracciones de semana para
  comprimir tramos cortos, y adopta el resultado solo cuando no excede
  40 HH/semana/persona bajo el mismo reparto uniforme usado en Kora.
  Si no es seguro, vuelve al calendario conservador.
- Prompt EDT: recomienda tramos compactos y 90–100% de utilización
  orientativa; admite QA iterativo, esperas reales, TL transversal y
  semanas residuales.
- Tests para dotación IA sobredimensionada, QA 150 HH, secuencias de
  20+20 HH y control de sobrecarga.

## Límites
Los WBS no codifican precedencias individuales: únicamente ventanas de
etapa. No se puede garantizar 90% en todos los roles sin falsear el plan.
El TL debe mantenerse en 5 HH/semana. Las cotizaciones ya cerradas
conservan sus snapshots históricos; la nueva política se aplica al
generar nuevas EDT reales.
Sin migraciones ni cambios en las HH de las tareas.
