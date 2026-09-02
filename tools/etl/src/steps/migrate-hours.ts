import { eq, holidays, hourEntries, projects, sql } from '@kora/db';
import type { HourEntryStatus } from '@kora/contracts';
import { StepTracker, type EtlContext } from '../lib/context';
import { loadLegacyEmailByAuthId, loadUserIdsByEmail, loadUserIdsByLegacyAuthId, resolveUserId } from '../lib/user-lookup';

/**
 * Migra `registro_hh` → `hour_entries` y `feriado` → `holidays`.
 *
 * Ver docs/DECISION-M4-HORAS.md: `categoria` y `asignacion` se preservan tal
 * cual (texto libre, sin normalizar duplicados de mayúscula/minúscula) porque
 * no son un catálogo cerrado. `id` en `registro_hh` ya era `uuid` en la v1, así
 * que se conserva directamente como `legacy_id` — no hace falta el mapa
 * entero-a-uuid que sí necesitan `proyecto`/`usuario`.
 */

interface LegacyHourEntry {
  id: string;
  user_id: string;
  id_proyecto: number | null;
  categoria: string;
  descripcion: string;
  horas: string;
  fecha: Date;
  estado: string;
  motivo_rechazo: string | null;
  etapa_proyecto_registro: string | null;
  asignacion: string | null;
  decision_lider_user_id: string | null;
  decision_lider_at: Date | null;
  horas_extra: boolean;
  designated_approver_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LegacyHoliday {
  pais_codigo: string;
  region_codigo: string;
  fecha: Date;
  nombre: string;
  tipo: string;
  es_laboral: boolean;
}

const STATUS_MAP: Readonly<Record<string, HourEntryStatus>> = {
  pendiente: 'pending',
  aprobado: 'approved',
  rechazado: 'rejected',
};

const HOLIDAY_TYPE_MAP: Readonly<Record<string, 'national' | 'regional' | 'company'>> = {
  nacional: 'national',
  regional: 'regional',
  empresa: 'company',
};

export async function migrateHourEntries(context: EtlContext): Promise<void> {
  await migrateHolidays(context);

  const tracker = new StepTracker('registros de horas');

  const rows = (await context.legacyReader.getRows<LegacyHourEntry>('registro_hh')).sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  tracker.read = rows.length;

  const userIdsByLegacyAuth = await loadUserIdsByLegacyAuthId(context);
  const userIdsByEmail = await loadUserIdsByEmail(context);
  const legacyEmailByAuthId = await loadLegacyEmailByAuthId(context);
  const projectIds = await loadProjectIdsByLegacyId(context);

  for (const row of rows) {
    const userMatch = resolveUserId(row.user_id, userIdsByLegacyAuth, legacyEmailByAuthId, userIdsByEmail);
    if (!userMatch.userId) {
      tracker.warn(`registro ${row.id}: el usuario ${row.user_id} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }
    if (userMatch.matchedBy === 'email') {
      tracker.warn(
        `registro ${row.id}: el usuario ${row.user_id} no coincidió por UUID (¿cuenta de Supabase recreada?), se resolvió por correo`,
      );
    }
    const userId = userMatch.userId;

    const projectId = row.id_proyecto ? (projectIds.get(row.id_proyecto) ?? null) : null;
    if (row.id_proyecto && !projectId) {
      tracker.warn(`registro ${row.id}: el proyecto ${row.id_proyecto} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }

    const status = STATUS_MAP[row.estado];
    if (!status) {
      tracker.warn(`registro ${row.id}: estado "${row.estado}" desconocido, se omite`);
      tracker.skipped += 1;
      continue;
    }

    const decisionUserId = resolveUserId(row.decision_lider_user_id, userIdsByLegacyAuth, legacyEmailByAuthId, userIdsByEmail).userId;
    const designatedApproverUserId = resolveUserId(
      row.designated_approver_user_id,
      userIdsByLegacyAuth,
      legacyEmailByAuthId,
      userIdsByEmail,
    ).userId;

    const values = {
      userId,
      projectId,
      assignment: row.asignacion?.trim() || null,
      category: row.categoria ?? '',
      description: row.descripcion ?? '',
      hours: row.horas,
      date: row.fecha,
      isOvertime: row.horas_extra,
      projectStageAtEntry: row.etapa_proyecto_registro?.trim() || null,
      status,
      rejectionReason: row.motivo_rechazo?.trim() || null,
      decisionUserId,
      decisionAt: row.decision_lider_at,
      designatedApproverUserId,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const existing = await context.target
      .select({ id: hourEntries.id })
      .from(hourEntries)
      .where(eq(hourEntries.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target.update(hourEntries).set(values).where(eq(hourEntries.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(hourEntries).values({ legacyId: row.id, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

/** `feriado` no tiene `legacy_id` propio: la clave natural (país+región+fecha+nombre) ya es la unicidad de destino. */
async function migrateHolidays(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('feriados');

  const rows = (await context.legacyReader.getRows<LegacyHoliday>('feriado')).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  tracker.read = rows.length;

  for (const row of rows) {
    const type = HOLIDAY_TYPE_MAP[row.tipo];
    if (!type) {
      tracker.warn(`feriado "${row.nombre}" (${row.fecha.toISOString().slice(0, 10)}): tipo "${row.tipo}" desconocido, se omite`);
      tracker.skipped += 1;
      continue;
    }

    const values = {
      countryCode: row.pais_codigo,
      regionCode: row.region_codigo,
      date: row.fecha,
      name: row.nombre,
      type,
      isWorkingDay: row.es_laboral,
    };

    // `xmax = 0` distingue insert de update tras un `onConflictDoUpdate` sin
    // una segunda consulta — antes esto siempre contaba "creado", incluso
    // cuando el conflicto solo actualizaba un feriado ya existente.
    const [result] = await context.target
      .insert(holidays)
      .values(values)
      .onConflictDoUpdate({
        target: [holidays.countryCode, holidays.regionCode, holidays.date, holidays.name],
        set: { type: values.type, isWorkingDay: values.isWorkingDay, updatedAt: new Date() },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

    if (result?.inserted) {
      tracker.created += 1;
    } else {
      tracker.updated += 1;
    }
  }

  context.report.add(tracker.toResult());
}

async function loadProjectIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: projects.id, legacyId: projects.legacyId }).from(projects);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}
