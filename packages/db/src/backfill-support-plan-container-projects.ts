import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createDatabaseConnection } from './client';
import { projects, supportPlanProjects, supportPlans, tickets } from './schema';
import { slugify, withUniqueSuffix } from './lib/slug';

/**
 * Crea el proyecto "contenedor" de soporte que les falta a los contratos
 * creados desde la v2 antes de que `CreateSupportPlanUseCase` empezara a
 * crearlo (`support_plans.project_id` nulo) — sin él, esos contratos no
 * aparecen en nada que liste proyectos de soporte (Proyectos → Soporte,
 * dashboard, ficha de cliente, selector de proyecto del ticket).
 *
 * También mueve al contenedor los tickets abiertos directo contra un proyecto
 * de desarrollo cubierto por el contrato (el proyecto cubierto pasa a
 * "Proyecto de desarrollo"), para que queden igual que los tickets nuevos.
 * Idempotente: solo toca contratos que siguen sin `project_id`. Corre una
 * sola vez, manualmente, después de desplegar ese cambio.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const { db, close } = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    const plans = await db.select().from(supportPlans).where(isNull(supportPlans.projectId));
    let movedTickets = 0;

    for (const plan of plans) {
      const linkedIds = (
        await db
          .select({ id: supportPlanProjects.developmentProjectId })
          .from(supportPlanProjects)
          .where(eq(supportPlanProjects.planId, plan.id))
      ).map((row) => row.id);

      // Los contratos v2 siempre se crean con nombre (ver `resolveSupportPlanName`); el slug es el último recurso.
      const baseName = plan.name?.trim() || plan.slug;
      const name = await availableName(db, plan.clientId, baseName);
      const slug = await withUniqueSuffix(slugify(name), (candidate) => projectSlugExists(db, candidate));
      const isActive = plan.status === 'active';

      await db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({
            name,
            slug,
            clientId: plan.clientId,
            type: 'support',
            status: isActive ? 'active' : 'finished',
            leaderUserId: plan.leaderUserId,
            startDate: plan.startDate,
            estimatedDeliveryDate: plan.endDate,
            endDate: isActive ? null : (plan.closedAt ?? plan.endDate),
            supportHours: plan.contractedHours,
            quotationLink: plan.quotationLink,
            contractLink: plan.contractLink,
            additionalLinks: plan.additionalLinks,
          })
          .returning({ id: projects.id });

        await tx.update(supportPlans).set({ projectId: project!.id, updatedAt: new Date() }).where(eq(supportPlans.id, plan.id));

        if (linkedIds.length > 0) {
          const moved = await tx
            .update(tickets)
            .set({
              developmentProjectId: sql`coalesce(${tickets.developmentProjectId}, ${tickets.projectId})`,
              projectId: project!.id,
              updatedAt: new Date(),
            })
            .where(and(inArray(tickets.projectId, linkedIds), eq(tickets.clientId, plan.clientId)))
            .returning({ id: tickets.id });
          movedTickets += moved.length;
        }
      });

      console.log(`"${baseName}" → proyecto de soporte "${name}" (${slug}).`);
    }

    console.log(`support_plans: ${plans.length} contratos con proyecto de soporte nuevo; ${movedTickets} tickets movidos al contenedor.`);
  } finally {
    await close();
  }
}

type Db = Awaited<ReturnType<typeof createDatabaseConnection>>['db'];

async function projectSlugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
  return rows.length > 0;
}

/** Respeta `projects_client_name_key` (nombre único por cliente, sin mayúsculas ni espacios de borde). */
async function availableName(db: Db, clientId: string, baseName: string): Promise<string> {
  const isTaken = async (candidate: string) => {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.clientId, clientId),
          sql`lower(btrim(${projects.name})) = lower(btrim(${candidate}))`,
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  };

  if (!(await isTaken(baseName))) return baseName;
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? `${baseName} (soporte)` : `${baseName} (soporte ${attempt})`;
    if (!(await isTaken(candidate))) return candidate;
  }
}

main().catch((error: unknown) => {
  console.error('Falló el backfill de proyectos contenedor de contratos de soporte:', error);
  process.exit(1);
});
