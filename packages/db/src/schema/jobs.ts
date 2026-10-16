import { date, jsonb, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Una fila por tarea programada y día (hora de Chile) en que se ejecutó.
 *
 * Es el candado que impide enviar dos veces el mismo recordatorio diario: la
 * tarea inserta su fila ANTES de enviar y, si ya existía (otro proceso, un
 * reinicio del contenedor en el minuto exacto, una ejecución manual), no hace
 * nada. Reemplaza a `hh_leader_notification_log` de la v1, que cumplía el
 * mismo papel por líder.
 */
export const scheduledJobRuns = pgTable(
  'scheduled_job_runs',
  {
    jobName: varchar('job_name', { length: 80 }).notNull(),
    runDate: date('run_date', { mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    /** Resumen de la ejecución (enviados, omitidos, fallidos) — sin direcciones de correo. */
    summary: jsonb('summary').$type<Record<string, unknown>>(),
  },
  (table) => [primaryKey({ columns: [table.jobName, table.runDate] })],
);
