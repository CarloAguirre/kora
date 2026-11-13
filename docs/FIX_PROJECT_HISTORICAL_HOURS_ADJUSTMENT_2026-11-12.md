# Ajuste histórico de HH — Dashboard Alertas

## Motivo
Solicitud del cliente: reflejar **66 HH consumidas** frente a las **34 HH aprobadas** existentes,
sin insertar tareas, fases, bitácoras o registros ficticios. Proyecto: `dashboard-alertas`,
UUID `308f4c81-bdd0-483b-a5ff-341ec787a08d`, HH vendidas: 110.

## Implementación
- Migración `0070_project_historical_hours_adjustment`: columna `projects.historical_hours_adjustment` con default 0.
- `Project.recordUsedHours(approvedEntryHours)` persiste **aprobadas + ajuste**, para todos los flujos
  que recalculan (`create`, `approve`, `update`, `delete` y solicitudes de tickets).
- Mapeo Drizzle y objeto de dominio mantienen la columna sin reescribirla.
- La bitácora y las agrupaciones por equipo conservan las HH reales, sin sumar un registro ficticio.
- Script de aplicación puntual `packages/db/manual/2026-11-12_dashboard_alertas_34_to_66.sql`
  valida slug, UUID, HH vendidas, aprobadas y ajuste cero; actualiza proyecto y crea `audit_log` en
  una misma transacción. Un segundo intento no puede incrementar el saldo.
- No cambia progreso funcional, cronológico ni planificación.

## Orden obligatorio
1. Respaldar la base y evitar escrituras concurrentes durante el ajuste.
2. Integrar y compilar código; aplicar migración 0070.
3. Reiniciar backend **con el código actualizado** (evitar cualquier backend antiguo que sobrescriba `used_hours`).
4. Ejecutar el script puntual SQL de forma única en la BD correcta.
5. Verificar `used_hours=66`, `historical_hours_adjustment=32`, `SUM(approved)=34`.
6. Aprobar posteriormente una HH de prueba real en un entorno QA y confirmar `used_hours=67` si se aprueba +1 HH.

## Consideraciones
- No repetir el script sobre otras bases sin revisar sus totales.
- El valor histórico se muestra en el total de HH consumidas y en métricas basadas en `projects.used_hours`.
- La bitácora seguirá sumando 34 HH porque el ajuste no corresponde a entradas individuales.
- Cualquier ajuste adicional requiere nuevo cambio trazable y actualización del total acumulado.
- Para revertir por causa justificada: generar una operación transaccional controlada con auditoría,
  **no** eliminar registros HH ni usar simplemente `UPDATE used_hours=34`.
