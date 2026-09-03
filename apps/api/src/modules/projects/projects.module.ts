import { Module } from '@nestjs/common';
import { ProjectsController } from './presentation/projects.controller';
import { TeamsModule } from '../teams/teams.module';

import { CreateProjectUseCase } from './application/use-cases/create-project.use-case';
import { UpdateProjectUseCase } from './application/use-cases/update-project.use-case';
import { ListProjectsUseCase } from './application/use-cases/list-projects.use-case';
import { GetProjectUseCase } from './application/use-cases/get-project.use-case';
import { ChangeProjectStatusUseCase } from './application/use-cases/change-project-status.use-case';
import { DeleteProjectUseCase } from './application/use-cases/delete-project.use-case';
import { AssignProjectTeamMemberUseCase } from './application/use-cases/assign-project-team-member.use-case';
import { UnassignProjectTeamMemberUseCase } from './application/use-cases/unassign-project-team-member.use-case';
import { AddProjectObservationUseCase } from './application/use-cases/add-project-observation.use-case';

import { PROJECT_REPOSITORY } from './domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY } from './domain/repositories/project-team.repository';
import { PROJECT_TEAM_MEMBER_REPOSITORY } from './domain/repositories/project-team-member.repository';
import { PROJECT_OBSERVATION_REPOSITORY } from './domain/repositories/project-observation.repository';
import { PROJECT_USER_READER } from './application/ports/project-user-reader.port';
import { PROJECT_CLIENT_READER } from './application/ports/project-client-reader.port';
import { PROJECT_CONTACT_READER } from './application/ports/project-contact-reader.port';
import { PROJECT_TEAM_MEMBER_VALIDATOR } from './application/ports/project-team-member-validator.port';

import { DrizzleProjectRepository } from './infrastructure/persistence/drizzle-project.repository';
import { DrizzleProjectTeamRepository } from './infrastructure/persistence/drizzle-project-team.repository';
import { DrizzleProjectTeamMemberRepository } from './infrastructure/persistence/drizzle-project-team-member.repository';
import { DrizzleProjectObservationRepository } from './infrastructure/persistence/drizzle-project-observation.repository';
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
    DeleteProjectUseCase,
    AssignProjectTeamMemberUseCase,
    UnassignProjectTeamMemberUseCase,
    AddProjectObservationUseCase,

    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },
    { provide: PROJECT_TEAM_REPOSITORY, useClass: DrizzleProjectTeamRepository },
    { provide: PROJECT_TEAM_MEMBER_REPOSITORY, useClass: DrizzleProjectTeamMemberRepository },
    { provide: PROJECT_OBSERVATION_REPOSITORY, useClass: DrizzleProjectObservationRepository },
    { provide: PROJECT_USER_READER, useClass: DrizzleProjectUserReader },
    { provide: PROJECT_CLIENT_READER, useClass: DrizzleProjectClientReader },
    { provide: PROJECT_CONTACT_READER, useClass: DrizzleProjectContactReader },
    { provide: PROJECT_TEAM_MEMBER_VALIDATOR, useClass: DrizzleProjectTeamMemberValidator },
  ],
  exports: [PROJECT_REPOSITORY],
})
export class ProjectsModule {}
