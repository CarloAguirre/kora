/** Lectura mínima de usuarios que necesita el módulo de proyectos: nombres de líder, desarrollador y responsable comercial. */
export interface ProjectUserReference {
  readonly id: string;
  readonly fullName: string;
}

export interface ProjectNotificationRecipient {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

export interface ProjectUserReader {
  findById(userId: string): Promise<ProjectUserReference | null>;
  findManyByIds(userIds: readonly string[]): Promise<ProjectUserReference[]>;
  /** Gerencia + líder PMO (roles `admin`/`pmo`, activos) — destinatarios de las alertas de facturación/Hito 0. */
  findActiveAdminTierRecipients(): Promise<ProjectNotificationRecipient[]>;
  /** Gerencia/PMO + rol Finanzas (activos) — destinatarios del aviso "tramo por facturar". */
  findActiveBillingRecipients(): Promise<ProjectNotificationRecipient[]>;
}

export const PROJECT_USER_READER = Symbol('ProjectUserReader');
