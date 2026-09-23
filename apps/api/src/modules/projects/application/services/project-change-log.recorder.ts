import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@kora/core';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';

export interface ProjectChangeLogEntry {
  readonly projectId: string;
  readonly message: string;
  readonly moduleId?: string | null;
}

/**
 * Bitácora automática de cambios de proyecto: cada vez que cambia un dato clave (líder,
 * HH vendidas, equipos, entregas, estado, fechas), queda un registro tipo `cambio_proyecto`
 * — para poder reconstruir después quién estuvo a cargo de qué y cuándo cambió. Es un
 * `project_observation` más, solo que lo escribe el sistema en vez de una persona; nadie
 * puede editarlo ni borrarlo (ver `UpdateProjectObservationUseCase`/`DeleteProjectObservationUseCase`).
 */
@Injectable()
export class ProjectChangeLogRecorder {
  constructor(
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
  ) {}

  async record(
    entries: readonly ProjectChangeLogEntry[],
    actorUserId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    for (const entry of entries) {
      await this.observations.add(
        {
          projectId: entry.projectId,
          type: 'cambio_proyecto',
          title: null,
          message: entry.message,
          status: null,
          moduleId: entry.moduleId ?? null,
          date: now,
          authorUserId: actorUserId,
          now,
        },
        context,
      );
    }
  }
}
