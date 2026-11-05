import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import {
  and,
  asc,
  count,
  eq,
  sql,
  hourEntries,
  inArray,
  projectModuleDeliveries,
  projectModuleSegmentMembers,
  projectModuleSegments,
  projectModuleTasks,
  projectTeams,
  projectRoadmapReferenceExclusions,
  projectModules,
  projects,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateProjectModuleDeliveryInput,
  CreateProjectModuleInput,
  CreateProjectModuleSegmentInput,
  CreateProjectModuleTaskInput,
  DeliveryAssignedToUserRecord,
  ProjectModuleDeliveryRecord,
  ProjectModuleProgressInputRecord,
  ProjectModuleRecord,
  ProjectModuleRepository,
  ProjectModuleSegmentMemberInput,
  ProjectModuleSegmentMemberRecord,
  ProjectModuleTaskRecord,
  TaskAssignedToUserRecord,
  UpdateProjectModuleDeliveryInput,
  UpdateProjectModuleInput,
  UpdateProjectModuleSegmentInput,
  UpdateProjectModuleTaskInput,
} from '../../domain/repositories/project-module.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/** Tramo al que apunta una tarea/entrega — alias porque las consultas de tramos ya usan la tabla. */
const linkedSegments = alias(projectModuleSegments, 'linked_segments');
const completionUsers = alias(users, 'completion_users');
const dashboardApprovalUsers = alias(users, 'dashboard_approval_users');

@Injectable()
export class DrizzleProjectModuleRepository implements ProjectModuleRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(projectId: string, context?: TransactionContext): Promise<ProjectModuleRecord[]> {
    const db = resolveDb(this.database, context);

