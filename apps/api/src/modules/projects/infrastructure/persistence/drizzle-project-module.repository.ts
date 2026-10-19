import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  hourEntries,
  inArray,
  projectModuleDeliveries,
  projectModuleSegmentMembers,
  projectModuleSegments,
  projectModuleTasks,
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

@Injectable()
export class DrizzleProjectModuleRepository implements ProjectModuleRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(projectId: string, context?: TransactionContext): Promise<ProjectModuleRecord[]> {
    const db = resolveDb(this.database, context);

    const [moduleRows, deliveryRows, segmentRows, taskRows, blockerRows] = await Promise.all([
      db.select().from(projectModules).where(eq(projectModules.projectId, projectId)).orderBy(asc(projectModules.createdAt)),
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
          estimatedDate: projectModuleDeliveries.estimatedDate,
          status: projectModuleDeliveries.status,
          rejectionReason: projectModuleDeliveries.rejectionReason,
          createdAt: projectModuleDeliveries.createdAt,
        })
        .from(projectModuleDeliveries)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
        .leftJoin(teams, eq(teams.id, projectModuleDeliveries.teamId))
        .leftJoin(users, eq(users.id, projectModuleDeliveries.assigneeUserId))
        .where(eq(projectModules.projectId, projectId))
        .orderBy(asc(projectModuleDeliveries.estimatedDate)),
      db
        .select({
          id: projectModuleSegments.id,
          moduleId: projectModuleSegments.moduleId,
          teamId: projectModuleSegments.teamId,
          teamName: teams.name,
          name: projectModuleSegments.name,
          startDate: projectModuleSegments.startDate,
          endDate: projectModuleSegments.endDate,
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
          name: projectModuleTasks.name,
          description: projectModuleTasks.description,
          startDate: projectModuleTasks.startDate,
          date: projectModuleTasks.date,
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          scope: projectModuleTasks.scope,
          completedAt: projectModuleTasks.completedAt,
          rejectionReason: projectModuleTasks.rejectionReason,
        })
        .from(projectModuleTasks)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
        .leftJoin(teams, eq(teams.id, projectModuleTasks.teamId))
        .leftJoin(users, eq(users.id, projectModuleTasks.assigneeUserId))
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
    return moduleRows.map((row) =>
      toRecord(
        row,
        deliveryRows.filter((d) => d.moduleId === row.id),
        segmentRows.filter((s) => s.moduleId === row.id),
        membersBySegment,
        mappedTaskRows,
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

    const [moduleRows, taskRows, deliveryRows] = await Promise.all([
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
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          date: projectModuleTasks.date,
          scope: projectModuleTasks.scope,
        })
        .from(projectModuleTasks)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
        .where(inArray(projectModules.projectId, [...projectIds])),
      db
        .select({
          moduleId: projectModuleDeliveries.moduleId,
          status: projectModuleDeliveries.status,
          estimatedDate: projectModuleDeliveries.estimatedDate,
        })
        .from(projectModuleDeliveries)
        .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
        .where(inArray(projectModules.projectId, [...projectIds])),
    ]);

    const deliveriesByModule = new Map<string, ProjectModuleProgressInputRecord['deliveries'][number][]>();
    for (const row of deliveryRows) {
      const list = deliveriesByModule.get(row.moduleId) ?? [];
      list.push({ status: row.status, estimatedDate: row.estimatedDate });
      deliveriesByModule.set(row.moduleId, list);
    }

    const tasksByModule = new Map<string, ProjectModuleProgressInputRecord['tasks'][number][]>();
    for (const row of taskRows) {
      const list = tasksByModule.get(row.moduleId) ?? [];
      list.push({
        estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
        status: row.status,
        date: row.date,
        scope: row.scope,
      });
      tasksByModule.set(row.moduleId, list);
    }

