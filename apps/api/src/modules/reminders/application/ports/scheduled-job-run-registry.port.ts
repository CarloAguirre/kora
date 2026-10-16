/** Candado de "una vez por día" de las tareas programadas — ver `scheduled_job_runs`. */
export interface ScheduledJobRunRegistry {
  /** `true` si esta llamada reclamó la ejecución de `jobName` para `runDate`; `false` si ya la había reclamado otra. */
  tryStart(jobName: string, runDate: string): Promise<boolean>;
  finish(jobName: string, runDate: string, summary: Record<string, unknown>): Promise<void>;
}

export const SCHEDULED_JOB_RUN_REGISTRY = Symbol('ScheduledJobRunRegistry');