    const [moduleRows, deliveryRows, segmentRows, taskRows, blockerRows] = await Promise.all([
      // Fases en orden cronológico ("Fase 1, 2…" del Roadmap): por fecha de inicio estimada — las sin
      // fecha al final (ASC deja los null últimos en Postgres) — y, en empate, por orden de creación.
      db
        .select()
        .from(projectModules)
        .where(eq(projectModules.projectId, projectId))
        .orderBy(asc(projectModules.estimatedStartDate), asc(projectModules.createdAt)),
      db
        .select({
          id: projectModuleDeliveries.id,
          moduleId: projectModuleDeliveries.moduleId,
          teamId: projectModuleDeliveries.teamId,
          teamName: teams.name,
          name: projectModuleDeliveries.name,
          description: projectModuleDeliveries.description,
          assigneeUserId: projectModuleDeliveries.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          segmentId: projectModuleDeliveries.segmentId,
          segmentName: linkedSegments.name,
          estimatedDate: projectModuleDeliveries.estimatedDate,
          status: projectModuleDeliveries.status,
          rejectionReason: projectModuleDeliveries.rejectionReason,
          completedOn: projectModuleDeliveries.completedOn,
          completedByUserId: projectModuleDeliveries.completedByUserId,
          completionFirstName: completionUsers.firstName,
          completionLastName: completionUsers.lastName,
          completionComment: projectModuleDeliveries.completionComment,
          createdAt: projectModuleDeliveries.createdAt,
        })
        .from(projectModuleDeliveries)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
        .leftJoin(teams, eq(teams.id, projectModuleDeliveries.teamId))
        .leftJoin(users, eq(users.id, projectModuleDeliveries.assigneeUserId))
        .leftJoin(completionUsers, eq(completionUsers.id, projectModuleDeliveries.completedByUserId))
        .leftJoin(linkedSegments, eq(linkedSegments.id, projectModuleDeliveries.segmentId))
        .where(eq(projectModules.projectId, projectId))
        .orderBy(asc(projectModuleDeliveries.estimatedDate)),
      db
        .select({
          id: projectModuleSegments.id,
          closedAt: projectModuleSegments.closedAt,
          moduleId: projectModuleSegments.moduleId,
          teamId: projectModuleSegments.teamId,
          teamName: teams.name,
          name: projectModuleSegments.name,
          startDate: projectModuleSegments.startDate,
          endDate: projectModuleSegments.endDate,
          estimatedHours: projectModuleSegments.estimatedHours,
        })
        .from(projectModuleSegments)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleSegments.moduleId))
        .innerJoin(teams, eq(teams.id, projectModuleSegments.teamId))
        .where(eq(projectModules.projectId, projectId))
        .orderBy(asc(projectModuleSegments.startDate)),
      db
        .select({
          id: projectModuleTasks.id,
          moduleId: projectModuleTasks.moduleId,
          teamId: projectModuleTasks.teamId,
          teamName: teams.name,
          assigneeUserId: projectModuleTasks.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          segmentId: projectModuleTasks.segmentId,
          segmentName: linkedSegments.name,
          name: projectModuleTasks.name,
          description: projectModuleTasks.description,
          startDate: projectModuleTasks.startDate,
          date: projectModuleTasks.date,
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          scope: projectModuleTasks.scope,
          completedAt: projectModuleTasks.completedAt,
          cancelledAt: projectModuleTasks.cancelledAt,
          rejectionReason: projectModuleTasks.rejectionReason,
        })
        .from(projectModuleTasks)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
        .leftJoin(teams, eq(teams.id, projectModuleTasks.teamId))
        .leftJoin(users, eq(users.id, projectModuleTasks.assigneeUserId))
        .leftJoin(linkedSegments, eq(linkedSegments.id, projectModuleTasks.segmentId))
        .where(eq(projectModules.projectId, projectId))
        .orderBy(asc(projectModuleTasks.date)),
      db
        .select({ moduleId: hourEntries.moduleId, value: count() })
        .from(hourEntries)
        .innerJoin(projectModules, eq(projectModules.id, hourEntries.moduleId))
        .where(and(eq(projectModules.projectId, projectId), eq(hourEntries.hasBlocker, true)))
        .groupBy(hourEntries.moduleId),
    ]);

    const mappedTaskRows = taskRows.map(toTaskRow);
    const blockerCountByModule = new Map(blockerRows.map((r) => [r.moduleId, r.value]));
    const membersBySegment = await loadSegmentMembers(db, segmentRows.map((s) => s.id));
    const consumedBySegment = await loadSegmentConsumption(db, segmentRows.map((s) => s.id));
    const taskIds = mappedTaskRows.map((task) => task.id);
    const [approvedByTask, pendingByTask] = await Promise.all([
      loadTaskConsumption(db, taskIds, 'approved'),
      loadTaskConsumption(db, taskIds, 'pending'),
    ]);
    return moduleRows.map((row) =>
      toRecord(
        row,
        deliveryRows.filter((d) => d.moduleId === row.id),
        segmentRows.filter((s) => s.moduleId === row.id),
        membersBySegment,
        consumedBySegment,
        mappedTaskRows.map((task) => ({
          ...task,
          actualHours: approvedByTask.get(task.id) ?? null,
          pendingHours: pendingByTask.get(task.id) ?? null,
        })),
        blockerCountByModule.get(row.id) ?? 0,
      ),
    );
  }

  async listProgressInputsForProjects(
    projectIds: readonly string[],
    context?: TransactionContext,
  ): Promise<Map<string, ProjectModuleProgressInputRecord[]>> {
    const byProject = new Map<string, ProjectModuleProgressInputRecord[]>();
    if (projectIds.length === 0) return byProject;
    const db = resolveDb(this.database, context);

    const [moduleRows, taskRows, deliveryRows, segmentRows] = await Promise.all([
      db
        .select({
          id: projectModules.id,
          projectId: projectModules.projectId,
          estimatedHours: projectModules.estimatedHours,
          currentStage: projectModules.currentStage,
        })
        .from(projectModules)
        .where(inArray(projectModules.projectId, [...projectIds])),
      db
        .select({
          moduleId: projectModuleTasks.moduleId,
          segmentId: projectModuleTasks.segmentId,
          teamId: projectModuleTasks.teamId,
          description: projectModuleTasks.description,
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          date: projectModuleTasks.date,
          scope: projectModuleTasks.scope,
        })
        .from(projectModuleTasks)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
        .where(and(inArray(projectModules.projectId, [...projectIds]), sql`${projectModuleTasks.cancelledAt} is null`)),
      db
        .select({
          moduleId: projectModuleDeliveries.moduleId,
          segmentId: projectModuleDeliveries.segmentId,
          status: projectModuleDeliveries.status,
          estimatedDate: projectModuleDeliveries.estimatedDate,
        })
        .from(projectModuleDeliveries)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
        .where(inArray(projectModules.projectId, [...projectIds])),
      db
        .select({
          moduleId: projectModuleSegments.moduleId,
          id: projectModuleSegments.id,
          teamId: projectModuleSegments.teamId,
          estimatedHours: projectModuleSegments.estimatedHours,
          startDate: projectModuleSegments.startDate,
          endDate: projectModuleSegments.endDate,
          closedAt: projectModuleSegments.closedAt,
        })
        .from(projectModuleSegments)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleSegments.moduleId))
        .where(inArray(projectModules.projectId, [...projectIds])),
    ]);

    const deliveriesByModule = new Map<string, ProjectModuleProgressInputRecord['deliveries'][number][]>();
    for (const row of deliveryRows) {
      const list = deliveriesByModule.get(row.moduleId) ?? [];
      list.push({ segmentId: row.segmentId, status: row.status, estimatedDate: row.estimatedDate });
      deliveriesByModule.set(row.moduleId, list);
    }

    const tasksByModule = new Map<string, ProjectModuleProgressInputRecord['tasks'][number][]>();
    for (const row of taskRows) {
      const list = tasksByModule.get(row.moduleId) ?? [];
      list.push({
        segmentId: row.segmentId,
        teamId: row.teamId,
        description: row.description,
        estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
        status: row.status,
        date: row.date,
        scope: row.scope,
      });
      tasksByModule.set(row.moduleId, list);
    }

    const segmentsByModule = new Map<string, ProjectModuleProgressInputRecord['segments'][number][]>();
    for (const row of segmentRows) {
      const list = segmentsByModule.get(row.moduleId) ?? [];
      list.push({
        id: row.id, teamId: row.teamId,
        estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
        startDate: row.startDate, endDate: row.endDate, closedAt: row.closedAt,
      });
      segmentsByModule.set(row.moduleId, list);
    }

    for (const row of moduleRows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({
        estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
        currentStage: row.currentStage,
        segments: segmentsByModule.get(row.id) ?? [],
        tasks: tasksByModule.get(row.id) ?? [],
        deliveries: deliveriesByModule.get(row.id) ?? [],
      });
      byProject.set(row.projectId, list);
    }
    return byProject;
  }

  async findById(id: string, context?: TransactionContext): Promise<ProjectModuleRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db.select().from(projectModules).where(eq(projectModules.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const [deliveryRows, segmentRows, taskRows, blockerRows] = await Promise.all([
      db
        .select({
          id: projectModuleDeliveries.id,
          moduleId: projectModuleDeliveries.moduleId,
          teamId: projectModuleDeliveries.teamId,
          teamName: teams.name,
          name: projectModuleDeliveries.name,
          description: projectModuleDeliveries.description,
          assigneeUserId: projectModuleDeliveries.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          segmentId: projectModuleDeliveries.segmentId,
          segmentName: linkedSegments.name,
          estimatedDate: projectModuleDeliveries.estimatedDate,
          status: projectModuleDeliveries.status,
          rejectionReason: projectModuleDeliveries.rejectionReason,
          completedOn: projectModuleDeliveries.completedOn,
          completedByUserId: projectModuleDeliveries.completedByUserId,
          completionFirstName: completionUsers.firstName,
          completionLastName: completionUsers.lastName,
          completionComment: projectModuleDeliveries.completionComment,
          createdAt: projectModuleDeliveries.createdAt,
        })
        .from(projectModuleDeliveries)
        .leftJoin(teams, eq(teams.id, projectModuleDeliveries.teamId))
        .leftJoin(users, eq(users.id, projectModuleDeliveries.assigneeUserId))
        .leftJoin(completionUsers, eq(completionUsers.id, projectModuleDeliveries.completedByUserId))
        .leftJoin(linkedSegments, eq(linkedSegments.id, projectModuleDeliveries.segmentId))
        .where(eq(projectModuleDeliveries.moduleId, id))
        .orderBy(asc(projectModuleDeliveries.estimatedDate)),
      db
        .select({
          id: projectModuleSegments.id,
          closedAt: projectModuleSegments.closedAt,
          moduleId: projectModuleSegments.moduleId,
          teamId: projectModuleSegments.teamId,
          teamName: teams.name,
          name: projectModuleSegments.name,
          startDate: projectModuleSegments.startDate,
          endDate: projectModuleSegments.endDate,
          estimatedHours: projectModuleSegments.estimatedHours,
        })
        .from(projectModuleSegments)
        .innerJoin(teams, eq(teams.id, projectModuleSegments.teamId))
        .where(eq(projectModuleSegments.moduleId, id))
        .orderBy(asc(projectModuleSegments.startDate)),
      db
        .select({
          id: projectModuleTasks.id,
          moduleId: projectModuleTasks.moduleId,
          teamId: projectModuleTasks.teamId,
          teamName: teams.name,
          assigneeUserId: projectModuleTasks.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          segmentId: projectModuleTasks.segmentId,
          segmentName: linkedSegments.name,
          name: projectModuleTasks.name,
          description: projectModuleTasks.description,
          startDate: projectModuleTasks.startDate,
          date: projectModuleTasks.date,
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          scope: projectModuleTasks.scope,
          completedAt: projectModuleTasks.completedAt,
          cancelledAt: projectModuleTasks.cancelledAt,
          rejectionReason: projectModuleTasks.rejectionReason,
        })
        .from(projectModuleTasks)
        .leftJoin(teams, eq(teams.id, projectModuleTasks.teamId))
        .leftJoin(users, eq(users.id, projectModuleTasks.assigneeUserId))
        .leftJoin(linkedSegments, eq(linkedSegments.id, projectModuleTasks.segmentId))
        .where(eq(projectModuleTasks.moduleId, id))
        .orderBy(asc(projectModuleTasks.date)),
      db
        .select({ value: count() })
        .from(hourEntries)
        .where(and(eq(hourEntries.moduleId, id), eq(hourEntries.hasBlocker, true))),
    ]);

    const membersBySegment = await loadSegmentMembers(db, segmentRows.map((s) => s.id));
    const consumedBySegment = await loadSegmentConsumption(db, segmentRows.map((s) => s.id));
    const mappedTasks = taskRows.map(toTaskRow);
    const taskIds = mappedTasks.map((task) => task.id);
    const [approvedByTask, pendingByTask] = await Promise.all([
      loadTaskConsumption(db, taskIds, 'approved'),
      loadTaskConsumption(db, taskIds, 'pending'),
    ]);
    return toRecord(row, deliveryRows, segmentRows, membersBySegment, consumedBySegment,
      mappedTasks.map((task) => ({
        ...task,
        actualHours: approvedByTask.get(task.id) ?? null,
        pendingHours: pendingByTask.get(task.id) ?? null,
      })), blockerRows[0]?.value ?? 0);
  }

  async create(input: CreateProjectModuleInput, now: Date, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectModules)
      .values({
        projectId: input.projectId,
        name: input.name,
        initialStage: input.initialStage,
        currentStage: input.initialStage,
        estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
        estimatedStartDate: input.estimatedStartDate,
        estimatedEndDate: input.estimatedEndDate,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: projectModules.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('El módulo no devolvió identificador.');
    return id;
  }

  async update(
    id: string,
    input: UpdateProjectModuleInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectModules)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.currentStage !== undefined ? { currentStage: input.currentStage } : {}),
        ...(input.estimatedHours !== undefined
          ? { estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null }
          : {}),
        ...(input.estimatedStartDate !== undefined ? { estimatedStartDate: input.estimatedStartDate } : {}),
        ...(input.estimatedEndDate !== undefined ? { estimatedEndDate: input.estimatedEndDate } : {}),
        updatedAt: now,
      })
      .where(eq(projectModules.id, id));
  }

  async remove(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModules).where(eq(projectModules.id, id));
  }

  async addDelivery(
    input: CreateProjectModuleDeliveryInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectModuleDeliveries)
      .values({
        moduleId: input.moduleId,
        teamId: input.teamId,
        name: input.name,
        description: input.description,
        assigneeUserId: input.assigneeUserId,
        segmentId: input.segmentId,
        estimatedDate: input.estimatedDate,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: projectModuleDeliveries.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La entrega no devolvió identificador.');
    return id;
  }

  async updateDelivery(
    id: string,
    input: UpdateProjectModuleDeliveryInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectModuleDeliveries)
      .set({
        ...(input.segmentId !== undefined ? { segmentId: input.segmentId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
        ...(input.segmentId !== undefined ? { segmentId: input.segmentId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.estimatedDate !== undefined ? { estimatedDate: input.estimatedDate } : {}),
        ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
        ...(input.completedOn !== undefined ? { completedOn: input.completedOn } : {}),
        ...(input.completedByUserId !== undefined ? { completedByUserId: input.completedByUserId } : {}),
        ...(input.completionComment !== undefined ? { completionComment: input.completionComment } : {}),
        updatedAt: now,
      })
      .where(eq(projectModuleDeliveries.id, id));
  }

  async removeDelivery(deliveryId: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModuleDeliveries).where(eq(projectModuleDeliveries.id, deliveryId));
  }

  async addSegment(
    input: CreateProjectModuleSegmentInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectModuleSegments)
      .values({
        moduleId: input.moduleId,
        teamId: input.teamId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        estimatedHours: input.estimatedHours?.toString() ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: projectModuleSegments.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('El tramo no devolvió identificador.');
    return id;
  }

  async updateSegment(
    id: string,
    input: UpdateProjectModuleSegmentInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectModuleSegments)
      .set({
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.estimatedHours !== undefined
          ? { estimatedHours: input.estimatedHours?.toString() ?? null } : {}),
        ...(input.closedAt !== undefined ? { closedAt: input.closedAt } : {}),
        updatedAt: now,
      })
      .where(eq(projectModuleSegments.id, id));
  }

  async removeSegment(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModuleSegments).where(eq(projectModuleSegments.id, id));
  }

  async refreshSegmentClosure(segmentId: string, now: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    // La sentencia UPDATE ... SET con subconsultas correlacionadas contra su
    // alias destino fallaba en PostgreSQL y revertía la transacción de alta
    // de la tarea. Contar primero y actualizar después, dentro del MISMO tx,
    // evita depender del alcance del alias UPDATE.
    const [counts] = await db.select({
      active: sql<number>`count(*) filter (where ${projectModuleTasks.cancelledAt} is null)`,
      pending: sql<number>`count(*) filter (
        where ${projectModuleTasks.cancelledAt} is null
          and ${projectModuleTasks.status} <> 'done'
      )`,
    })
      .from(projectModuleTasks)
      .where(eq(projectModuleTasks.segmentId, segmentId));
    const active = Number(counts?.active ?? 0);
    const pending = Number(counts?.pending ?? 0);
    // Aprobar todas las tareas habilita el cierre MANUAL del bloque sin
    // entrega: no debe ejecutarlo automáticamente antes de que el líder
    // pulse "Cerrar bloque". Para bloques con entrega, la aprobación de
    // tareas tampoco sustituye la aprobación de la entrega.
    // Conservar closedAt histórico cuando las tareas ya están aprobadas.
    if (active > 0 && pending === 0) return;
    // Si se agregó o reabrió una tarea (o ya no quedan tareas activas),
    // el antiguo cierre deja de ser válido. Se mantiene la transacción
    // compartida para que los datos del bloque sean consistentes.
    await db.update(projectModuleSegments)
      .set({ closedAt: null, updatedAt: now })
      .where(eq(projectModuleSegments.id, segmentId));
  }

  async replaceSegmentMembers(
    segmentId: string,
    members: readonly ProjectModuleSegmentMemberInput[],
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModuleSegmentMembers).where(eq(projectModuleSegmentMembers.segmentId, segmentId));
    if (members.length === 0) return;
    await db.insert(projectModuleSegmentMembers).values(
      members.map((member) => ({
        segmentId,
        teamMemberId: member.teamMemberId,
        dailyPercent: member.dailyPercent != null ? String(member.dailyPercent) : null,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  async addTask(input: CreateProjectModuleTaskInput, now: Date, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectModuleTasks)
      .values({
        moduleId: input.moduleId,
        teamId: input.teamId,
        assigneeUserId: input.assigneeUserId,
        segmentId: input.segmentId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        date: input.date,
        estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
        status: input.status,
        scope: input.scope,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: projectModuleTasks.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La tarea no devolvió identificador.');
    return id;
  }

  async updateTask(
    id: string,
    input: UpdateProjectModuleTaskInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectModuleTasks)
      .set({
        ...(input.segmentId !== undefined ? { segmentId: input.segmentId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
        ...(input.segmentId !== undefined ? { segmentId: input.segmentId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.estimatedHours !== undefined
          ? { estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
        updatedAt: now,
      })
      .where(eq(projectModuleTasks.id, id));
  }

  async excludeQuotationReference(input: {
    projectId: string; moduleId: string; versionId: string;
    wbs: string; role: string; actorUserId: string;
  }, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.insert(projectRoadmapReferenceExclusions).values(input).onConflictDoNothing();
  }

  async cancelTask(id: string, now: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.update(projectModuleTasks).set({
      cancelledAt: now, updatedAt: now,
    }).where(eq(projectModuleTasks.id, id));
  }

  async hasTaskUserHours(projectId: string, moduleId: string, userId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const records = await db.select({ id: hourEntries.id }).from(hourEntries)
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.moduleId, moduleId),
        eq(hourEntries.userId, userId)))
      .limit(1);
    // Registro por módulo y usuario: conservador, no atribuye las HH a una tarea
    // porque hour_entries no dispone de FK task_id.
    return records.length > 0;
  }

  async removeTask(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModuleTasks).where(eq(projectModuleTasks.id, id));
  }

  async listTasksAssignedToUser(
    userId: string,
    context?: TransactionContext,
  ): Promise<TaskAssignedToUserRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        id: projectModuleTasks.id,
        projectId: projectModules.projectId,
        projectName: projects.name,
        moduleId: projectModules.id,
        moduleName: projectModules.name,
        name: projectModuleTasks.name,
        segmentName: linkedSegments.name,
        estimatedHours: projectModuleTasks.estimatedHours,
        approvedHours: sql<number>`COALESCE((SELECT SUM(${hourEntries.hours}) FROM ${hourEntries} WHERE ${hourEntries.taskId} = ${projectModuleTasks.id} AND ${hourEntries.status} = 'approved'), 0)`.mapWith(Number),
        reviewerFirstName: dashboardApprovalUsers.firstName,
        reviewerLastName: dashboardApprovalUsers.lastName,
        pendingHours: sql<number>`COALESCE((SELECT SUM(${hourEntries.hours}) FROM ${hourEntries} WHERE ${hourEntries.taskId} = ${projectModuleTasks.id} AND ${hourEntries.status} = 'pending'), 0)`.mapWith(Number),
        date: projectModuleTasks.date,
        status: projectModuleTasks.status,
        completedAt: projectModuleTasks.completedAt,
        rejectionReason: projectModuleTasks.rejectionReason,
      })
      .from(projectModuleTasks)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .leftJoin(linkedSegments, eq(linkedSegments.id, projectModuleTasks.segmentId))
      .leftJoin(projectTeams, and(eq(projectTeams.projectId, projectModules.projectId), eq(projectTeams.teamId, projectModuleTasks.teamId)))
      .leftJoin(teams, eq(teams.id, projectModuleTasks.teamId))
      .leftJoin(dashboardApprovalUsers, sql`${dashboardApprovalUsers.id} = COALESCE(${projectTeams.leaderUserId}, ${teams.leaderUserId}, ${projects.leaderUserId})`)
      .where(and(eq(projectModuleTasks.assigneeUserId, userId), sql`${projectModuleTasks.cancelledAt} is null`))
      .orderBy(asc(projectModuleTasks.date));

    return rows.map((row) => ({
      ...row,
      estimatedHours: row.estimatedHours == null ? null : Number(row.estimatedHours),
      reviewerName: [row.reviewerFirstName, row.reviewerLastName].filter(Boolean).join(' ') || null,
    }));
  }

  async listDeliveriesAssignedToUser(
    userId: string,
    context?: TransactionContext,
  ): Promise<DeliveryAssignedToUserRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        id: projectModuleDeliveries.id,
        name: projectModuleDeliveries.name,
        projectId: projectModules.projectId,
        projectName: projects.name,
        moduleId: projectModules.id,
        moduleName: projectModules.name,
        estimatedDate: projectModuleDeliveries.estimatedDate,
        status: projectModuleDeliveries.status,
        rejectionReason: projectModuleDeliveries.rejectionReason,
      })
      .from(projectModuleDeliveries)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .where(eq(projectModuleDeliveries.assigneeUserId, userId))
      .orderBy(asc(projectModuleDeliveries.estimatedDate));

    return rows;
  }
}

