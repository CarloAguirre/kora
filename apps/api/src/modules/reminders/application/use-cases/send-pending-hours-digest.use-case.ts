import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ok, type Logger, type Result } from '@kora/core';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
  type PendingHoursDigestItem,
} from '../../../../shared/application/ports/notification.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import { chileDate, daysBetween } from '../chile-calendar';
import {
  HOUR_REMINDER_READER,
  type HourReminderReader,
  type PendingHourEntryRow,
} from '../ports/hour-reminder-reader.port';

export interface SendPendingHoursDigestCommand {
  /** "Hoy" en Chile (`YYYY-MM-DD`): base para "N días pendiente". */
  readonly today: string;
  readonly dryRun: boolean;
  /** Procesa solo a este aprobador (por correo). */
  readonly onlyEmail?: string | undefined;
}

export interface PendingHoursDigestPreview {
  readonly email: string;
  readonly items: number;
  readonly hours: number;
}

export interface SendPendingHoursDigestResult {
  readonly today: string;
  readonly dryRun: boolean;
  readonly skippedHoliday: boolean;
  readonly pendingEntries: number;
  /** Pendientes sin ningún aprobador activo distinto del dueño (las decide admin/PMO desde la cola general). */
  readonly entriesWithoutApprover: number;
  readonly approvers: number;
  readonly sent: number;
  readonly failed: number;
  readonly preview?: readonly PendingHoursDigestPreview[];
}

/**
 * Resumen diario de las 08:00 para cada aprobador con horas esperando su
 * decisión (reemplaza `notify-pending-hh-leaders` de la v1).
 *
 * El aprobador se resuelve con las mismas reglas que deciden quién puede
 * aprobar (ver docs/DECISION-M4-HORAS.md), no con una copia de ellas:
 * - Con proyecto (incluidas las HH de tickets): `findApproverCandidatesForMember`
 *   — el líder del equipo del autor en ese proyecto o, si no hay, el líder del proyecto.
 * - Sin proyecto: el aprobador designado; si no hay, quien lidera al autor.
 *
 * Como en la v1, nadie recibe sus propias horas, y admin/PMO no reciben el
 * resumen solo por serlo (aunque puedan aprobar todo): ven la cola general.
 */
@Injectable()
export class SendPendingHoursDigestUseCase
  implements UseCase<SendPendingHoursDigestCommand, SendPendingHoursDigestResult, never>
{
  constructor(
    @Inject(HOUR_REMINDER_READER) private readonly reader: HourReminderReader,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(command: SendPendingHoursDigestCommand): Promise<Result<SendPendingHoursDigestResult, never>> {
    const { today, dryRun } = command;
    const base = { today, dryRun, pendingEntries: 0, entriesWithoutApprover: 0, approvers: 0, sent: 0, failed: 0 };

    if ((await this.reader.findHolidays(today, today)).includes(today)) {
      return ok({ ...base, skippedHoliday: true });
    }

    const pending = await this.reader.findPendingHourEntries();
    const itemsByApprover = new Map<string, PendingHoursDigestItem[]>();
    const approverCache = new Map<string, string[]>();
    let entriesWithoutApprover = 0;

    for (const entry of pending) {
      const approverIds = (await this.resolveApprovers(entry, approverCache)).filter((id) => id !== entry.ownerUserId);
      if (approverIds.length === 0) {
        entriesWithoutApprover += 1;
        continue;
      }
      const item = toDigestItem(entry, today);
      for (const approverId of approverIds) {
        const items = itemsByApprover.get(approverId) ?? [];
        items.push(item);
        itemsByApprover.set(approverId, items);
      }
    }

    const onlyEmail = command.onlyEmail?.trim().toLowerCase();
    const approvers = (await this.reader.findActiveUsersByIds([...itemsByApprover.keys()])).filter(
      (approver) => !onlyEmail || approver.email.toLowerCase() === onlyEmail,
    );

    const preview: PendingHoursDigestPreview[] = [];
    let sent = 0;
    let failed = 0;

    for (const approver of approvers) {
      const items = itemsByApprover.get(approver.userId)!;

      if (dryRun) {
        preview.push({ email: approver.email, items: items.length, hours: items.reduce((sum, item) => sum + item.hours, 0) });
        continue;
      }

      try {
        await this.notifications.sendPendingHoursDigest({
          recipientEmail: approver.email,
          recipientFirstName: approver.firstName,
          items,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('[recordatorios] No se pudo enviar el resumen de horas por aprobar', {
          userId: approver.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return ok({
      ...base,
      skippedHoliday: false,
      pendingEntries: pending.length,
      entriesWithoutApprover,
      approvers: approvers.length,
      sent,
      failed,
      ...(dryRun ? { preview } : {}),
    });
  }

  private async resolveApprovers(entry: PendingHourEntryRow, cache: Map<string, string[]>): Promise<string[]> {
    if (!entry.projectId && entry.designatedApproverUserId) return [entry.designatedApproverUserId];

    const key = `${entry.projectId ?? '-'}:${entry.ownerUserId}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const ids = entry.projectId
      ? (await this.projects.findApproverCandidatesForMember(entry.projectId, entry.ownerUserId)).map((a) => a.id)
      : await this.reader.findTeamLeaderIdsForMember(entry.ownerUserId);
    cache.set(key, ids);
    return ids;
  }
}

function toDigestItem(entry: PendingHourEntryRow, today: string): PendingHoursDigestItem {
  const common = {
    ownerFullName: entry.ownerFullName,
    date: entry.date,
    hours: entry.hours,
    daysPending: Math.max(0, daysBetween(chileDate(entry.createdAt), today)),
  };

  if (entry.ticketCode) {
    return { ...common, kind: 'ticket', label: `${entry.ticketCode} · ${entry.projectName ?? 'Soporte'}` };
  }
  if (entry.projectId) {
    return { ...common, kind: 'project', label: entry.projectName ?? 'Proyecto' };
  }
  // Sin proyecto: lo que dice es para qué son las horas (Vacaciones, Licencia médica, Capacitación...).
  return { ...common, kind: 'no_project', label: entry.assignment?.trim() || 'Sin asignación' };
}
