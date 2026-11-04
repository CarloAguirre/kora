import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import { slugify } from '../../lib/slug';
import {
  hourEntries,
  projectObservations,
  projectPaymentMilestones,
  projects,
  projectTeamMembers,
  projectTeams,
  teamMembers,
} from '../../schema';

/**
 * Utilidades comunes de las cargas de "fichas de proyecto para Kora" (los Excel de Leslie): fechas,
 * textos de la bitácora iguales a los de la API, clon de prueba "<proyecto> carga" y su borrado.
 * Cada proyecto tiene su archivo de datos (p.ej. `aurelia-inspecciones.ts`), porque cómo se traspone
 * cada ficha a Kora es una decisión por proyecto.
 */

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type FichaTarget = 'preview' | 'real';
export type ObservationInsert = typeof projectObservations.$inferInsert;

export const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Hora del registro en la bitácora: mediodía de Chile, con minutos para ordenar los del mismo día. */
export const at = (iso: string, minute = 0) => new Date(`${iso}T15:${String(minute).padStart(2, '0')}:00.000Z`);
/** Mismo formato que `formatCommittedDate`/`deadlineNote` de la API. */
export const fmt = (iso: string) => d(iso).toLocaleDateString('es-CL', { timeZone: 'UTC' });
export const deadline = (committed: string, done: string) => {
  const late = Math.max(Math.round((Date.parse(done) - Date.parse(committed)) / 86_400_000), 0);
  const note = `fecha comprometida ${fmt(committed)}`;
  return late === 0 ? `a tiempo (${note})` : `con ${late} ${late === 1 ? 'día' : 'días'} de atraso (${note})`;
};
/** "Hoy" en Chile como `YYYY-MM-DD`. */
export const todayInChile = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Ids fijos (idempotentes) de una carga: `<prefijo>-0000-4000-8000-<n>` — un prefijo por proyecto y destino. */
export const fixedId = (prefix: string) => (n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Membresía de equipo vigente (o la última) de una persona — ver la nota de `demo-amicar-operaciones.ts`. */
export async function resolveTeamMembership(tx: Transaction, teamId: string, userId: string): Promise<string> {
  const [row] = await tx
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .orderBy(sql`${teamMembers.leftAt} is null desc`, desc(teamMembers.joinedAt))
    .limit(1);
  if (!row) throw new Error(`No se encontró la membresía de user=${userId} en team=${teamId} en esta base.`);
  return row.id;
}

/** Borra un clon de prueba — primero sus horas copiadas (el FK `set null` las dejaría huérfanas, sin proyecto). */
export async function deletePreviewProject(db: Pick<Database, 'delete'>, previewId: string): Promise<void> {
  await db.delete(hourEntries).where(eq(hourEntries.projectId, previewId));
  await db.delete(projectObservations).where(eq(projectObservations.projectId, previewId));
  await db.delete(projects).where(eq(projects.id, previewId));
}

/**
 * Crea el clon de prueba de `real`: misma fila de proyecto (otro id/nombre/slug, sin `legacyId`) con
 * sus equipos (salvo `excludeTeamIds`), colaboradores y tramos de pago. Borra antes el clon anterior.
 */
export async function createPreviewProject(
  tx: Transaction,
  real: typeof projects.$inferSelect,
  previewId: string,
  previewName: string,
  excludeTeamIds: readonly string[] = [],
): Promise<void> {
  await deletePreviewProject(tx, previewId);
  const { id: _id, legacyId: _legacyId, createdAt: _createdAt, updatedAt: _updatedAt, ...cloneable } = real;
  await tx.insert(projects).values({ ...cloneable, id: previewId, name: previewName, slug: slugify(previewName) });

  const [teamRows, memberRows, paymentRows] = await Promise.all([
    tx.select().from(projectTeams).where(eq(projectTeams.projectId, real.id)),
    tx.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, real.id)),
    tx.select().from(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, real.id)),
  ]);
  const keptTeams = teamRows.filter((row) => !excludeTeamIds.includes(row.teamId));
  if (keptTeams.length > 0) {
    await tx.insert(projectTeams).values(
      keptTeams.map(({ id: _rowId, legacyId: _rowLegacyId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId: previewId })),
    );
  }
  const keptMembers = memberRows.filter((row) => !excludeTeamIds.includes(row.teamId));
  if (keptMembers.length > 0) {
    await tx.insert(projectTeamMembers).values(
      keptMembers.map(({ id: _rowId, legacyId: _rowLegacyId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId: previewId })),
    );
  }
  if (paymentRows.length > 0) {
    await tx
      .insert(projectPaymentMilestones)
      .values(paymentRows.map(({ id: _rowId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId: previewId })));
  }
}

/** Fábrica de registros de bitácora con fecha del hecho y hora fija (ver `at`). */
export const observationLogger =
  (projectId: string) =>
  (on: string, minute: number, authorUserId: string, message: string, extra: Partial<ObservationInsert> = {}): Omit<ObservationInsert, 'id'> => ({
    projectId,
    type: 'cambio_proyecto',
    message,
    date: d(on),
    authorUserId,
    createdAt: at(on, minute),
    updatedAt: at(on, minute),
    ...extra,
  });

/** Registro semanal del Panel de Control AurelIA (hoja "Historial de avance"). */
export function panelObservation(
  log: ReturnType<typeof observationLogger>,
  authorUserId: string,
  moduleName: string,
  extra: Partial<ObservationInsert>,
  [on, expected, actual, note]: readonly [string, number, number, string],
): Omit<ObservationInsert, 'id'> {
  const deviation = actual - expected;
  const deviationText = deviation === 0 ? 'sin desvío' : `desvío ${deviation > 0 ? '+' : ''}${deviation} pts`;
  return log(on, 20, authorUserId, `Panel de Control AurelIA: esperado ${expected}% · real ${actual}% (${deviationText}).${note ? ` ${note}` : ''}`, {
    type: 'observacion',
    title: `Avance ${moduleName} · Panel ${fmt(on)}`,
    status: null,
    ...extra,
  });
}
