import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, projectQuotations, projects, quotationEvents, quotationVersions, sql, teams, type Database } from '@kora/db';
import {
  quotationDraftDataSchema,
  quotationVersionSchema,
  type CreateQuotationVersionInput,
  type ProjectQuotation,
  type QuotationDraftData,
  type QuotationVersion,
  type UpdateQuotationDraftInput,
} from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { calculateQuotation } from '../../domain/quotation-math';
import type { QuotationProjectScope, QuotationRepository } from '../../domain/repositories/quotation.repository';

@Injectable()
export class DrizzleQuotationRepository implements QuotationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getProjectScope(projectId: string): Promise<QuotationProjectScope | null> {
    const [p] = await this.db.select({
      id: projects.id,
      type: projects.type,
      salesStage: projects.salesStage,
      status: projects.status,
      leaderUserId: projects.leaderUserId,
    }).from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
    return p ?? null;
  }

  async getByProjectId(projectId: string): Promise<ProjectQuotation | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id, projectId: projectQuotations.projectId })
      .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    const rows = await this.db.select().from(quotationVersions)
      .where(eq(quotationVersions.quotationId, quotation.id)).orderBy(asc(quotationVersions.versionNumber));
    return { ...quotation, versions: rows.map(toVersion) };
  }

  async createDraft(projectId: string, userId: string, input: CreateQuotationVersionInput): Promise<QuotationVersion> {
    return this.db.transaction(async (tx) => {
      await tx.insert(projectQuotations).values({ projectId, createdByUserId: userId }).onConflictDoNothing();
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('No se pudo crear la cotización del proyecto.');
      // Serializa los números v1, v2, ... por proyecto y evita carreras entre peticiones.
      await tx.execute(sql`SELECT id FROM project_quotations WHERE id = ${quotation.id} FOR UPDATE`);
      const [last] = await tx.select({ versionNumber: quotationVersions.versionNumber })
        .from(quotationVersions).where(eq(quotationVersions.quotationId, quotation.id))
        .orderBy(desc(quotationVersions.versionNumber)).limit(1);

      let draft: QuotationDraftData = quotationDraftDataSchema.parse({});
      let hourlyRate: number | null = null;
      let currency: 'UF' | 'CLP' | 'USD' = 'UF';
      let tax: 'iva19' | 'igv18' | 'exempt' = 'iva19';
      let origin: 'manual' | 'copy' = 'manual';
      if (input.sourceVersionId) {
        const [source] = await tx.select().from(quotationVersions)
          .where(and(eq(quotationVersions.id, input.sourceVersionId), eq(quotationVersions.quotationId, quotation.id))).limit(1);
        if (!source) throw new NotFoundException('La versión para copiar no pertenece a esta cotización.');
        // Una copia MANUAL desde una propuesta IA no hereda fuentes ni respuestas IA.
        const previous = quotationDraftDataSchema.parse(source.draft);
        draft = { ...previous, sourceRefs: [], answers: {} };
        hourlyRate = source.hourlyRate === null ? null : Number(source.hourlyRate);
        currency = source.currency as typeof currency;
        tax = source.tax as typeof tax;
        origin = 'copy';
      }
      const totals = calculateQuotation(draft, hourlyRate, tax);
      const next = (last?.versionNumber ?? 0) + 1;
      const [created] = await tx.insert(quotationVersions).values({
        quotationId: quotation.id,
        versionNumber: next,
        name: `Versión ${next}`,
        status: 'draft',
        origin,
        aiReviewStatus: null,
        createdByUserId: userId,
        hourlyRate: hourlyRate?.toFixed(4) ?? null,
        currency,
        tax,
        draft,
        totalHours: totals.totalHours.toFixed(2),
        netAmount: totals.netAmount?.toFixed(4) ?? null,
        totalAmount: totals.totalAmount?.toFixed(4) ?? null,
      }).returning();
      if (!created) throw new Error('No se pudo crear la versión.');
      await tx.insert(quotationEvents).values({
        versionId: created.id, actorUserId: userId, action: 'draft_created',
        metadata: { origin, sourceVersionId: input.sourceVersionId ?? null },
      });
      return toVersion(created);
    });
  }

  async updateDraft(projectId: string, versionId: string, userId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id }).from(projectQuotations)
      .where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    const totals = calculateQuotation(input.draft, input.hourlyRate, input.tax);
    return this.db.transaction(async (tx) => {
      const teamIds = input.draft.teams.map((team) => team.teamId);
      if (teamIds.length > 0) {
        const available = await tx.select({ id: teams.id }).from(teams)
          .where(and(inArray(teams.id, teamIds), eq(teams.isActive, true), isNull(teams.deletedAt)));
        if (available.length !== teamIds.length) {
          throw new BadRequestException('Todos los equipos cotizados deben existir y estar activos en Kora.');
        }
      }
      const [updated] = await tx.update(quotationVersions).set({
        name: input.name,
        hourlyRate: input.hourlyRate?.toFixed(4) ?? null,
        currency: input.currency,
        tax: input.tax,
        draft: input.draft,
        totalHours: totals.totalHours.toFixed(2),
        netAmount: totals.netAmount?.toFixed(4) ?? null,
        totalAmount: totals.totalAmount?.toFixed(4) ?? null,
        editedByUserId: userId,
        revision: sql`${quotationVersions.revision} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
        eq(quotationVersions.status, 'draft'),
        eq(quotationVersions.revision, input.revision),
      )).returning();
      if (!updated) return null;
      await tx.insert(quotationEvents).values({
        versionId: updated.id, actorUserId: userId, action: 'draft_updated',
        metadata: { previousRevision: input.revision, newRevision: input.revision + 1 },
      });
      return toVersion(updated);
    });
  }
}

function toVersion(row: typeof quotationVersions.$inferSelect): QuotationVersion {
  return quotationVersionSchema.parse({
    id: row.id,
    quotationId: row.quotationId,
    versionNumber: row.versionNumber,
    name: row.name,
    status: row.status,
    origin: row.origin,
    aiReviewStatus: row.aiReviewStatus,
    revision: row.revision,
    createdByUserId: row.createdByUserId,
    hourlyRate: row.hourlyRate === null ? null : Number(row.hourlyRate),
    currency: row.currency,
    tax: row.tax,
    draft: quotationDraftDataSchema.parse(row.draft),
    totalHours: Number(row.totalHours),
    netAmount: row.netAmount === null ? null : Number(row.netAmount),
    totalAmount: row.totalAmount === null ? null : Number(row.totalAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
