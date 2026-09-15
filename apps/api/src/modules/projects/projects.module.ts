import { Module } from '@nestjs/common';
import { ProjectsController } from './presentation/projects.controller';
import { TeamsModule } from '../teams/teams.module';

import { CreateProjectUseCase } from './application/use-cases/create-project.use-case';
import { UpdateProjectUseCase } from './application/use-cases/update-project.use-case';
import { ListProjectsUseCase } from './application/use-cases/list-projects.use-case';
import { GetProjectUseCase } from './application/use-cases/get-project.use-case';
import { ChangeProjectStatusUseCase } from './application/use-cases/change-project-status.use-case';
import { SetProjectOvertimeAuthorizationUseCase } from './application/use-cases/set-project-overtime-authorization.use-case';
import { DeleteProjectUseCase } from './application/use-cases/delete-project.use-case';
import { AssignProjectTeamMemberUseCase } from './application/use-cases/assign-project-team-member.use-case';
import { UnassignProjectTeamMemberUseCase } from './application/use-cases/unassign-project-team-member.use-case';
import { UpdateProjectTeamMemberUseCase } from './application/use-cases/update-project-team-member.use-case';
import { AddProjectObservationUseCase } from './application/use-cases/add-project-observation.use-case';
import { UpdateProjectObservationUseCase } from './application/use-cases/update-project-observation.use-case';
import { DeleteProjectObservationUseCase } from './application/use-cases/delete-project-observation.use-case';
import { CreateProjectModuleUseCase } from './application/use-cases/create-project-module.use-case';
import { UpdateProjectModuleUseCase } from './application/use-cases/update-project-module.use-case';
import { DeleteProjectModuleUseCase } from './application/use-cases/delete-project-module.use-case';
import { AddProjectModuleDeliveryUseCase } from './application/use-cases/add-project-module-delivery.use-case';
import { UpdateProjectModuleDeliveryUseCase } from './application/use-cases/update-project-module-delivery.use-case';
import { RemoveProjectModuleDeliveryUseCase } from './application/use-cases/remove-project-module-delivery.use-case';
import { CreateProjectModuleSegmentUseCase } from './application/use-cases/create-project-module-segment.use-case';
import { UpdateProjectModuleSegmentUseCase } from './application/use-cases/update-project-module-segment.use-case';
import { DeleteProjectModuleSegmentUseCase } from './application/use-cases/delete-project-module-segment.use-case';
import { CreateProjectModuleTaskUseCase } from './application/use-cases/create-project-module-task.use-case';
import { UpdateProjectModuleTaskUseCase } from './application/use-cases/update-project-module-task.use-case';
import { DeleteProjectModuleTaskUseCase } from './application/use-cases/delete-project-module-task.use-case';

import { PROJECT_REPOSITORY } from './domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY } from './domain/repositories/project-team.repository';
import { PROJECT_TEAM_MEMBER_REPOSITORY } from './domain/repositories/project-team-member.repository';
import { PROJECT_OBSERVATION_REPOSITORY } from './domain/repositories/project-observation.repository';
import { PROJECT_MODULE_REPOSITORY } from './domain/repositories/project-module.repository';
import { PROJECT_USER_READER } from './application/ports/project-user-reader.port';
import { PROJECT_CLIENT_READER } from './application/ports/project-client-reader.port';
import { PROJECT_CONTACT_READER } from './application/ports/project-contact-reader.port';
import { PROJECT_TEAM_MEMBER_VALIDATOR } from './application/ports/project-team-member-validator.port';

import { DrizzleProjectRepository } from './infrastructure/persistence/drizzle-project.repository';
import { DrizzleProjectTeamRepository } from './infrastructure/persistence/drizzle-project-team.repository';
import { DrizzleProjectTeamMemberRepository } from './infrastructure/persistence/drizzle-project-team-member.repository';
import { DrizzleProjectObservationRepository } from './infrastructure/persistence/drizzle-project-observation.repository';
import { DrizzleProjectModuleRepository } from './infrastructure/persistence/drizzle-project-module.repository';
import { DrizzleProjectUserReader } from './infrastructure/services/drizzle-project-user-reader';
import { DrizzleProjectClientReader } from './infrastructure/services/drizzle-project-client-reader';
import { DrizzleProjectContactReader } from './infrastructure/services/drizzle-project-contact-reader';
import { DrizzleProjectTeamMemberValidator } from './infrastructure/services/drizzle-project-team-member-validator';

/**
 * Composición del módulo de proyectos.
 *
 * Exporta `PROJECT_REPOSITORY`: los módulos de clientes (cascada de
 * desactivación) e identidad (perfil de líder) lo consumirán para reemplazar
 * sus adaptadores nulos, cerrando los dos cabos que quedaron pendientes desde
 * M1 y desde el módulo de usuario original.
 */
@Module({
  imports: [TeamsModule],
  controllers: [ProjectsController],
  providers: [
    CreateProjectUseCase,
    UpdateProjectUseCase,
    ListProjectsUseCase,
    GetProjectUseCase,
    ChangeProjectStatusUseCase,
    SetProjectOvertimeAuthorizationUseCase,
    DeleteProjectUseCase,
    AssignProjectTeamMemberUseCase,
    UnassignProjectTeamMemberUseCase,
    UpdateProjectTeamMemberUseCase,
    AddProjectObservationUseCase,
    UpdateProjectObservationUseCase,
    DeleteProjectObservationUseCase,
    CreateProjectModuleUseCase,
    UpdateProjectModuleUseCase,
    DeleteProjectModuleUseCase,
    AddProjectModuleDeliveryUseCase,
    UpdateProjectModuleDeliveryUseCase,
    RemoveProjectModuleDeliveryUseCase,
    CreateProjectModuleSegmentUseCase,
    UpdateProjectModuleSegmentUseCase,
    DeleteProjectModuleSegmentUseCase,
    CreateProjectModuleTaskUseCase,
    UpdateProjectModuleTaskUseCase,
    DeleteProjectModuleTaskUseCase,

    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },
    { provide: PROJECT_TEAM_REPOSITORY, useClass: DrizzleProjectTeamRepository },
    { provide: PROJECT_TEAM_MEMBER_REPOSITORY, useClass: DrizzleProjectTeamMemberRepository },
    { provide: PROJECT_OBSERVATION_REPOSITORY, useClass: DrizzleProjectObservationRepository },
    { provide: PROJECT_MODULE_REPOSITORY, useClass: DrizzleProjectModuleRepository },
    { provide: PROJECT_USER_READER, useClass: DrizzleProjectUserReader },
    { provide: PROJECT_CLIENT_READER, useClass: DrizzleProjectClientReader },
    { provide: PROJECT_CONTACT_READER, useClass: DrizzleProjectContactReader },
    { provide: PROJECT_TEAM_MEMBER_VALIDATOR, useClass: DrizzleProjectTeamMemberValidator },
  ],
  exports: [PROJECT_REPOSITORY, PROJECT_MODULE_REPOSITORY],
})
export class ProjectsModule {}
