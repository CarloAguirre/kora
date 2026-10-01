import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@kora/core';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
  type ProjectModuleSegmentMemberInput,
} from '../../domain/repositories/project-module.repository';
import { SEGMENT_FORECAST_STORE, type SegmentForecastStore } from '../ports/segment-forecast-store.port';
import {
  PROJECT_TEAM_MEMBER_VALIDATOR,
  type ProjectTeamMemberValidator,
} from '../ports/project-team-member-validator.port';
import { planSegmentForecast } from './segment-forecast-planner';

/**
 * Mantiene el Forecast al día con los tramos de ejecución del Roadmap: cada vez que se guarda un
 * tramo, sus filas de Forecast se borran y se vuelven a generar desde sus colaboradores y % diario
 * (ver `planSegmentForecast`). Los ajustes manuales del líder de equipo sobre esas filas se pisan
 * — es la regla acordada; las filas cargadas a mano (sin tramo) nunca se tocan.
 */
@Injectable()
export class SegmentForecastSyncService {
  constructor(
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(SEGMENT_FORECAST_STORE) private readonly store: SegmentForecastStore,
    @Inject(PROJECT_TEAM_MEMBER_VALIDATOR) private readonly teamMembers: ProjectTeamMemberValidator,
  ) {}

  /** ¿Todos son miembros activos de `teamId`? */
  async membersBelongToTeam(teamId: string, members: readonly ProjectModuleSegmentMemberInput[]): Promise<boolean> {
    const checks = await Promise.all(
      members.map(async (member) => {
        const [memberTeamId, active] = await Promise.all([
          this.teamMembers.findTeamId(member.teamMemberId),
          this.teamMembers.isActiveTeamMember(member.teamMemberId),
        ]);
        return memberTeamId === teamId && active;
      }),
    );
    return checks.every(Boolean);
  }

  async sync(
    project: { readonly id: string; readonly clientId: string | null },
    moduleId: string,
    segmentId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const module = await this.modules.findById(moduleId, context);
    const segment = module?.segments.find((s) => s.id === segmentId);
    if (!module || !segment) return;

    const nonWorkingDates = await this.store.listNonWorkingDates(segment.startDate, segment.endDate, context);
    const weeks = planSegmentForecast({
      startDate: segment.startDate,
      endDate: segment.endDate,
      members: segment.members,
      nonWorkingDates,
    });

    await this.store.replaceForSegment(
      {
        segmentId,
        projectId: project.id,
        clientId: project.clientId,
        comments: `Roadmap: ${module.name} · ${segment.name}`.slice(0, 500),
      },
      weeks,
      now,
      context,
    );
  }
}
