import {
  PROJECT_MODULE_TASK_SCOPES,
  type ProjectModuleDeliveryStatus,
  type ProjectModuleProgress,
  type ProjectModuleStage,
  type ProjectModuleTaskScope,
  type ProjectModuleTaskStatus,
  type ProjectProgress,
  type ProjectStatus,
} from '@kora/contracts';

/**
 * Avance real del proyecto — ver `projectProgressSchema` en los contratos. Función pura: la usan la
 * ficha, el listado, el dashboard y `ProjectProgressRecalculator`, para que todas las pantallas
 * muestren el mismo número.
 *
 * Por fase, tareas y entregas son ítems del plan:
 * - Peso de una tarea = sus HH estimadas. Las entregas (no tienen HH) y las tareas antiguas sin HH
 *   pesan el promedio de las tareas que sí tienen en la misma fase; si ninguna tiene, se reparten por
 *   igual las HH de la fase entre tareas y entregas (o pesan 1 si la fase tampoco tiene) — avance
 *   "por cantidad". Una fase con HH pero sin tareas (solo entregas) no reparte: cada entrega pesa 1.
 * - Base = el mayor entre la suma de pesos de sus ítems y las HH estimadas de la fase: las HH de la
 *   fase todavía sin ítems cuentan en la base, pero no en el real ni en el esperado.
 * - Real = peso de las tareas Aprobadas (`done`) y entregas Aprobadas (`approved`) / base. Esperado =
 *   peso de los ítems con fecha límite ≤ hoy / base. Una fase cerrada a mano (`closed`) cuenta 100%
 *   en ambos.
 *
 * El proyecto suma las fases (no promedia porcentajes), así cada fase pesa según su tamaño.
 */

export interface ProgressTaskInput {
  readonly estimatedHours: number | null;
  readonly status: ProjectModuleTaskStatus;
  /** Fecha límite, día calendario (medianoche UTC). */
  readonly date: Date;
  readonly scope: ProjectModuleTaskScope;
}

export interface ProgressDeliveryInput {
  readonly status: ProjectModuleDeliveryStatus;
  /** Fecha estimada, día calendario (medianoche UTC). */
  readonly estimatedDate: Date;
}

export interface ProgressModuleInput {
  readonly estimatedHours: number | null;
  readonly currentStage: ProjectModuleStage;
  readonly tasks: readonly ProgressTaskInput[];
  readonly deliveries: readonly ProgressDeliveryInput[];
}

export interface ProgressProjectInput {
  readonly soldHours: number;
  readonly usedHours: number;
  readonly status: ProjectStatus;
  readonly stopsClock: boolean;
  readonly modules: readonly ProgressModuleInput[];
}

interface ModuleTotals {
  readonly progress: ProjectModuleProgress;
  readonly hasPlan: boolean;
  readonly base: number;
  readonly approved: number;
  readonly due: number;
  readonly taskTotal: number;
  readonly moduleHours: number;
}

const CHILE_TIME_ZONE = 'America/Santiago';

/** "Hoy" como día calendario en hora de Chile (`YYYY-MM-DD`) — mismo criterio que `deadline-note.ts`. */
export function progressToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHILE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const percent = (part: number, whole: number) => Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
const positive = (value: number | null) => (value != null && value > 0 ? value : null);