    for (const row of moduleRows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({
        estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
        currentStage: row.currentStage,
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
          estimatedDate: projectModuleDeliveries.estimatedDate,
          status: projectModuleDeliveries.status,
          rejectionReason: projectModuleDeliveries.rejectionReason,
          createdAt: projectModuleDeliveries.createdAt,
        })
        .from(projectModuleDeliveries)
        .leftJoin(teams, eq(teams.id, projectModuleDeliveries.teamId))
        .leftJoin(users, eq(users.id, projectModuleDeliveries.assigneeUserId))
        .where(eq(projectModuleDeliveries.moduleId, id))
        .orderBy(asc(projectModuleDeliveries.estimatedDate)),
      db
        .select({
          id: projectModuleSegments.id,
          moduleId: projectModuleSegments.moduleId,
          teamId: projectModuleSegments.teamId,
          teamName: teams.name,
          name: projectModuleSegments.name,
          startDate: projectModuleSegments.startDate,
          endDate: projectModuleSegments.endDate,
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
          name: projectModuleTasks.name,
          description: projectModuleTasks.description,
          startDate: projectModuleTasks.startDate,
          date: projectModuleTasks.date,
          estimatedHours: projectModuleTasks.estimatedHours,
          status: projectModuleTasks.status,
          scope: projectModuleTasks.scope,
          completedAt: projectModuleTasks.completedAt,
          rejectionReason: projectModuleTasks.rejectionReason,
        })
        .from(projectModuleTasks)
        .leftJoin(teams, eq(teams.id, projectModuleTasks.teamId))
        .leftJoin(users, eq(users.id, projectModuleTasks.assigneeUserId))
        .where(eq(projectModuleTasks.moduleId, id))
        .orderBy(asc(projectModuleTasks.date)),
      db
        .select({ value: count() })
        .from(hourEntries)
        .where(and(eq(hourEntries.moduleId, id), eq(hourEntries.hasBlocker, true))),
    ]);

    const membersBySegment = await loadSegmentMembers(db, segmentRows.map((s) => s.id));
    return toRecord(row, deliveryRows, segmentRows, membersBySegment, taskRows.map(toTaskRow), blockerRows[0]?.value ?? 0);
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
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.estimatedDate !== undefined ? { estimatedDate: input.estimatedDate } : {}),
        ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
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
        updatedAt: now,
      })
      .where(eq(projectModuleSegments.id, id));
  }

  async removeSegment(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectModuleSegments).where(eq(projectModuleSegments.id, id));
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
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
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
        ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
        updatedAt: now,
      })
      .where(eq(projectModuleTasks.id, id));
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
        date: projectModuleTasks.date,
        status: projectModuleTasks.status,
        completedAt: projectModuleTasks.completedAt,
        rejectionReason: projectModuleTasks.rejectionReason,
      })
      .from(projectModuleTasks)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .where(eq(projectModuleTasks.assigneeUserId, userId))
      .orderBy(asc(projectModuleTasks.date));

    return rows;
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
  estimatedDate: Date;
  status: ProjectModuleDeliveryRecord['status'];
  rejectionReason: string | null;
  createdAt: Date;
}

interface SegmentRow {
  id: string;
  moduleId: string;
  teamId: string;
  teamName: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

interface RawTaskRow {
  id: string;
  moduleId: string;
  teamId: string | null;
  teamName: string | null;
  assigneeUserId: string | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  name: string;
  description: string | null;
  startDate: Date;
  date: Date;
  estimatedHours: string | null;
  status: ProjectModuleTaskRecord['status'];
  scope: ProjectModuleTaskRecord['scope'];
  completedAt: Date | null;
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
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    date: row.date,
    estimatedHours: row.estimatedHours != null ? Number(row.estimatedHours) : null,
    status: row.status,
    scope: row.scope,
    completedAt: row.completedAt,
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

function toRecord(
  row: ModuleRow,
  deliveryRows: DeliveryRow[],
  segmentRows: SegmentRow[],
  membersBySegment: ReadonlyMap<string, ProjectModuleSegmentMemberRecord[]>,
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
      estimatedDate: d.estimatedDate,
      status: d.status,
      rejectionReason: d.rejectionReason,
      createdAt: d.createdAt,
    })),
    segments: segmentRows.map((s) => ({
      id: s.id,
      moduleId: s.moduleId,
      teamId: s.teamId,
      teamName: s.teamName,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      members: membersBySegment.get(s.id) ?? [],
    })),
    tasks: taskRows.filter((t) => t.moduleId === row.id),
    blockerCount,
  };
}
