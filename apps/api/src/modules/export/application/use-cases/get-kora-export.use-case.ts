import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import type {
  KoraExport,
  KoraExportClient,
  KoraExportCollaborator,
  KoraExportPerson,
  KoraExportProject,
  KoraExportProjectUpdate,
  KoraExportTeamLeader,
} from '@kora/contracts';
import type { UseCase } from '../../../../shared/application/use-case';
import {
  KORA_EXPORT_READER,
  type ExportProjectRow,
  type KoraExportReader,
  type KoraExportRows,
} from '../ports/kora-export-reader.port';

export interface GetKoraExportCommand {
  readonly updatesLimit: number;
}

const toIsoDate = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * Arma el JSON completo de Kora: cliente → proyectos → responsable, líderes,
 * colaboradores y últimas actualizaciones de bitácora. Solo lectura.
 */
@Injectable()
export class GetKoraExportUseCase implements UseCase<GetKoraExportCommand, KoraExport, never> {
  constructor(
    @Inject(KORA_EXPORT_READER) private readonly reader: KoraExportReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ updatesLimit }: GetKoraExportCommand): Promise<Result<KoraExport, never>> {
    const rows = await this.reader.readAll(updatesLimit);
    const buildProject = this.projectBuilder(rows);

    const projectsByClient = groupBy(
      rows.projects.filter((project) => project.clientId !== null),
      (project) => project.clientId as string,
    );
    const person = this.personLookup(rows);

    const clients: KoraExportClient[] = [...rows.clients]
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'es'))
      .map((client) => ({
        id: client.id,
        companyName: client.companyName,
        legalName: client.legalName,
        taxId: client.taxId,
        slug: client.slug,
        status: client.status,
        website: client.website,
        commercialManager: person(client.commercialManagerUserId),
        projects: (projectsByClient.get(client.id) ?? []).sort(byName).map(buildProject),
      }));

    // Un proyecto cuyo cliente fue eliminado (soft delete) tampoco tiene dónde colgar: va al mismo grupo.
    const knownClientIds = new Set(rows.clients.map((client) => client.id));
    const projectsWithoutClient = rows.projects
      .filter((project) => project.clientId === null || !knownClientIds.has(project.clientId))
      .sort(byName)
      .map(buildProject);

    return ok({
      generatedAt: this.clock.now().toISOString(),
      updatesLimit,
      totals: { clients: clients.length, projects: rows.projects.length },
      clients,
      projectsWithoutClient,
    });
  }

  private personLookup(rows: KoraExportRows): (userId: string | null) => KoraExportPerson | null {
    const people = new Map(rows.people.map((p) => [p.id, p]));
    return (userId) => {
      if (!userId) return null;
      const found = people.get(userId);
      return found ? { id: found.id, fullName: found.fullName, email: found.email } : null;
    };
  }

  private projectBuilder(rows: KoraExportRows): (project: ExportProjectRow) => KoraExportProject {
    const person = this.personLookup(rows);
    const teamsByProject = groupBy(rows.projectTeams, (row) => row.projectId);
    const collaboratorsByProject = groupBy(rows.collaborators, (row) => row.projectId);
    const updatesByProject = groupBy(rows.updates, (row) => row.projectId);

    return (project) => {
      const leaders: KoraExportTeamLeader[] = (teamsByProject.get(project.id) ?? [])
        .map((team) => ({
          teamId: team.teamId,
          teamName: team.teamName,
          leader: person(team.leaderUserId),
          assignedHours: team.assignedHours,
        }))
        .sort((a, b) => a.teamName.localeCompare(b.teamName, 'es'));

      const collaborators: KoraExportCollaborator[] = (collaboratorsByProject.get(project.id) ?? [])
        .flatMap((row) => {
          const found = person(row.userId);
          if (!found) return [];
          return [
            {
              ...found,
              teamId: row.teamId,
              teamName: row.teamName,
              position: row.position,
              activity: row.activity,
              assignedHours: row.assignedHours,
              consumedHours: row.consumedHours,
              blocked: row.blockedAt !== null,
            },
          ];
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));

      // El lector ya las entrega recortadas y en orden (más recientes primero).
      const latestUpdates: KoraExportProjectUpdate[] = (updatesByProject.get(project.id) ?? []).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        status: row.status,
        moduleName: row.moduleName,
        date: toIsoDate(row.date) as string,
        createdAt: row.createdAt.toISOString(),
        author: person(row.authorUserId),
      }));

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        type: project.type,
        status: project.status,
        phase: project.phase,
        salesStage: project.salesStage,
        priority: project.priority,
        isInternal: project.isInternal,
        startDate: toIsoDate(project.startDate),
        endDate: toIsoDate(project.endDate),
        estimatedDeliveryDate: toIsoDate(project.estimatedDeliveryDate),
        soldHours: project.soldHours,
        usedHours: project.usedHours,
        expectedProgress: project.expectedProgress,
        actualProgress: project.actualProgress,
        responsible: person(project.leaderUserId),
        commercialManager: person(project.commercialManagerUserId),
        leaders,
        collaborators,
        latestUpdates,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      };
    };
  }
}