function moduleTotals(module: ProgressModuleInput, today: string): ModuleTotals {
  const known = module.tasks.flatMap((task) => {
    const hours = positive(task.estimatedHours);
    return hours == null ? [] : [hours];
  });
  const closed = module.currentStage === 'closed';
  const moduleHours = positive(module.estimatedHours) ?? 0;
  const itemCount = module.tasks.length + module.deliveries.length;
  /** Fase con HH pero solo entregas: no hay plan de tareas que repartir, así que las entregas pesan 1
   *  y las HH de la fase quedan en la base — si no, aprobar la única entrega marcaba la fase al 100%. */
  const deliveriesOnly = module.tasks.length === 0 && moduleHours > 0;

  /** Sin HH en ninguna tarea: las HH de la fase se reparten por igual, así el % es "ítems aprobados / ítems". */
  const fallbackWeight =
    known.length > 0
      ? known.reduce((sum, hours) => sum + hours, 0) / known.length
      : moduleHours > 0 && itemCount > 0 && !deliveriesOnly
        ? moduleHours / itemCount
        : 1;
  const weight = (task: ProgressTaskInput) => positive(task.estimatedHours) ?? fallbackWeight;
  const isDue = (date: Date) => date.toISOString().slice(0, 10) <= today;
  const taskTotal = module.tasks.reduce((sum, task) => sum + weight(task), 0) + module.deliveries.length * fallbackWeight;
  const base = Math.max(taskTotal, moduleHours);
  const approved = closed
    ? base
    : module.tasks.filter((task) => task.status === 'done').reduce((sum, task) => sum + weight(task), 0) +
      module.deliveries.filter((delivery) => delivery.status === 'approved').length * fallbackWeight;
  const due = closed
    ? base
    : module.tasks.filter((task) => isDue(task.date)).reduce((sum, task) => sum + weight(task), 0) +
      module.deliveries.filter((delivery) => isDue(delivery.estimatedDate)).length * fallbackWeight;

  const hasPlan = itemCount > 0 || closed;

  const scopes = Object.fromEntries(
    PROJECT_MODULE_TASK_SCOPES.map((scope) => {
      const scopeTasks = module.tasks.filter((task) => task.scope === scope);
      if (scopeTasks.length === 0) return [scope, closed ? 100 : null];
      if (closed) return [scope, 100];
      const total = scopeTasks.reduce((sum, task) => sum + weight(task), 0);
      const done = scopeTasks.filter((task) => task.status === 'done').reduce((sum, task) => sum + weight(task), 0);
      return [scope, percent(done, total)];
    }),
  ) as Record<ProjectModuleTaskScope, number | null>;

  return {
    progress: {
      actual: hasPlan && base > 0 ? percent(approved, base) : null,
      expected: hasPlan && base > 0 ? percent(due, base) : null,
      estimatedByCount: itemCount > 0 && known.length === 0 && !deliveriesOnly,
      scopes,
    },
    hasPlan,
    base,
    approved,
    due,
    taskTotal,
    moduleHours,
  };
}

export function calculateModuleProgress(module: ProgressModuleInput, today: string): ProjectModuleProgress {
  return moduleTotals(module, today).progress;
}

export function calculateProjectProgress(project: ProgressProjectInput, today: string): ProjectProgress {
  const modules = project.modules.map((module) => moduleTotals(module, today));
  const sum = (pick: (totals: ModuleTotals) => number) => modules.reduce((total, totals) => total + pick(totals), 0);

  const base = sum((totals) => totals.base);
  const hasPlan = modules.some((totals) => totals.hasPlan) && base > 0;
  const actual = hasPlan ? percent(sum((totals) => totals.approved), base) : null;
  const expected = hasPlan ? percent(sum((totals) => totals.due), base) : null;

  /** Cobertura por fase, recortada a sus HH: el exceso de tareas en una fase no cubre lo que le falta a otra. */
  const moduleHours = sum((totals) => totals.moduleHours);
  const coveredHours = sum((totals) => Math.min(totals.taskTotal, totals.moduleHours));

  const clockStopped = project.status === 'on_hold' && project.stopsClock;

  return {
    actual,
    expected,
    consumption: project.soldHours > 0 ? Math.round((project.usedHours / project.soldHours) * 100) : null,
    delay: actual != null && expected != null && !clockStopped ? expected - actual : null,
    planCoverage: moduleHours > 0 ? percent(coveredHours, moduleHours) : null,
    estimatedByCount: modules.some((totals) => totals.progress.estimatedByCount),
  };
}
