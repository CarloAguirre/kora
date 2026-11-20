/**
 * Filas planas que el caso de uso arma en el árbol cliente → proyectos.
 * El lector solo lee; las reglas de armado (qué va dónde, cómo se ordena)
 * viven en el caso de uso para poder probarlas sin base de datos.
 */

export interface ExportPersonRow {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

export interface ExportClientRow {
  readonly id: string;
  readonly companyName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly slug: string;
  readonly status: string;
  readonly website: string | null;
  readonly commercialManagerUserId: string | null;
}

export interface ExportProjectRow {
  readonly id: string;
  readonly clientId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
  readonly status: string;
  readonly phase: string | null;
  readonly salesStage: string | null;
  readonly priority: string | null;
  readonly isInternal: boolean;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly estimatedDeliveryDate: Date | null;
  readonly soldHours: number;
  readonly usedHours: number;
  readonly expectedProgress: number | null;
  readonly actualProgress: number | null;
  readonly leaderUserId: string | null;
  readonly commercialManagerUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExportProjectTeamRow {
  readonly projectId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly leaderUserId: string | null;
  readonly assignedHours: number | null;
}

export interface ExportCollaboratorRow {
  readonly projectId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly userId: string;
  readonly position: string | null;
  readonly activity: string | null;
  readonly assignedHours: number;
  readonly consumedHours: number;
  readonly blockedAt: Date | null;
}

export interface ExportProjectUpdateRow {
  readonly id: string;
  readonly projectId: string;
  readonly type: string;
  readonly title: string | null;
  readonly message: string;
  readonly status: string | null;
  readonly moduleName: string | null;
  readonly date: Date;
  readonly createdAt: Date;
  readonly authorUserId: string;
}

export interface KoraExportRows {
  readonly people: readonly ExportPersonRow[];
  readonly clients: readonly ExportClientRow[];
  readonly projects: readonly ExportProjectRow[];
  readonly projectTeams: readonly ExportProjectTeamRow[];
  readonly collaborators: readonly ExportCollaboratorRow[];
  /** Ya recortadas a `updatesLimit` por proyecto, más recientes primero. */
  readonly updates: readonly ExportProjectUpdateRow[];
}

export interface KoraExportReader {
  /** Clientes y proyectos no eliminados (soft delete), con todo lo que cuelga de ellos. */
  readAll(updatesLimit: number): Promise<KoraExportRows>;
}

export const KORA_EXPORT_READER = Symbol('KoraExportReader');
