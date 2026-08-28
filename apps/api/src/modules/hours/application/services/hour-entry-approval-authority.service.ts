import { Inject, Injectable } from '@nestjs/common';
import type { RoleCode } from '@kora/contracts';
import type { HourEntry } from '../../domain/entities/hour-entry.entity';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { HOUR_ENTRY_TEAM_READER, type HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';

/**
 * ¿Puede `actor` aprobar/rechazar este registro?
 *
 * La v1 resuelve esto en RLS con cinco funciones anidadas (`rls_can_access_project`,
 * `rls_can_approve_no_project_hh`...) que replican, en SQL, exactamente el mismo
 * árbol de decisión: admin siempre puede; si el registro tiene proyecto, quien
 * lidera ese proyecto o el equipo asignado a él; si no, el aprobador designado o
 * quien lidera al dueño del registro. Aquí es una decisión de aplicación, no de
 * RLS — y PMO se trata como admin, siguiendo la misma equivalencia que ya usa el
 * resto del sistema (`isAdminLikeRole`/`hasRoleAccess`).
 */
@Injectable()
export class HourEntryApprovalAuthorityService {
  constructor(
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(HOUR_ENTRY_TEAM_READER) private readonly teams: HourEntryTeamReader,
  ) {}

  async canDecide(actorId: string, actorRole: RoleCode, entry: HourEntry): Promise<boolean> {
    if (actorRole === 'admin' || actorRole === 'pmo') return true;

    if (entry.projectId) return this.projects.isProjectApprover(entry.projectId, actorId);

    if (entry.designatedApproverUserId) return entry.designatedApproverUserId === actorId;

    return this.teams.isTeamLeaderOfMember(actorId, entry.userId);
  }
}
