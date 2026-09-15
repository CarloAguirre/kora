import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  addProjectModuleDeliverySchema,
  addProjectObservationSchema,
  assignProjectTeamMemberSchema,
  changeProjectStatusSchema,
  createProjectModuleSchema,
  createProjectModuleSegmentSchema,
  createProjectModuleTaskSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  setProjectOvertimeAuthorizationSchema,
  updateProjectModuleDeliverySchema,
  updateProjectModuleSchema,
  updateProjectModuleSegmentSchema,
  updateProjectModuleTaskSchema,
  updateProjectObservationSchema,
  updateProjectSchema,
  updateProjectTeamMemberSchema,
  type AddProjectModuleDeliveryInput,
  type AddProjectObservationInput,
  type AssignProjectTeamMemberInput,
  type ChangeProjectStatusInput,
  type CreateProjectInput,
  type CreateProjectModuleInput,
  type CreateProjectModuleSegmentInput,
  type CreateProjectModuleTaskInput,
  type ListProjectsQuery,
  type ListProjectsResponse,
  type ProjectDetail,
  type SetProjectOvertimeAuthorizationInput,
  type UpdateProjectInput,
  type UpdateProjectModuleDeliveryInput,
  type UpdateProjectModuleInput,
  type UpdateProjectModuleSegmentInput,
  type UpdateProjectModuleTaskInput,
  type UpdateProjectObservationInput,
  type UpdateProjectTeamMemberInput,
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
import { UpdateProjectTeamMemberUseCase } from '../application/use-cases/update-project-team-member.use-case';
import { AddProjectObservationUseCase } from '../application/use-cases/add-project-observation.use-case';
import { UpdateProjectObservationUseCase } from '../application/use-cases/update-project-observation.use-case';
import { DeleteProjectObservationUseCase } from '../application/use-cases/delete-project-observation.use-case';
import { CreateProjectModuleUseCase } from '../application/use-cases/create-project-module.use-case';
import { UpdateProjectModuleUseCase } from '../application/use-cases/update-project-module.use-case';
import { DeleteProjectModuleUseCase } from '../application/use-cases/delete-project-module.use-case';
import { AddProjectModuleDeliveryUseCase } from '../application/use-cases/add-project-module-delivery.use-case';
import { UpdateProjectModuleDeliveryUseCase } from '../application/use-cases/update-project-module-delivery.use-case';
import { RemoveProjectModuleDeliveryUseCase } from '../application/use-cases/remove-project-module-delivery.use-case';
import { CreateProjectModuleSegmentUseCase } from '../application/use-cases/create-project-module-segment.use-case';
import { UpdateProjectModuleSegmentUseCase } from '../application/use-cases/update-project-module-segment.use-case';
import { DeleteProjectModuleSegmentUseCase } from '../application/use-cases/delete-project-module-segment.use-case';
import { CreateProjectModuleTaskUseCase } from '../application/use-cases/create-project-module-task.use-case';
import { UpdateProjectModuleTaskUseCase } from '../application/use-cases/update-project-module-task.use-case';
import { DeleteProjectModuleTaskUseCase } from '../application/use-cases/delete-project-module-task.use-case';

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
    private readonly updateMember: UpdateProjectTeamMemberUseCase,
    private readonly addObservation: AddProjectObservationUseCase,
    private readonly updateObservation: UpdateProjectObservationUseCase,
    private readonly deleteObservation: DeleteProjectObservationUseCase,
    private readonly createModule: CreateProjectModuleUseCase,
    private readonly updateModule: UpdateProjectModuleUseCase,
    private readonly deleteModule: DeleteProjectModuleUseCase,
    private readonly addModuleDelivery: AddProjectModuleDeliveryUseCase,
    private readonly updateModuleDelivery: UpdateProjectModuleDeliveryUseCase,
    private readonly removeModuleDelivery: RemoveProjectModuleDeliveryUseCase,
    private readonly createModuleSegment: CreateProjectModuleSegmentUseCase,
    private readonly updateModuleSegment: UpdateProjectModuleSegmentUseCase,
    private readonly deleteModuleSegment: DeleteProjectModuleSegmentUseCase,
    private readonly createModuleTask: CreateProjectModuleTaskUseCase,
    private readonly updateModuleTask: UpdateProjectModuleTaskUseCase,
    private readonly deleteModuleTask: DeleteProjectModuleTaskUseCase,
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

  /**
   * `projects:read_assigned` también da acceso: un líder de equipo sin
   * `projects:manage` puede asignar/quitar gente, pero solo en equipos que
   * él mismo lidera en este proyecto — lo decide `AssignProjectTeamMemberUseCase`.
   */
  @Post(':id/members')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.CREATED)
  async assignTeamMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignProjectTeamMemberSchema)) body: AssignProjectTeamMemberInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.assignMember.execute({
        projectId: id,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Delete(':id/members/:assignmentId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignTeamMember(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.unassignMember.execute({
        projectId: id,
        assignmentId,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Patch(':id/members/:assignmentId')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateTeamMember(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodValidationPipe(updateProjectTeamMemberSchema)) body: UpdateProjectTeamMemberInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateMember.execute({
        projectId: id,
        assignmentId,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
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

  @Post(':id/modules')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async createProjectModule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createProjectModuleSchema)) body: CreateProjectModuleInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createModule.execute({ projectId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Patch(':id/modules/:moduleId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProjectModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(updateProjectModuleSchema)) body: UpdateProjectModuleInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateModule.execute({ projectId: id, moduleId, data: body, actor: toActorContext(actor) }),
    );
  }

  @Delete(':id/modules/:moduleId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProjectModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.deleteModule.execute({ projectId: id, moduleId, actor: toActorContext(actor) }));
  }

  @Post(':id/modules/:moduleId/deliveries')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async addProjectModuleDelivery(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(addProjectModuleDeliverySchema)) body: AddProjectModuleDeliveryInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.addModuleDelivery.execute({ projectId: id, moduleId, data: body, actor: toActorContext(actor) }),
    );
  }

  /**
   * También `hours:register` (todo colaborador que registra horas): quien
   * participa en el proyecto puede marcar la entrega de su equipo como
   * entregada — solo reasignar el equipo exige `projects:manage`, ver
   * `UpdateProjectModuleDeliveryUseCase`.
   */
  @Patch(':id/modules/:moduleId/deliveries/:deliveryId')
  @RequireAnyPermission('projects:manage', 'hours:register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProjectModuleDelivery(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('deliveryId') deliveryId: string,
    @Body(new ZodValidationPipe(updateProjectModuleDeliverySchema)) body: UpdateProjectModuleDeliveryInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateModuleDelivery.execute({
        projectId: id,
        moduleId,
        deliveryId,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Delete(':id/modules/:moduleId/deliveries/:deliveryId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeProjectModuleDelivery(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.removeModuleDelivery.execute({
        projectId: id,
        moduleId,
        deliveryId,
        actor: toActorContext(actor),
      }),
    );
  }

  @Post(':id/modules/:moduleId/segments')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.CREATED)
  async createProjectModuleSegment(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(createProjectModuleSegmentSchema)) body: CreateProjectModuleSegmentInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createModuleSegment.execute({ projectId: id, moduleId, data: body, actor: toActorContext(actor) }),
    );
  }

  @Patch(':id/modules/:moduleId/segments/:segmentId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProjectModuleSegment(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('segmentId') segmentId: string,
    @Body(new ZodValidationPipe(updateProjectModuleSegmentSchema)) body: UpdateProjectModuleSegmentInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateModuleSegment.execute({
        projectId: id,
        moduleId,
        segmentId,
        data: body,
        actor: toActorContext(actor),
      }),
    );
  }

  @Delete(':id/modules/:moduleId/segments/:segmentId')
  @RequirePermissions('projects:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProjectModuleSegment(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('segmentId') segmentId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.deleteModuleSegment.execute({ projectId: id, moduleId, segmentId, actor: toActorContext(actor) }),
    );
  }

  /** Sin `projects:manage`, solo quien lidera el equipo de la tarea (ver `CreateProjectModuleTaskUseCase`). */
  @Post(':id/modules/:moduleId/tasks')
  @RequireAnyPermission('projects:manage', 'hours:register')
  @HttpCode(HttpStatus.CREATED)
  async createProjectModuleTask(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(createProjectModuleTaskSchema)) body: CreateProjectModuleTaskInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createModuleTask.execute({
        projectId: id,
        moduleId,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  /**
   * También `hours:register`: la persona asignada a la tarea puede cambiar su
   * `status` desde "Mis tareas" — cualquier otro campo, o tocar una tarea que
   * no le pertenece, exige `projects:manage` (ver `UpdateProjectModuleTaskUseCase`).
   */
  @Patch(':id/modules/:moduleId/tasks/:taskId')
  @RequireAnyPermission('projects:manage', 'hours:register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProjectModuleTask(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(updateProjectModuleTaskSchema)) body: UpdateProjectModuleTaskInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateModuleTask.execute({
        projectId: id,
        moduleId,
        taskId,
        data: body,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Delete(':id/modules/:moduleId/tasks/:taskId')
  @RequireAnyPermission('projects:manage', 'hours:register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProjectModuleTask(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.deleteModuleTask.execute({
        projectId: id,
        moduleId,
        taskId,
        actor: toActorContext(actor),
        actorPermissions: actor.permissions,
      }),
    );
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
