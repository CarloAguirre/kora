import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock, type TransactionContext } from '@kora/core';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { calculateProjectProgress, progressToday } from './project-progress';

/**
 * Guarda el avance real recién calculado en `projects.actual_progress` — un caché para que el listado
 * pueda ordenar por avance en la base. Lo llaman los casos de uso que cambian fases o tareas, dentro
 * de su misma transacción. Las pantallas no leen este caché: recalculan con `calculateProjectProgress`.
 */
@Injectable()
export class ProjectProgressRecalculator {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async recalculate(projectId: string, context?: TransactionContext): Promise<void> {
    const project = await this.projects.findById(projectId, context);
    if (!project) return;

    const snapshot = project.toSnapshot();
    const now = this.clock.now();
    const modules = (await this.modules.listProgressInputsForProjects([projectId], context)).get(projectId) ?? [];
    const progress = calculateProjectProgress(
      {
        soldHours: Number(snapshot.soldHours),
        usedHours: Number(snapshot.usedHours),
        status: snapshot.status,
        stopsClock: snapshot.stopsClock,
        modules,
      },
      progressToday(now),
    );

    if (project.recordActualProgress(progress.actual, now)) await this.projects.save(project, context);
  }
}
