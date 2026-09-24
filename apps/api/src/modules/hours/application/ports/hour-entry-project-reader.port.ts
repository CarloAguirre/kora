import type { ProjectStatus } from '@kora/contracts';

export interface HourEntryProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly leaderUserId: string | null;
  readonly allowsOvertime: boolean;
}

export interface HourEntryProjectApprover {
  readonly id: string;
  readonly fullName: string;
}

export interface HourEntryModuleReference {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
}

export interface HourEntryProjectReader {
  findById(projectId: string): Promise<HourEntryProjectReference | null>;
  findManyByIds(projectIds: readonly string[]): Promise<HourEntryProjectReference[]>;
  /** ¿Es líder del proyecto, o líder del equipo (asignado al proyecto) del que `memberUserId` es miembro activo? */
  isProjectApprover(projectId: string, actorUserId: string, memberUserId: string): Promise<boolean>;
  /** Líder del proyecto + líder del equipo del propio autor — mismo criterio que `isProjectApprover`, pero enumerado. */
  findApprovers(projectId: string, memberUserId: string): Promise<HourEntryProjectApprover[]>;
  /** Módulo ("Fases · Módulos") contra el que se puede imputar una hora — valida que pertenezca al proyecto elegido. */
  findModuleById(moduleId: string): Promise<HourEntryModuleReference | null>;
  /**
   * Persiste `usedHours` en el proyecto — única escritura de este puerto
   * (por lo demás de solo lectura). `usedHours` ya viene calculado por quien
   * llama (`HourEntryRepository.sumApprovedHoursForProject`); este método
   * solo lo guarda. Ver `ApproveHourEntryUseCase`/`CreateHourEntryUseCase`/`UpdateHourEntryUseCase`.
   */
  recalculateUsedHours(projectId: string, usedHours: number): Promise<void>;
}

export const HOUR_ENTRY_PROJECT_READER = Symbol('HourEntryProjectReader');
