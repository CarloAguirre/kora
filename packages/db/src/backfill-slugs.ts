import { eq, isNull, sql } from 'drizzle-orm';
import { createDatabaseConnection } from './client';
import { clients, projects, teams, supportPlans, tickets } from './schema';
import { slugify, withUniqueSuffix } from './lib/slug';

/**
 * Rellena `slug` para las filas creadas antes de que la columna existiera, y
 * `legacy_id` (código visible `TK-0001`) para los tickets creados en la v2
 * antes de que `CreateTicketUseCase` empezara a asignarlo. Corre una sola vez,
 * antes de la migración `0025` (que agrega NOT NULL + índice único a los
 * slugs) — los registros nuevos ya llegan con estos campos seteados desde los
 * casos de uso de creación.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const { db, close } = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    await backfillClients(db);
    await backfillTeams(db);
    await backfillProjects(db);
    await backfillSupportPlans(db);
    await backfillTicketCodes(db);
    console.log('Backfill completo.');
  } finally {
    await close();
  }
}

type Db = Awaited<ReturnType<typeof createDatabaseConnection>>['db'];

async function clientSlugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, slug)).limit(1);
  return rows.length > 0;
}

async function teamSlugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);
  return rows.length > 0;
}

async function projectSlugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
  return rows.length > 0;
}

async function supportPlanSlugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: supportPlans.id }).from(supportPlans).where(eq(supportPlans.slug, slug)).limit(1);
  return rows.length > 0;
}

async function backfillClients(db: Db): Promise<void> {
  const rows = await db
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(isNull(clients.slug));

  for (const row of rows) {
    const slug = await withUniqueSuffix(slugify(row.companyName), (candidate) => clientSlugExists(db, candidate));
    await db.update(clients).set({ slug }).where(eq(clients.id, row.id));
  }
  console.log(`clients: ${rows.length} backfilleados.`);
}

async function backfillTeams(db: Db): Promise<void> {
  const rows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(isNull(teams.slug));

  for (const row of rows) {
    const slug = await withUniqueSuffix(slugify(row.name), (candidate) => teamSlugExists(db, candidate));
    await db.update(teams).set({ slug }).where(eq(teams.id, row.id));
  }
  console.log(`teams: ${rows.length} backfilleados.`);
}

async function backfillProjects(db: Db): Promise<void> {
  const rows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(isNull(projects.slug));

  for (const row of rows) {
    const slug = await withUniqueSuffix(slugify(row.name), (candidate) => projectSlugExists(db, candidate));
    await db.update(projects).set({ slug }).where(eq(projects.id, row.id));
  }
  console.log(`projects: ${rows.length} backfilleados.`);
}

/** Réplica simplificada de `resolveSupportPlanName` (apps/api) — solo para los contratos legados con `name` null. */
async function backfillSupportPlans(db: Db): Promise<void> {
  const rows = await db
    .select({
      id: supportPlans.id,
      name: supportPlans.name,
      scope: supportPlans.scope,
      clientId: supportPlans.clientId,
      projectId: supportPlans.projectId,
    })
    .from(supportPlans)
    .where(isNull(supportPlans.slug));

  for (const row of rows) {
    let baseName = row.name;
    if (!baseName) {
      const [client] = await db
        .select({ companyName: clients.companyName })
        .from(clients)
        .where(eq(clients.id, row.clientId))
        .limit(1);
      const clientName = client?.companyName ?? 'cliente';

      if (row.scope === 'single' && row.projectId) {
        const [project] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .limit(1);
        const projectName = project?.name ?? clientName;
        baseName = /^soporte\b/i.test(projectName) ? projectName : `Soporte ${projectName}`;
      } else {
        baseName = `Consolidado ${clientName}`;
      }
    }

    const slug = await withUniqueSuffix(slugify(baseName), (candidate) => supportPlanSlugExists(db, candidate));
    await db.update(supportPlans).set({ slug }).where(eq(supportPlans.id, row.id));
  }
  console.log(`support_plans: ${rows.length} backfilleados.`);
}

async function backfillTicketCodes(db: Db): Promise<void> {
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(isNull(tickets.legacyId))
    .orderBy(tickets.createdAt);

  for (const row of rows) {
    const result = await db.execute(sql`select nextval('tickets_code_seq')::text as nextval`);
    const nextval = (result[0] as { nextval: string }).nextval;
    const code = `TK-${nextval.padStart(4, '0')}`;
    await db.update(tickets).set({ legacyId: code }).where(eq(tickets.id, row.id));
  }
  console.log(`tickets: ${rows.length} códigos backfilleados.`);
}

main().catch((error: unknown) => {
  console.error('Falló el backfill de slugs:', error);
  process.exit(1);
});
