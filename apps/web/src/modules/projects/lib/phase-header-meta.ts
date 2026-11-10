import type { ProjectModule } from '@kora/contracts';

/** La misma metadata cronológica de fases del Roadmap Líder/PMO y colaborador. */
export function phaseHeaderMeta(module: ProjectModule) {
    const starts = module.segments.map((segment) => segment.startDate).sort();
    const ends = module.segments.map((segment) => segment.endDate).sort();
    const start = starts[0] ?? module.estimatedStartDate;
    const end = ends[ends.length - 1] ?? module.estimatedEndDate;
    const segmentHoursKnown = module.segments.length > 0 &&
      module.segments.every((segment) => segment.estimatedHours != null);
    const hours = module.estimatedHours ??
      (module.segments.length === 0 && module.tasks.length === 0 ? 0 :
        segmentHoursKnown ? module.segments.reduce((sum, segment) =>
          sum + (segment.estimatedHours ?? 0), 0) : null);
    const asDayMonthYear = (iso: string) => iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4);
    const blocksMissingHours = module.segments.filter((segment) => segment.estimatedHours == null).length;
    const hoursLabel = hours == null ? 'HH sin definir' :
      new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(hours) +
      (module.estimatedHours != null ? ' HH de fase' : ' HH de bloques');
    return (start && end ? asDayMonthYear(start) + ' → ' + asDayMonthYear(end) : 'Sin fechas') +
      ', ' + hoursLabel +
      (blocksMissingHours > 0 ? ' · ' + blocksMissingHours +
        (blocksMissingHours === 1 ? ' bloque sin HH' : ' bloques sin HH') : '');
  }
