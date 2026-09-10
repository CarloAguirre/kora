import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  addProjectObservationSchema,
  assignProjectTeamMemberSchema,
  changeProjectStatusSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  setProjectOvertimeAuthorizationSchema,
  updateProjectObservationSchema,
  updateProjectSchema,
  type AddProjectObservationInput,
  type AssignProjectTeamMemberInput,
  type ChangeProjectStatusInput,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ListProjectsResponse,
  type ProjectDetail,
  type SetProjectOvertimeAuthorizationInput,
  type UpdateProjectInput,
  type UpdateProjectObservationInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CreateProjectUseCase } from '../application/use-cases/create-project.use-case';
import { UpdateProjectUseCase } from '../application/use-cases/update-project.use-case';
import { ListProjectsUseCase } from '../application/use-cases/list-projects.use-case';
import { GetProjectUseCase } from '../application/use-cases/get-project.use-case';
import { ChangeProjectStatusUseCase } from '../application/use-cases/change-project-status.use-case';
import { SetProjectOvertimeAuthorizationUseCase } from '../application/use-cases/set-project-overtime-authorization.use-case';
import { DeleteProjectUseCase } from '../application/use-cases/delete-project.use-case';
import { AssignProjectTeamMemberUseCase } from '../application/use-cases/assign-project-team-member.use-case';
import { UnassignProjectTeamMemberUseCase } from '../application/use-cases/unassign-project-team-member.use-case';
import { AddProjectObservationUseCase } from '../application/use-cases/add-project-observation.use-case';
import { UpdateProjectObservationUseCase } from '../application/use-cases/update-project-observation.use-case';
import { DeleteProjectObservationUseCase } from '../application/use-cases/delete-project-observation.use-case';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly listProjects: ListProjectsUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly changeStatus: ChangeProjectStatusUseCase,
    private readonly setOvertimeAuthorization: SetProjectOvertimeAuthorizationUseCase,
    private readonly deleteProject: DeleteProjectUseCase,
    private readonly assignMember: AssignProjectTeamMemberUseCase,
    private readonly unassignMember: UnassignProjectTeamMemberUseCase,
    private readonly addObservation: AddProjectObservationUseCase,
    private readonly updateObservation: UpdateProjectObservationUseCase,
    private readonly deleteObservation: DeleteProjectObservationUseCase,
  ) {}

  /**
   * `hours:register` también da acceso a esta lista (siempre acotada a los
   * proyectos propios del actor por `ListProjectsUseCase`, igual que sin ese
   * permiso extra): es el selector de proyecto del modal de registro de
   * horas, que cualquiera que registre horas necesita poder ver aunque no
   * tenga permiso para la página de Proyectos.
   */
  @Get()
  @RequireAnyPermission('projects:read', 'projects:read_assigned', 'hours:register')
  async list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema)) query: ListProjectsQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ListProjectsResponse> {
    const page = unwrapOrThrow(
      await this.listProjects.execute({ query, actor: toActorContext(actor), actorPermissions: actor.permissions }),
    );
    return { ...page, items: [...page.items] };
  }

  @Get(':id')
  @RequireAnyPermission('projects:read', 'projects:read_assigned')
  async detail(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<ProjectDetail> {
    return unwrapOrThrow(
      await this.getProject.execute({ projectId: id, actorUserId: actor.id, actorPermissions: actor.permissions }),
    );
  }

  @Post()
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createProject.execute({ data: body, actor: toActorContext(actor) }));
  }

  @Patch(':id')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.updateProject.execute({ projectId: id, data: body, actor: toActorContext(actor) }));
  }

  @Patch(':id/status')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeProjectStatusSchema)) body: ChangeProjectStatusInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.changeStatus.execute({ projectId: id, data: body, actor: toActorContext(actor) }));
  }

  /**
   * Endpoint propio (no parte de `PATCH /projects/:id`) porque ese exige
   * `projects:manage` a nivel de decorador — un líder de proyecto/equipo sin
   * ese permiso igual debe poder autorizar horas extra en SU proyecto, sin
   * abrir el resto de los campos del proyecto. La autorización fina vive en
   * `SetProjectOvertimeAuthorizationUseCase`.
   */
  @Patch(':id/overtime')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOvertime(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setProjectOvertimeAuthorizationSchema)) body: SetProjectOvertimeAuthorizationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.setOvertimeAuthorization.execute({
        projectId: id,
        allowsOvertime: body.allowsOvertime,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Delete(':id')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteProject.execute({ projectId: id, actor: toActorContext(actor) }));
  }

  @Post(':id/members')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async assignTeamMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignProjectTeamMemberSchema)) body: AssignProjectTeamMemberInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.assignMember.execute({ projectId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Delete(':id/members/:assignmentId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignTeamMember(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.unassignMember.execute({ projectId: id, assignmentId, actor: toActorContext(actor) }),
    );
  }

  /**
   * `projects:read_assigned` también da acceso: un líder sin `projects:manage`
   * puede agregar observaciones, pero solo a proyectos donde participa — lo
   * decide `AddProjectObservationUseCase`, igual que `GetProjectUseCase` para
   * la lectura.
   */
  @Post(':id/observations')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.CREATED)
  async addProjectObservation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addProjectObservationSchema)) body: AddProjectObservationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.addObservation.execute({
        projectId: id,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  /**
   * Igual que al crear, el permiso solo abre la puerta: `UpdateProjectObservationUseCase`
   * exige además ser el autor y estar dentro de los 15 minutos desde su creación.
   */
  @Patch(':id/observations/:observationId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProjectObservation(
    @Param('id') id: string,
    @Param('observationId') observationId: string,
    @Body(new ZodValidationPipe(updateProjectObservationSchema)) body: UpdateProjectObservationInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateObservation.execute({
        projectId: id,
        observationId,
        data: body,
        actor: toActorContext(actor),
      }),
    );
  }

  @Delete(':id/observations/:observationId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProjectObservation(
    @Param('id') id: string,
    @Param('observationId') observationId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.deleteObservation.execute({ projectId: id, observationId, actor: toActorContext(actor) }),
    );
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