interface ModuleRow {
  id: string;
  projectId: string;
  name: string;
  initialStage: ProjectModuleRecord['initialStage'];
  currentStage: ProjectModuleRecord['currentStage'];
  estimatedHours: string | null;
  estimatedStartDate: Date | null;
  estimatedEndDate: Date | null;
}

interface DeliveryRow {
  id: string;
  moduleId: string;
  teamId: string | null;
  teamName: string | null;
  name: string | null;
  description: string | null;
  assigneeUserId: string | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  segmentId: string | null;
  segmentName: string | null;
  estimatedDate: Date;
  status: ProjectModuleDeliveryRecord['status'];
  rejectionReason: string | null;
  completedOn: Date | null;
  completedByUserId: string | null;
  completionFirstName: string | null;
  completionLastName: string | null;
  completionComment: string | null;
  createdAt: Date;
}

interface SegmentRow {
  id: string;
  closedAt: Date | null;
  moduleId: string;
  teamId: string;
  teamName: string;
  name: string;
  startDate: Date;
  endDate: Date;
  estimatedHours: string | null;
}

interface RawTaskRow {
  id: string;
  moduleId: string;
  teamId: string | null;
  teamName: string | null;
  assigneeUserId: string | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  segmentId: string | null;
  segmentName: string | null;
  name: string;
  description: string | null;
  startDate: Date;
  date: Date;
  estimatedHours: string | null;
  status: ProjectModuleTaskRecord['status'];
  scope: ProjectModuleTaskRecord['scope'];
  completedAt: Date | null;
  cancelledAt: Date | null;
  rejectionReason: string | null;
}

