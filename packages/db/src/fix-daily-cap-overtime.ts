import { createDatabaseConnection } from './client';

/** Jornada diaria — misma que `DAILY_CAP_HOURS` en `apps/api/.../hours/domain/services/daily-cap.ts`. */
const DAILY_CAP_HOURS = 8;

interface DayRow {
  user_id: string;
  date: string;
  regular: string;
}

interface EntryRow {
  id: string;
  hours: string;
  legacy: boolean;
  request_id: string | null;
  full_name: string;
}

/**
 * Corrige los días en que un colaborador tiene más de 8h normales (no extra,
 * no rechazadas) — registradas antes de que Horas dejara solo como extra lo
 * que pasa de la jornada (ver `splitByDailyCap`). Así Capacity (solo horas
 * normales) y "Horas Extras" calzan también hacia atrás.
 *
 * Por día, recorre los registros normales en el orden en que se cargaron (los
 * de la v1 primero: el ETL los vuelve a escribir, así que no se tocan) y lo
 * que pasa de 8h queda como extra: el registro entero si la jornada ya estaba
 * completa, o se divide en la parte que cabe y un registro extra nuevo con el
 * resto (mismo estado y decisión — las horas ya estaban aprobadas o en
 * revisión). Si el registro viene de una solicitud de HH de ticket, la
 * solicitud también se marca como extra; uno de ticket que habría que dividir
 * se informa para revisarlo a mano.
 *
 * Sin `--apply` solo muestra lo que haría. Corre una sola vez, manualmente,
 * después de desplegar ese cambio.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');
  const apply = process.argv.includes('--apply');

  const { sql, close } = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    await sql.begin(async (tx) => {
      const days = await tx<DayRow[]>`
        select user_id, to_char(date, 'YYYY-MM-DD') as date, sum(hours) as regular
        from hour_entries
        where not is_overtime and status <> 'rejected'
        group by user_id, date
        having sum(hours) > ${DAILY_CAP_HOURS}
        order by date, user_id`;

      let converted = 0;
      let split = 0;
      let legacySkipped = 0;
      const skipped: string[] = [];

      for (const day of days) {
        const entries = await tx<EntryRow[]>`
          select h.id, h.hours, h.legacy_id is not null as legacy, r.id as request_id,
                 trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as full_name
          from hour_entries h
          join users u on u.id = h.user_id
          left join ticket_hh_requests r on r.hour_entry_id = h.id
          where h.user_id = ${day.user_id} and h.date = ${day.date}
            and not h.is_overtime and h.status <> 'rejected'
          order by (h.legacy_id is null), coalesce(r.created_at, h.created_at), h.id`;

        let running = 0;
        for (const entry of entries) {
          const hours = Number(entry.hours);
          const room = Math.max(0, DAILY_CAP_HOURS - running);
          running += hours;
          if (hours <= room) continue;
          const overtime = Math.round((hours - room) * 100) / 100;
          const label = `${day.date} ${entry.full_name}: registro ${entry.id} (${hours}h)`;

          if (entry.legacy) {
            legacySkipped += 1;
          } else if (room === 0) {
            console.log(`${label} → ${hours}h pasan a horas extra.`);
            converted += 1;
            if (!apply) continue;
            await tx`update hour_entries set is_overtime = true, updated_at = now() where id = ${entry.id}`;
            if (entry.request_id) {
              await tx`update ticket_hh_requests set is_overtime = true, updated_at = now() where id = ${entry.request_id}`;
            }
          } else if (entry.request_id) {
            skipped.push(`${label} — de una solicitud de HH de ticket, habría que dividir ${room}h normales + ${overtime}h extra.`);
          } else {
            console.log(`${label} → ${room}h normales + ${overtime}h extra (registro nuevo).`);
            split += 1;
            if (!apply) continue;
            await tx`update hour_entries set hours = ${room}, updated_at = now() where id = ${entry.id}`;
            await tx`
              insert into hour_entries (
                user_id, project_id, module_id, segment_id, assignment, category, description, hours, date, is_overtime,
                project_stage_at_entry, status, rejection_reason, decision_user_id, decision_at, designated_approver_user_id,
                has_blocker, blocker_description, created_at, updated_at
              )
              select user_id, project_id, module_id, segment_id, assignment, category, description, ${overtime}, date, true,
                project_stage_at_entry, status, rejection_reason, decision_user_id, decision_at, designated_approver_user_id,
                false, null, created_at, now()
              from hour_entries where id = ${entry.id}`;
          }
        }
      }

      console.log(
        `\n${days.length} días sobre ${DAILY_CAP_HOURS}h normales: ${converted} registro(s) pasan enteros a extra, ${split} se divide(n). ` +
          `${legacySkipped} registro(s) de la v1 sin tocar (el ETL los sobrescribiría).`,
      );
      if (skipped.length > 0) console.log(`Sin tocar (revisar a mano):\n  ${skipped.join('\n  ')}`);
      if (!apply) console.log('\nSolo vista previa — corre con --apply para guardar los cambios.');
    });
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la corrección de horas extra sobre la jornada diaria:', error);
  process.exit(1);
});
