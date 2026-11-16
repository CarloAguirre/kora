/** El inicio de la EDT debe ser estable y nunca volver a tomarse del reloj en GET.
 * Con trabajo previo, se ancla al día del evento de TRASPASO, manteniendo
 * intactos la fecha original del proyecto y la Fase 0 histórica.
 */
export function dateInSantiago(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const field = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return [field('year'), field('month'), field('day')].join('-');
}

export function quotationCalendarAnchor(options: {
  projectStartDate: Date | null;
  hito0At: Date | null;
  transferredAt: Date;
  transferMetadata: unknown;
}): { startIso: string | null; usedTransferDate: boolean } {
  const { projectStartDate, hito0At, transferredAt, transferMetadata } = options;
  const metadata = transferMetadata && typeof transferMetadata === 'object'
    ? transferMetadata as Record<string, unknown> : {};
  const prior = metadata.priorCommercialState && typeof metadata.priorCommercialState === 'object'
    ? metadata.priorCommercialState as Record<string, unknown> : {};
  // La foto del traspaso manda: no deducir Fase 0 de HH consumidas DESPUÉS.
  const priorUsed = typeof prior.usedHours === 'number' ? prior.usedHours : 0;
  const hasPhaseZero = priorUsed > 0;
  const existingStart = projectStartDate
    ? projectStartDate.toISOString().slice(0, 10)
    : hito0At ? dateInSantiago(hito0At) : null;
  return {
    startIso: hasPhaseZero ? dateInSantiago(transferredAt) : existingStart,
    usedTransferDate: hasPhaseZero,
  };
}
