import {
  quotationCommercialDossierSchema,
  type QuotationCommercialDossier,
  type QuotationCommercialPreflight,
  type QuotationTeamCatalogEntry,
  type QuotationVersion,
} from '@kora/contracts';

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Generación determinista para revisión interna a partir de lectura autorizada.
 * El expediente nunca es orden de enviar, aprobar ni transferir HH.
 */
export function buildQuotationCommercialDossier(
  version: QuotationVersion,
  preflight: QuotationCommercialPreflight,
  catalog: readonly QuotationTeamCatalogEntry[],
  generatedAt: string,
): QuotationCommercialDossier {
  if (preflight.versionId !== version.id ||
      preflight.versionNumber !== version.versionNumber ||
      preflight.revision !== version.revision ||
      preflight.sendEnabled !== false) {
    throw new Error('La validación comercial no corresponde a esta versión y revisión.');
  }
  const draft = version.draft;
  const catalogById = new Map(catalog.map((entry) => [entry.teamId, entry]));
  const hoursByTeam = new Map<string, number>();
  if (draft.mode === 'phases') {
    for (const phase of draft.phases) {
      for (const row of phase.teamHours) {
        hoursByTeam.set(row.teamId, (hoursByTeam.get(row.teamId) ?? 0) + row.hours);
      }
    }
  }
  const teams = draft.teams.map((team) => {
    const capacityReferenceHours = round(team.collaborators *
      (team.unit === 'day' ? team.duration / 5 : team.duration) *
      team.hoursPerWeek * team.dedicationPercent / 100);
    const matching = catalogById.get(team.teamId);
    return {
      ...team,
      name: matching?.name ?? null,
      isActive: matching?.isActive ?? false,
      capacityReferenceHours,
      quotedHours: draft.mode === 'phases'
        ? round(hoursByTeam.get(team.teamId) ?? 0) : capacityReferenceHours,
    };
  });
  const analysis = draft.analysis;
  return quotationCommercialDossierSchema.parse({
    schemaVersion: 'kora.quotation.commercial-dossier.v1',
    documentStatus: 'internal_review_only',
    deliveryEnabled: false,
    commercialApprovalEnabled: false,
    transferEnabled: false,
    projectId: preflight.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    revision: version.revision,
    versionUpdatedAt: version.updatedAt,
    generatedAt,
    quotation: {
      name: version.name,
      status: version.status,
      origin: version.origin,
      aiReviewStatus: version.aiReviewStatus,
      currency: version.currency,
      tax: version.tax,
      hourlyRate: version.hourlyRate,
      totalHours: preflight.summary.totalHours,
      netAmount: preflight.summary.netAmount,
      totalAmount: preflight.summary.totalAmount,
      mode: draft.mode,
      teams,
      phases: draft.phases,
      costs: draft.costs,
      paymentPlan: draft.paymentPlan,
      assumptions: draft.assumptions,
      exclusions: draft.exclusions,
      sourcesCount: draft.sourceRefs.length,
      aiEvidence: {
        mode: analysis?.provenance.mode ?? (draft.aiPoc ? 'simulated_fixture' : 'none'),
        provider: analysis?.provenance.provider ?? draft.aiPoc?.proposal.provider ?? null,
        model: analysis?.provenance.model ?? null,
        label: analysis?.provenance.label ?? (draft.aiPoc ? 'Gemini + PDF KDM de demostración' : null),
        sourceFileCount: analysis?.provenance.sourceFiles.length ?? (draft.aiPoc ? 1 : 0),
      },
    },
    validation: preflight,
    outstandingBusinessGates: [
      { id: 'D02', status: 'pending',
        description: 'Definir responsables y permisos definitivos para envío y aprobación.' },
      { id: 'D05', status: 'pending',
        description: 'Acordar tratamiento de recotizaciones sobre ejecución/facturación existente.' },
      { id: 'D06', status: 'pending',
        description: 'Confirmar cálculo comercial de impuestos, UF y costos recurrentes.' },
    ],
    notes: [
      'Documento de revisión interna, no una propuesta enviada al cliente.',
      'Las validaciones se basan en una lectura temporal; no equivalen a una aprobación.',
      'No incluye las respuestas del cuestionario ni contenido documental de fuentes externas.',
      'No autoriza cambios a proyectos, HH registradas, tareas o hitos de pago.',
    ],
  });
}
