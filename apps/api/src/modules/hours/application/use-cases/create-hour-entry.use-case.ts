import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import { hourEntryRequiresApproval, isLegacyHourEntryProject, type CreateHourEntryInput, type RoleCode } from '@kora/contracts';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import {
  InvalidDesignatedApproverError,
  ModuleNotInProjectError,
  SegmentNotInModuleError,
  ProjectClosedError,
  ProjectOvertimeNotAllowedError,
  ProjectStoppedError,
  ReferencedModuleNotFoundError,
  InvalidHourEntrySegmentError,
  HourEntrySegmentRequiredError,
  ReferencedProjectNotFoundError,
} from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { splitByDailyCap, type HoursTranche } from '../../domain/services/daily-cap';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateHourEntryCommand {
  readonly data: CreateHourEntryInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Alta de un registro de horas.
 *
 * `admin`/`comercial` no pueden registrar horas propias — igual que en la v1
 * (`rls_can_register_hh`) — así que solo se permite crear a nombre de otra
 * persona, y solo si esa persona sí puede registrar.
 *
 * Lo que una hora normal pase de la jornada de 8h del día se guarda como un
 * segundo registro de horas extra (ver `splitByDailyCap`).
 */
@Injectable()
export class CreateHourEntryUseCase implements UseCase<CreateHourEntryCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_USER_READER) private readonly users: HourEntryUserReader,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateHourEntryCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor, actorRole } = command;
    const ownerId = data.userId ?? actor.userId;

    if (ownerId === actor.userId) {
      if (actorRole === 'admin' || actorRole === 'commercial') {
        return err(new ForbiddenError('Este rol no registra horas propias.', 'HOUR_ENTRY_ROLE_CANNOT_REGISTER'));
      }
    } else if (actorRole !== 'admin' && actorRole !== 'pmo' && actorRole !== 'leader') {
      return err(new ForbiddenError('No puedes registrar horas a nombre de otra persona.', 'HOUR_ENTRY_CANNOT_REGISTER_FOR_OTHERS'));
    }

    const owner = await this.users.findById(ownerId);
    if (!owner) return err(new ForbiddenError('El usuario indicado no existe.', 'HOUR_ENTRY_OWNER_NOT_FOUND'));
    // Un usuario dado de baja administrativamente no debe recibir registros nuevos,
    // ni siquiera si un líder/PMO intenta crearlos a su nombre mediante la API.
    // Sus registros existentes siguen disponibles para consulta y corrección histórica.
    if (owner.status === 'disabled') {
      return err(new ForbiddenError('El usuario indicado está deshabilitado.', 'HOUR_ENTRY_OWNER_DISABLED'));
    }

    let projectStageAtEntry: string | null = null;
    let projectAllowsOvertime = false;
    let legacyProject = false;
    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
      if (project.status === 'on_hold') return err(new ProjectStoppedError());
      if (project.status === 'finished' || project.status === 'cancelled') return err(new ProjectClosedError());
      legacyProject = isLegacyHourEntryProject(project);
      if (legacyProject && (data.moduleId || data.segmentId || data.taskId)) {
        return err(new ForbiddenError(
          'Proyectos anteriores al 11-11-2026: registra HH sin seleccionar fase, bloque ni tarea.',
          'HOUR_ENTRY_LEGACY_PLAN_DISABLED',
        ));
      }
      if (data.isOvertime && !project.allowsOvertime) return err(new ProjectOvertimeNotAllowedError());
      projectAllowsOvertime = project.allowsOvertime;
      projectStageAtEntry = project.status;
    }

    if (data.moduleId) {
      const module = await this.projects.findModuleById(data.moduleId);
      if (!module) return err(new ReferencedModuleNotFoundError(data.moduleId));
      if (module.projectId !== data.projectId) return err(new ModuleNotInProjectError());
      const segmentId = data.segmentId;
      if (segmentId && !module.segments.some((segment) => segment.id === segmentId)) {
        return err(new SegmentNotInModuleError());
      }
      if (data.taskId && !module.tasks?.some((task) =>
        task.id === data.taskId && !task.cancelledAt &&
        task.assigneeUserId === ownerId && task.segmentId === (segmentId ?? null))) {
        return err(new ForbiddenError('Selecciona una tarea activa, asignada al autor y al bloque elegido.', 'HOUR_ENTRY_TASK_INVALID'));
      }
    }
    if (data.taskId && !data.moduleId) {
      return err(new ForbiddenError('Selecciona una fase antes de elegir la tarea.', 'HOUR_ENTRY_TASK_INVALID'));
    }

    if (data.projectId && data.assignment === 'Proyecto' && !data.moduleId && !legacyProject &&
      await this.projects.hasAttributableWorkBlocks(data.projectId, ownerId)) {
      return err(new HourEntrySegmentRequiredError());
    }
    if (data.segmentId && !data.moduleId) {
      return err(new InvalidHourEntrySegmentError('Selecciona la fase antes de elegir un bloque.'));
    }
    if (data.moduleId) {
      const segments = await this.projects.findSegmentsForModule(data.moduleId);
      if (data.segmentId) {
        const selected = segments.find((segment) =>
          segment.id === data.segmentId && segment.projectId === data.projectId);
        if (!selected || !await this.projects.isUserOnSegmentTeam(
          selected.projectId, selected.teamId, ownerId,
        )) return err(new InvalidHourEntrySegmentError());
      } else if (data.assignment === 'Proyecto' && (await Promise.all(
        segments.map((segment) => this.projects.isUserOnSegmentTeam(
          segment.projectId, segment.teamId, ownerId,
        )),
      )).some(Boolean)) {
        return err(new HourEntrySegmentRequiredError());
      }
    }

    if (data.designatedApproverUserId) {
      const approver = await this.users.findById(data.designatedApproverUserId);
      if (!approver || approver.role !== 'leader' || approver.status !== 'active') {
        return err(new InvalidDesignatedApproverError());
      }
    }

    const date = new Date(data.date);
    // Las marcadas a mano como extra van completas como extra (con la
    // autorización del proyecto, arriba). En las normales, lo que pase de la
    // jornada de 8h del día queda como un segundo registro de horas extra.
    // Si es una imputación de proyecto, también exige su autorización.
    // Horas fuera de rango no se dividen: las rechaza `HourEntry.create`.
    const tranches: HoursTranche[] =
      data.isOvertime || !(data.hours > 0) || data.hours > 24
        ? [{ hours: data.hours, isOvertime: data.isOvertime }]
        : splitByDailyCap(data.hours, await this.entries.sumRegularHoursForUserAndDate(ownerId, date));

    // El excedente automático también es hora extra: nunca se crea sin permiso
    // del proyecto, aunque el usuario no haya marcado el switch manualmente.
    if (data.projectId && !projectAllowsOvertime && tranches.some((t) => t.isOvertime)) {
      return err(new ProjectOvertimeNotAllowedError());
    }

    const now = this.clock.now();
    const entries: HourEntry[] = [];
    for (const tranche of tranches) {
      const created = HourEntry.create({
        id: this.ids.generate(),
        userId: ownerId,
        projectId: data.projectId ?? null,
        moduleId: data.moduleId ?? null,
        segmentId: data.moduleId ? (data.segmentId ?? null) : null,
        taskId: data.moduleId ? (data.taskId ?? null) : null,
        assignment: data.assignment,
        category: data.category,
        description: data.description,
        hours: tranche.hours,
        date,
        isOvertime: tranche.isOvertime,
        projectStageAtEntry,
        designatedApproverUserId: data.designatedApproverUserId ?? null,
        hasBlocker: data.hasBlocker,
        blockerDescription: data.blockerDescription ?? null,
        ownerRequiresApproval: hourEntryRequiresApproval(owner.role, tranche.isOvertime),
        now,
      });
      if (created.isErr()) return err(created.error);
      entries.push(created.value);
    }

    for (const entry of entries) await this.entries.save(entry);

    if (data.projectId && entries.some((entry) => entry.status === 'approved')) {
      const usedHours = await this.entries.sumApprovedHoursForProject(data.projectId);
      await this.projects.recalculateUsedHours(data.projectId, usedHours);
    }

    for (const entry of entries) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'create',
        entityType: 'hour_entry',
        entityId: entry.id,
        metadata: { ownerId, assignment: data.assignment, hours: entry.hours, isOvertime: entry.isOvertime, status: entry.status },
      });
    }

    return ok({ id: entries[0]!.id });
  }
}