function toTaskRow(row: RawTaskRow): ProjectModuleTaskRecord {
  return {
    id: row.id,
    moduleId: row.moduleId,
    teamId: row.teamId,
    teamName: row.teamName,
    assigneeUserId: row.assigneeUserId,
    assigneeName: row.assigneeUserId ? `${row.assigneeFirstName ?? ''} ${row.assigneeLastName ?? ''}`.trim() : null,
    segmentId: row.segmentId,
    segmentName: row.segmentName,
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    date: row.date,
    estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
    status: row.status,
    scope: row.scope,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    rejectionReason: row.rejectionReason,
  };
}

async function loadSegmentMembers(
  db: Database,
  segmentIds: readonly string[],
): Promise<Map<string, ProjectModuleSegmentMemberRecord[]>> {
  const bySegment = new Map<string, ProjectModuleSegmentMemberRecord[]>();
  if (segmentIds.length === 0) return bySegment;

  const rows = await db
    .select({
      segmentId: projectModuleSegmentMembers.segmentId,
      teamMemberId: projectModuleSegmentMembers.teamMemberId,
      firstName: users.firstName,
      lastName: users.lastName,
      weeklyHours: teamMembers.weeklyHours,
      dailyPercent: projectModuleSegmentMembers.dailyPercent,
    })
    .from(projectModuleSegmentMembers)
    .innerJoin(teamMembers, eq(teamMembers.id, projectModuleSegmentMembers.teamMemberId))
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(inArray(projectModuleSegmentMembers.segmentId, [...segmentIds]))
    .orderBy(asc(users.firstName), asc(users.lastName));

  for (const row of rows) {
    const list = bySegment.get(row.segmentId) ?? [];
    list.push({
      teamMemberId: row.teamMemberId,
      fullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
      weeklyHours: Number(row.weeklyHours),
      dailyPercent: row.dailyPercent != null ? Number(row.dailyPercent) : null,
    });
    bySegment.set(row.segmentId, list);
  }
  return bySegment;
}

