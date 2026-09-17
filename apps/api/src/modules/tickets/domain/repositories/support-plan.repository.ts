import type { TransactionContext } from '@kora/core';
import type { SupportPlan } from '../entities/support-plan.entity';

export interface SupportPlanRecord {
  readonly id: string;
  readonly clientId: string;
  /** `null` en contratos creados desde la v2 — ver el comentario en el schema (`support_plans.project_id`). */
  readonly projectId: string | null;
  readonly planType: 'monthly' | 'bundle' | 'on_demand';
  readonly scope: 'single' | 'consolidated';
  readonly surplusPolicy: 'accumulate' | 'expire' | null;
  readonly status: 'active' | 'ended' | 'cancelled';
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly contractedHours: number;
  /** Valor del plan y de la hora extra — v1: `valor_plan_uf`/`valor_hh_extra_uf`. En la moneda de `currency`, pese al sufijo heredado. */
  readonly planValueUf: number;
  readonly extraHourValueUf: number;
  readonly currency: 'UF' | 'CLP' | 'USD';
  readonly name: string | null;
  readonly leaderUserId: string | null;
  readonly primaryContactId: string | null;
  readonly quotationLink: string | null;
  readonly contractLink: string | null;
  readonly additionalLinks: string | null;
  readonly dueDayOfMonth: number | null;
  readonly targetHoursCritical: number | null;
  readonly targetHoursHigh: number | null;
  readonly targetHoursMedium: number | null;
  readonly targetHoursLow: number | null;
  readonly closedAt: Date | null;
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SupportMonthlyPeriodRecord {
  readonly id: string;
  readonly planId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly contractedHours: number;
  readonly consumedHoursPeriod: number;
  readonly surplusHours: number;
  readonly status: 'active' | 'expired' | 'closed' | 'cancelled';
  /** Saldo de un período anterior reutilizado en este — v1: `hh_saldo_reutilizado`. */
  readonly reusedBalanceHours: number;
  readonly consumedHoursStart: number;
  readonly consumedHoursEnd: number | null;
}

export interface SupportPlanProjectLink {
  readonly planId: string;
  readonly developmentProjectId: string;
}

export interface CreateInitialSupportMonthlyPeriodInput {
  readonly id: string;
  readonly planId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly contractedHours: number;
  readonly surplusPolicy: 'accumulate' | 'expire';
}

/**
 * Planes de soporte. La lectura (`findActiveForProject`/`listPeriodsForPlan`)
 * es la que ya existía para el gate de creación de tickets — ver
 * docs/DECISION-M5-TICKETS.md. Las escrituras y las lecturas por cliente son
 * nuevas: antes el plan de soporte solo se poblaba por el ETL.
 */
export interface SupportPlanRepository {
  /**
   * Busca primero por `project_id` directo (contratos legados, migrados por
   * el ETL contra un proyecto "contenedor" de soporte); si no hay, busca vía
   * `support_plan_projects` (contratos nuevos, que enlazan proyectos de
   * desarrollo terminados). Reemplaza a `findActiveForProject` en el gate de
   * creación de tickets.
   */
  findActiveForProjectOrLinked(projectId: string, context?: TransactionContext): Promise<SupportPlanRecord | null>;
  listPeriodsForPlan(planId: string, context?: TransactionContext): Promise<SupportMonthlyPeriodRecord[]>;
  /**
   * Crea el primer período de un plan `monthly` recién creado. Los períodos
   * siguientes NO se generan automáticamente todavía — a diferencia de la v1
   * (donde el sistema en producción los iba creando mes a mes), la v2 no
   * tiene aún un job recurrente para esto; queda documentado como brecha
   * conocida, no resuelta en silencio (ver el caso de uso de creación).
   */
  createInitialPeriod(input: CreateInitialSupportMonthlyPeriodInput, context?: TransactionContext): Promise<void>;

  findById(id: string, context?: TransactionContext): Promise<SupportPlan | null>;
  listForClient(clientId: string, context?: TransactionContext): Promise<SupportPlanRecord[]>;
  /** Todos los planes `status='active'` — alimenta el panel de Facturación de Soporte. */
  listAllActive(context?: TransactionContext): Promise<SupportPlanRecord[]>;

  save(plan: SupportPlan, context?: TransactionContext): Promise<void>;
  /** Reemplaza los proyectos de desarrollo cubiertos por el plan (borra y vuelve a insertar) — usado al crear y al editar. */
  linkProjects(planId: string, developmentProjectIds: readonly string[], context?: TransactionContext): Promise<void>;
  listLinkedProjectIds(planId: string, context?: TransactionContext): Promise<string[]>;
  /**
   * Ids de proyectos de desarrollo que YA están cubiertos por algún OTRO plan
   * `active` — para rechazar dobles contratos sobre el mismo proyecto.
   * `excludingPlanId` evita que un plan, al editarse, se detecte a sí mismo
   * como conflicto sobre sus propios proyectos ya vinculados.
   */
  findProjectIdsAlreadyLinked(
    developmentProjectIds: readonly string[],
    excludingPlanId?: string,
    context?: TransactionContext,
  ): Promise<string[]>;
}

export const SUPPORT_PLAN_REPOSITORY = Symbol('SupportPlanRepository');
