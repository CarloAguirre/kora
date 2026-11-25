import { z } from 'zod';

/**
 * Volcado completo de Kora en un único JSON: cliente → proyectos → personas
 * (responsable, líderes, colaboradores) y últimas actualizaciones de la
 * bitácora de cada proyecto. Pensado para integraciones y reportes externos,
 * no para pintar pantallas: por eso trae todo de una vez y sin paginar.
 */

export const KORA_EXPORT_DEFAULT_UPDATES = 5;
export const KORA_EXPORT_MAX_UPDATES = 50;

export const koraExportQuerySchema = z.object({
  /** Cuántas entradas de bitácora por proyecto (las más recientes primero). */
  updatesLimit: z.coerce
    .number()
    .int()
    .min(0)
    .max(KORA_EXPORT_MAX_UPDATES)
    .default(KORA_EXPORT_DEFAULT_UPDATES),
});

export type KoraExportQuery = z.infer<typeof koraExportQuerySchema>;

export interface KoraExportPerson {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

/** Líder de un equipo asignado al proyecto (`project_teams`). */
export interface KoraExportTeamLeader {
  readonly teamId: string;
  readonly teamName: string;
  /** Null si el equipo está asignado pero sin líder definido para este proyecto. */
  readonly leader: KoraExportPerson | null;
  readonly assignedHours: number | null;
}

/** Persona asignada a trabajar en el proyecto (`project_team_members`). */
export interface KoraExportCollaborator extends KoraExportPerson {
  readonly teamId: string;
  readonly teamName: string;
  /** Cargo dentro del equipo (no el rol de acceso). */
  readonly position: string | null;
  readonly activity: string | null;
  readonly assignedHours: number;
  readonly consumedHours: number;
  readonly blocked: boolean;
}

/** Entrada de la bitácora del proyecto (`project_observations`). */
export interface KoraExportProjectUpdate {
  readonly id: string;
  /** hito | incidente | compromiso | atencion | observacion | cambio_proyecto */
  readonly type: string;
  readonly title: string | null;
  readonly message: string;
  readonly status: string | null;
  readonly moduleName: string | null;
  /** Fecha del hecho (YYYY-MM-DD). */
  readonly date: string;
  /** Cuándo se registró en Kora (ISO 8601). */
  readonly createdAt: string;
  readonly author: KoraExportPerson | null;
}

export interface KoraExportProject {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
  readonly status: string;
  readonly phase: string | null;
  readonly salesStage: string | null;
  readonly priority: string | null;
  readonly isInternal: boolean;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly estimatedDeliveryDate: string | null;
  readonly soldHours: number;
  readonly usedHours: number;
  readonly expectedProgress: number | null;
  readonly actualProgress: number | null;
  /** "Responsable Kabeli" — el líder PM del proyecto. */
  readonly responsible: KoraExportPerson | null;
  readonly commercialManager: KoraExportPerson | null;
  readonly leaders: readonly KoraExportTeamLeader[];
  readonly collaborators: readonly KoraExportCollaborator[];
  readonly latestUpdates: readonly KoraExportProjectUpdate[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KoraExportClient {
  readonly id: string;
  readonly companyName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly slug: string;
  readonly status: string;
  readonly website: string | null;
  readonly commercialManager: KoraExportPerson | null;
  readonly projects: readonly KoraExportProject[];
}

export interface KoraExport {
  readonly generatedAt: string;
  readonly updatesLimit: number;
  readonly totals: {
    readonly clients: number;
    readonly projects: number;
  };
  readonly clients: readonly KoraExportClient[];
  /** Proyectos sin cliente asociado (p.ej. internos o con el cliente eliminado). */
  readonly projectsWithoutClient: readonly KoraExportProject[];
}