/**
 * Agregación por FK real hour_entries.segment_id: solo aprobadas, sin join
 * por nombre o fechas. Ejecutada una vez para los segmentos visibles.
 */
/** Sólo HH registradas y aprobadas, con task_id explícito. */
async function loadTaskConsumption(
  db: Database,
  taskIds: readonly string[],
  status: 'approved' | 'pending',
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db.select({
    taskId: hourEntries.taskId,
    total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)`,
  }).from(hourEntries)
    .where(and(inArray(hourEntries.taskId, [...taskIds]), eq(hourEntries.status, status)))
    .groupBy(hourEntries.taskId);
  return new Map(rows.flatMap((row) => row.taskId
    ? [[row.taskId, Number(row.total)] as const] : []));
}

async function loadSegmentConsumption(
  db: Database,
  segmentIds: readonly string[],
): Promise<Map<string, number>> {
  if (segmentIds.length === 0) return new Map();
  const rows = await db.select({
    segmentId: hourEntries.segmentId,
    total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)`,
  }).from(hourEntries)
    .where(and(inArray(hourEntries.segmentId, [...segmentIds]), eq(hourEntries.status, 'approved')))
    .groupBy(hourEntries.segmentId);
  return new Map(rows.flatMap((row) => row.segmentId
    ? [[row.segmentId, Number(row.total)] as const] : []));
}

