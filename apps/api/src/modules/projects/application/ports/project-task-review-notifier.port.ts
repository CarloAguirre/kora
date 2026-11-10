/** Evento de una tarea operativa ya persistida, listo para notificar
 * sin acoplar el caso de uso de Proyectos al proveedor de correo o inbox. */
export interface ProjectTaskReviewEvent {
  readonly kind: 'review_requested' | 'returned';
  readonly projectId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly taskName: string;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly projectLeaderUserId: string | null;
  readonly actorUserId: string;
  readonly reason: string | null;
}

export interface ProjectTaskReviewNotifierPort {
  publish(event: ProjectTaskReviewEvent): Promise<void>;
}

export const PROJECT_TASK_REVIEW_NOTIFIER = Symbol('ProjectTaskReviewNotifier');
