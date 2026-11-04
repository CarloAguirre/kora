import { Inject, Injectable } from '@nestjs/common';
import {
  and, desc, eq, inArray, isNull, sql,
  projects, projectModules, projectModuleSegments, projectModuleDeliveries,
  projectQuotations, projectTeams, teams, quotationEvents, quotationVersions,
  type Database,
} from '@kora/db';
import { approvedCalendarPeriod, quotationDraftDataSchema } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import type { ApprovedProjectCalendar } from '../../application/ports/approved-project-calendar.port';

type Period = { startDate: string; endDate: string };
const utcDate = (iso: string) => new Date(iso + 'T00:00:00.000Z');

/**
 * Hito 0: materializa sin segunda aprobación las semanas de una cotización
 * CLIENTE-APROBADA y TRASPASADA. No inventa tareas ni asigna colaboradores.
 *
 * También cubre proyectos ya iniciados antes de este cambio: la primera
 * lectura autorizada ejecuta el mismo proceso. El lock del proyecto y un
 * evento append-only garantizan que el siguiente GET no reescriba ediciones
 * ni recree bloques eliminados voluntariamente.
 */
@Injectable()
export class DrizzleApprovedProjectCalendar implements ApprovedProjectCalendar {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async ensure(projectId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const [project] = await tx.select({
        id: projects.id, startDate: projects.startDate,
        status: projects.status, type: projects.type,
      }).from(projects).where(and(
        eq(projects.id, projectId), isNull(projects.deletedAt),
      )).limit(1);
      if (!project || project.type !== 'development' || project.status !== 'active' ||
          !project.startDate) return false;

      const [source] = await tx.select({
        versionId: quotationVersions.id,
        draft: quotationVersions.draft,
        transfer: quotationEvents.metadata,
      }).from(quotationEvents)
        .innerJoin(quotationVersions, eq(quotationVersions.id, quotationEvents.versionId))
        .innerJoin(projectQuotations, eq(projectQuotations.id, quotationVersions.quotationId))
        .where(and(
          eq(projectQuotations.projectId, projectId),
          eq(quotationEvents.action, 'quotation_transferred'),
        )).orderBy(desc(quotationEvents.occurredAt)).limit(1);
      // La mera existencia de un borrador EDT no autoriza generar barras reales.
      if (!source) return false;

      const [materialized] = await tx.select({ id: quotationEvents.id })
        .from(quotationEvents).where(and(
          eq(quotationEvents.versionId, source.versionId),
          eq(quotationEvents.action, 'roadmap_calendar_materialized'),
        )).limit(1);
      if (materialized) return false;

      const rawIds = (source.transfer as { moduleIds?: unknown }).moduleIds;
      if (!Array.isArray(rawIds) || !rawIds.every((id) => typeof id === 'string')) {
        throw new Error('Traspaso de cotización sin identidades de fase: no se generará un cronograma incorrecto.');
      }
      const moduleIds = rawIds as string[];
      const draft = quotationDraftDataSchema.parse(source.draft);
      // Son exactamente las fases que originaron los IDs del traspaso.
      // Para EDT sin calendario de fases NO se fabrican duraciones.
      if (draft.mode !== 'phases' || draft.phases.length === 0) return false;
      const phases = draft.phases.filter((phase) =>
        phase.teamHours.reduce((sum, row) => sum + row.hours, 0) > 0);
      if (phases.length !== moduleIds.length) {
        throw new Error('La cotización transferida y sus fases no coinciden; se preserva el Roadmap existente.');
      }
      if (!moduleIds.length) return false;

      const moduleRows = await tx.select({
        id: projectModules.id, name: projectModules.name,
        estimatedStartDate: projectModules.estimatedStartDate,
        estimatedEndDate: projectModules.estimatedEndDate,
      }).from(projectModules).where(and(
        eq(projectModules.projectId, projectId), inArray(projectModules.id, moduleIds),
      ));
      const moduleById = new Map(moduleRows.map((row) => [row.id, row]));
      const teamRows = await tx.select({ id: projectTeams.teamId, name: teams.name })
        .from(projectTeams)
        .innerJoin(teams, eq(teams.id, projectTeams.teamId))
        .where(eq(projectTeams.projectId, projectId));
      const nameByTeam = new Map(teamRows.map((team) => [team.id, team.name]));

      const segments = await tx.select({
        moduleId: projectModuleSegments.moduleId, teamId: projectModuleSegments.teamId,
        startDate: projectModuleSegments.startDate, endDate: projectModuleSegments.endDate,
      }).from(projectModuleSegments).where(inArray(projectModuleSegments.moduleId, moduleIds));
      const existing = new Set(segments.map((row) => row.moduleId + ':' + row.teamId));
      const bounds = new Map<string, Period[]>();
      for (const segment of segments) {
        const list = bounds.get(segment.moduleId) ?? [];
        list.push({
          startDate: segment.startDate.toISOString().slice(0, 10),
          endDate: segment.endDate.toISOString().slice(0, 10),
        });
        bounds.set(segment.moduleId, list);
      }

      const startIso = project.startDate.toISOString().slice(0, 10);
      let generated = 0;
      for (const [index, phase] of phases.entries()) {
        const moduleId = moduleIds[index]!;
        const module = moduleById.get(moduleId);
        // Una fase eliminada o un equipo retirado nunca se reconstruyen.
        if (!module) continue;
        const period = approvedCalendarPeriod(startIso, phase.startWeek, phase.durationWeeks);
        if (!period) throw new Error('La cotización aprobada contiene semanas inválidas.');
        for (const effort of phase.teamHours) {
          if (effort.hours <= 0 || !nameByTeam.has(effort.teamId)) continue;
          const key = moduleId + ':' + effort.teamId;
          if (existing.has(key)) continue; // conservar bloques creados o editados
          const now = new Date();
          const [segment] = await tx.insert(projectModuleSegments).values({
            moduleId, teamId: effort.teamId, name: module.name,
            startDate: utcDate(period.startDate),
            endDate: utcDate(period.endDate),
            estimatedHours: effort.hours.toFixed(2),
            createdAt: now, updatedAt: now,
          }).returning({ id: projectModuleSegments.id });
          if (!segment) throw new Error('No se pudo registrar el bloque de trabajo aprobado.');
          const deliveryName = (module.name + ' · ' + nameByTeam.get(effort.teamId)!).slice(0, 300);
          await tx.insert(projectModuleDeliveries).values({
            moduleId, segmentId: segment.id, teamId: effort.teamId,
            name: deliveryName, description: null, assigneeUserId: null,
            estimatedDate: utcDate(period.endDate), status: 'planned',
            createdAt: now, updatedAt: now,
          });
          existing.add(key);
          const list = bounds.get(moduleId) ?? [];
          list.push(period);
          bounds.set(moduleId, list);
          generated++;
        }
      }
      // Las fechas de fase son metadatos del plan operativo real; las ediciones
      // explícitas del PM jamás se reemplazan en lecturas posteriores.
      for (const module of moduleRows) {
        const periods = bounds.get(module.id);
        if (!periods?.length ||
            (module.estimatedStartDate && module.estimatedEndDate)) continue;
        const starts = periods.map((period) => period.startDate).sort();
        const ends = periods.map((period) => period.endDate).sort();
        await tx.update(projectModules).set({
          ...(!module.estimatedStartDate ? { estimatedStartDate: utcDate(starts[0]!) } : {}),
          ...(!module.estimatedEndDate ? {
            estimatedEndDate: utcDate(ends[ends.length - 1]!),
          } : {}),
          updatedAt: new Date(),
        }).where(eq(projectModules.id, module.id));
      }

      // Evita reintroducir bloques borrados por el PM: el evento se crea incluso
      // cuando todos los equipos ya tenían planificación y no hubo insert.
      await tx.insert(quotationEvents).values({
        versionId: source.versionId,
        action: 'roadmap_calendar_materialized',
        actorUserId: null,
        metadata: {
          projectId, startDate: startIso, generatedBlocks: generated,
          source: 'approved_quotation_start', moduleIds,
        },
      });
      return generated > 0;
    });
  }
}