function toRecord(
  row: ModuleRow,
  deliveryRows: DeliveryRow[],
  segmentRows: SegmentRow[],
  membersBySegment: ReadonlyMap<string, ProjectModuleSegmentMemberRecord[]>,
  consumedBySegment: ReadonlyMap<string, number>,
  taskRows: ProjectModuleTaskRecord[],
  blockerCount: number,
): ProjectModuleRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    initialStage: row.initialStage,
    currentStage: row.currentStage,
    estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
    estimatedStartDate: row.estimatedStartDate,
    estimatedEndDate: row.estimatedEndDate,
    deliveries: deliveryRows.map((d) => ({
      id: d.id,
      moduleId: d.moduleId,
      teamId: d.teamId,
      teamName: d.teamName,
      name: d.name,
      description: d.description,
      assigneeUserId: d.assigneeUserId,
      assigneeName: d.assigneeUserId ? `${d.assigneeFirstName ?? ''} ${d.assigneeLastName ?? ''}`.trim() : null,
      segmentId: d.segmentId,
      segmentName: d.segmentName,
      estimatedDate: d.estimatedDate,
      status: d.status,
      rejectionReason: d.rejectionReason,
      completedOn: d.completedOn,
      completedByUserId: d.completedByUserId,
      completedByName: d.completedByUserId
        ? [d.completionFirstName, d.completionLastName].filter(Boolean).join(' ') : null,
      completionComment: d.completionComment,
      createdAt: d.createdAt,
    })),
    segments: segmentRows.map((s) => ({
      id: s.id,
      closedAt: s.closedAt,
      moduleId: s.moduleId,
      teamId: s.teamId,
      teamName: s.teamName,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      estimatedHours: s.estimatedHours !== null ? Number(s.estimatedHours) : null,
      consumedHours: consumedBySegment.get(s.id) ?? 0,
      members: membersBySegment.get(s.id) ?? [],
    })),
    tasks: taskRows.filter((t) => t.moduleId === row.id),
    blockerCount,
  };
}
