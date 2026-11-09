/**
 * Textos redactados por un LLM: un exceso de verbosidad NO debe invalidar
 * las HH, los WBS ni las referencias de la EDT.
 *
 * Solo acotamos etiquetas de interfaz y explicaciones cortas. Nunca
 * transformamos identificadores (WBS, stageCode, roles, teamId), números,
 * descripciones técnicas ni referencias de documentos. Estas últimas
 * están protegidas por el presupuesto de salida global del proveedor.
 */
export function fitGeneratedLabel(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + '…';
}

export function fitGeneratedText(value: unknown, max: number): unknown {
  return typeof value === 'string' ? fitGeneratedLabel(value, max) : value;
}

export function normalizeGeneratedProposal(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  const limitList = (source: unknown, max: number): unknown =>
    Array.isArray(source)
      ? source.map((item) => fitGeneratedText(item, max))
      : source;
  return {
    ...value,
    summary: fitGeneratedText(value.summary, 3000),
    assumptions: limitList(value.assumptions, 1500),
    clarifyingQuestions: limitList(value.clarifyingQuestions, 1500),
    roles: Array.isArray(value.roles)
      ? value.roles.map((role) =>
        role && typeof role === 'object' && !Array.isArray(role)
          ? { ...role, source: fitGeneratedText(
            (role as Record<string, unknown>).source, 1500) }
          : role)
      : value.roles,
  };
}
