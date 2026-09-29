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
  /** Registro de activación (Hito 0) — queda como el registro editable de la fecha del Hito 0 en la bitácora. */
  readonly isHito0?: boolean;
  /** Entrega/tarea a la que se refiere el cambio — arma su historial (ver `project_observations.delivery_id`). */
  readonly deliveryId?: string | null;
  readonly taskId?: string | null;
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
          isHito0: entry.isHito0 ?? false,
          deliveryId: entry.deliveryId ?? null,
          taskId: entry.taskId ?? null,
          authorUserId: actorUserId,
          now,
        },
        context,
      );
    }
  }
}
