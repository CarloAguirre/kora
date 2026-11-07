import type { ProjectProgress } from '@kora/contracts';
import { ProjectProgressOverview } from '@/modules/client-portal/components/ProjectProgressOverview';

interface ProjectTimelineProps {
  progress: ProjectProgress;
}

/**
 * Avance real del proyecto (ver `projectProgressSchema`) en la ficha interna — el mismo diseño que
 * "Avance del proyecto" del portal de cliente (`ProjectProgressOverview`), sin tarjeta propia porque
 * la ficha ya la pone, con la leyenda arriba a la derecha y sin pie de fechas (la ficha ya muestra
 * inicio y entrega). Lo que solo le sirve al equipo (HH consumidas, cobertura del plan, avance
 * estimado por cantidad) va como nota bajo la barra.
 */
export function ProjectTimeline({ progress }: ProjectTimelineProps) {
  const note = [
    progress.consumption != null ? `HH consumidas: ${progress.consumption}%.` : null,
    progress.actual != null && progress.planCoverage != null && progress.planCoverage < 100
      ? `Plan cargado: ${progress.planCoverage}% de las HH estimadas de las fases.`
      : null,
    progress.actual != null && progress.estimatedByCount
      ? 'Parte del avance se calculó por cantidad de tareas y entregas (sin HH estimadas).'
      : null,
    progress.actual == null ? 'El avance se mide cuando las fases tienen tareas o entregas (tab Roadmap).' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ProjectProgressOverview
      bare
      legendInHeader
      actualPercent={progress.actual}
      expectedPercent={progress.expected}
      note={note || undefined}
    />
  );
}
