import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { isUuid } from '@kora/core';
import type { Permission, ProjectDetail } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { PROJECT_USER_READER, type ProjectUserReader } from '../ports/project-user-reader.port';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import { PROJECT_CONTACT_READER, type ProjectContactReader } from '../ports/project-contact-reader.port';
import { PROJECT_HOUR_ENTRY_READER, type ProjectHourEntryReader } from '../ports/project-hour-entry-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toProjectDetail } from '../mappers/project.mapper';

export interface GetProjectCommand {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Sin `projects:read` (alcance completo), solo puede ver la ficha si
 * participa en el proyecto — líder, desarrollador, responsable comercial, o
 * en el equipo asignado. `projects:read_assigned` da acceso al endpoint;
 * esta verificación decide si a ESTE proyecto en particular.
 */
@Injectable()
export class GetProjectUseCase implements UseCase<GetProjectCommand, ProjectDetail, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly teams: ProjectTeamRepository,
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly paymentMilestones: ProjectPaymentMilestoneRepository,
    @Inject(PROJECT_USER_READER) private readonly users: ProjectUserReader,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(PROJECT_CONTACT_READER) private readonly contacts: ProjectContactReader,
    @Inject(PROJECT_HOUR_ENTRY_READER) private readonly hourEntries: ProjectHourEntryReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GetProjectCommand): Promise<Result<ProjectDetail, ApplicationError>> {
    const project = isUuid(command.projectId)
      ? await this.projects.findById(command.projectId)
      : await this.projects.findBySlug(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const snapshot = project.toSnapshot();

    const [
      client,
      ownPrimaryContact,
      leader,
      developer,
      commercialManager,
      members,
      projectTeams,
      projectObservations,
      projectModules,
      projectPaymentMilestones,
      usedHoursUpdatedAt,
    ] = await Promise.all([
      snapshot.clientId ? this.clients.findById(snapshot.clientId) : Promise.resolve(null),
      snapshot.primaryContactId ? this.contacts.findById(snapshot.primaryContactId) : Promise.resolve(null),
      snapshot.leaderUserId ? this.users.findById(snapshot.leaderUserId) : Promise.resolve(null),
      snapshot.developerUserId ? this.users.findById(snapshot.developerUserId) : Promise.resolve(null),
      snapshot.commercialManagerUserId
        ? this.users.findById(snapshot.commercialManagerUserId)
        : Promise.resolve(null),
      this.members.listForProject(project.id),
      this.teams.findByProject(project.id),
      this.observations.listForProject(project.id),
      this.modules.listForProject(project.id),
      this.paymentMilestones.listForProject(project.id),
      this.hourEntries.maxApprovedEntryDateForProject(project.id),
    ]);

    /**
     * Un proyecto creado con "usar el contacto del cliente" no guarda `primaryContactId` propio:
     * hereda el contacto principal del cliente, así que se resuelve ese en vez de dejarlo vacío.
     */
    const primaryContact =
      ownPrimaryContact ?? (client?.primaryContactId ? await this.contacts.findById(client.primaryContactId) : null);

    /**
     * Fase "Prospecto/Cotización": horas aprobadas con fecha anterior al
     * DÍA del Hito 0 (no al instante exacto — una hora cargada el mismo día
     * en que se facturó ya es del proyecto, ver el documento de Leslie
     * "Corte por fecha"). Sin Hito 0 todavía, el proyecto nunca se activó:
     * todo lo consumido es de esta fase.
     */
    const prospectPhaseHours = snapshot.hito0At
      ? await this.hourEntries.sumApprovedHoursBeforeDateForProject(
          project.id,
          new Date(snapshot.hito0At.toISOString().slice(0, 10)),
        )
      : snapshot.usedHours;

    if (!command.actorPermissions.includes('projects:read')) {
      const isParticipant =
        snapshot.leaderUserId === command.actorUserId ||
        snapshot.developerUserId === command.actorUserId ||
        snapshot.commercialManagerUserId === command.actorUserId ||
        projectTeams.some((team) => team.leaderUserId === command.actorUserId) ||
        members.some((member) => member.userId === command.actorUserId);
      if (!isParticipant) return err(new ForbiddenError('No tienes acceso a este proyecto.', 'PROJECT_NOT_ASSIGNED'));
    }

    /**
     * Quién puede autorizar que ESTE proyecto admita horas extra: mismo
     * criterio EXCLUYENTE que el resto del sistema (líder de proyecto o líder
     * del equipo asignado a él), ver `SetProjectOvertimeAuthorizationUseCase`.
     */
    const canAuthorizeOvertime =
      command.actorPermissions.includes('projects:manage') ||
      (await this.projects.isProjectLeaderOrTeamLeaderOfMember(project.id, command.actorUserId, null));

    /** Mismo criterio que `ResolveProjectObservationUseCase`: líder de este proyecto, PMO o admin. */
    const canManagePendings =
      command.actorPermissions.includes('projects:manage') || snapshot.leaderUserId === command.actorUserId;

    /**
     * Equipos que lidera quien consulta — `coalesce(project_teams.leader, teams.leader)`, el mismo criterio
     * con que `UpdateProjectModuleDeliveryUseCase` deja al líder de equipo gestionar sus entregas.
     */
    const deliveryTeamIds = [
      ...new Set(projectModules.flatMap((module) => module.deliveries.flatMap((delivery) => (delivery.teamId ? [delivery.teamId] : [])))),
    ];
    const ledTeamIds = new Set(
      canManagePendings
        ? []
        : (
            await Promise.all(
              deliveryTeamIds.map(async (teamId) =>
                (await this.teams.isTeamLeaderForProject(project.id, teamId, command.actorUserId)) ? teamId : null,
              ),
            )
          ).filter((teamId): teamId is string => teamId !== null),
    );

    return ok(
      toProjectDetail({
        project,
        client,
        primaryContact,
        leader,
        developer,
        commercialManager,
        members,
        teams: projectTeams,
        observations: projectObservations,
        modules: projectModules,
        paymentMilestones: projectPaymentMilestones,
        usedHoursUpdatedAt,
        prospectPhaseHours,
        actorUserId: command.actorUserId,
        canManagePendings,
        ledTeamIds,
        canAuthorizeOvertime,
        now: this.clock.now(),
      }),
    );
  }
}
