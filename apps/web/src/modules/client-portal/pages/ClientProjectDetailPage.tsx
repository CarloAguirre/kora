import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './ClientProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import {
  AlignLeftIcon,
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronLeftIcon,
  CircleCheckIcon,
  ClockIcon,
  DiamondIcon,
  DollarSignIcon,
  DownloadIcon,
  FileTextIcon,
  HistoryIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  PlayIcon,
  RefreshIcon,
  TrendingUpIcon,
  UnlockIcon,
  UsersIcon,
  type IconProps,
} from '@/shared/components/icons/Icons';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { PhaseProgressBar } from '../components/PhaseProgressBar';
import { PhaseRoadmap } from '../components/PhaseRoadmap';
import { ProjectBillingCard } from '../components/ProjectBillingCard';
import { ProjectBitacora } from '../components/ProjectBitacora';
import { PeriodReportCard } from '../components/PeriodReportCard';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { toClientProjectDetail } from '../adapters/project-detail.adapter';
import type { ClientProjectHealth } from '../types';

interface AccessLink {
  readonly label: string;
  readonly subtitle: string;
  readonly icon: ComponentType<IconProps>;
}

const ACCESS_LINKS: readonly AccessLink[] = [
  { label: 'Ver demo', subtitle: 'Ambiente de demostración', icon: PlayIcon },
  { label: 'Ambiente de prueba', subtitle: 'Acceso a usuarios', icon: CircleCheckIcon },
  { label: 'Figma', subtitle: 'Diseño', icon: DiamondIcon },
  { label: 'Documentación', subtitle: 'Especificaciones', icon: AlignLeftIcon },
];

type SectionKey = 'info' | 'billing' | 'links' | 'roadmap' | 'hours' | 'gantt' | 'impact' | 'periodReport' | 'qa' | 'bitacora';

/**
 * Un botón por sección — "esta botonera muestra o esconde las secciones de
 * abajo" (Figma node 9203:2178, todavía 9 botones en el archivo — no se
 * sincronizó con las 2 secciones nuevas de la variante "Kora · Proyectos y
 * Soporte 2" del node 9663:24207). Se prioriza el invariante que esta misma
 * lista ya documentaba (un ícono = una sección, nunca desincronizados) sobre
 * copiar un conteo de Figma que quedó desactualizado: son 10 ahora.
 */
const SECTION_TOGGLES: ReadonlyArray<{ key: SectionKey; label: string; icon: typeof LinkIcon }> = [
  { key: 'links', label: 'Accesos y enlaces', icon: LinkIcon },
  { key: 'roadmap', label: 'Hoja de ruta', icon: RefreshIcon },
  { key: 'billing', label: 'Facturación', icon: DollarSignIcon },
  { key: 'info', label: 'Datos del proyecto', icon: ListIcon },
  { key: 'hours', label: 'Horas y avance', icon: ClockIcon },
  { key: 'impact', label: 'Impacto en el negocio', icon: TrendingUpIcon },
  { key: 'qa', label: 'Métricas de la etapa actual', icon: BarChartIcon },
  { key: 'gantt', label: 'Roadmap por Fases', icon: CalendarIcon },
  { key: 'periodReport', label: 'Avance del periodo', icon: FileTextIcon },
  { key: 'bitacora', label: 'Bitácora', icon: HistoryIcon },
];

const ALL_SECTIONS_VISIBLE: Record<SectionKey, boolean> = {
  info: true,
  billing: true,
  links: true,
  roadmap: true,
  hours: true,
  gantt: true,
  impact: true,
  periodReport: true,
  qa: true,
  bitacora: true,
};

const HEALTH_LABEL: Readonly<Record<ClientProjectHealth, string>> = {
  active: 'Activo',
  at_risk: 'En riesgo',
  finished: 'Finalizado',
};

const HEALTH_TONE: Readonly<Record<ClientProjectHealth, StatusPillTone>> = {
  active: 'success',
  at_risk: 'warning',
  finished: 'neutral',
};

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/**
 * Ficha de proyecto del portal de cliente — versión reducida de la pantalla
 * de detalle del Figma de referencia. Actualizada a la variante "Kora ·
 * Proyectos y Soporte 2" (node 9663:24207, dentro de la sección "Propuesta
 * Mejoras Vista Cliente", node 8756:45807) — más reciente que la variante 1
 * (node 9663:23202) contra la que se había construido originalmente.
 *
 * DATOS REALES vía `useProjectDetail` + `toClientProjectDetail` (ver
 * `adapters/project-detail.adapter.ts`) — ver docs/DECISION-PORTAL-CLIENTE.md.
 * RECORTES DELIBERADOS que siguen sin lógica real detrás (muestran un aviso
 * en vez de fallar en silencio):
 * - La pestaña "Vista Interna" del Figma se muestra deshabilitada con un
 *   candado (igual que en el propio Figma): esta ruta ES la vista cliente,
 *   no hay una pantalla interna a la que alternar desde aquí.
 * - Los botones "Compartir PDF" / "Descargar PDF", los accesos ("Ver demo",
 *   "Ambiente de prueba", etc.) y los controles de "Roadmap por Fases"
 *   (filtro de rango, Aplicar/Restablecer, "Ver más" de la Bitácora) — el
 *   zoom Semanas/Días de "Roadmap por Fases" sí es real, ver el componente.
 *
 * La botonera de íconos bajo el título replica la del Figma en el orden y
 * los conceptos, no en la cantidad exacta: el archivo se quedó con 9 botones
 * sin sincronizar con las secciones nuevas ("Facturación", "Avance del
 * periodo") ni con la fusión de "Hitos y aprobaciones" + "Puntos de atención
 * e incidentes" en una sola "Bitácora" — acá son 10, uno por sección.
 * `SECTION_TOGGLES` es la única lista — el botón y la sección que controla
 * nunca pueden desincronizarse porque ambos leen de ahí.
 */
export interface ClientProjectDetailPageProps {
  /** Fuerza el proyecto a mostrar en vez de leer `projectId` de la ruta —
   *  usado por la vista previa desde `ClientDetailPage`. */
  readonly projectIdOverride?: string;
  /** Destino del breadcrumb "Volver". Por defecto `/portal/proyectos` (la ruta
   *  real del portal de cliente, que un admin/PMO no tiene permiso para ver). */
  readonly backTo?: string;
  readonly backLabel?: string;
}

export function ClientProjectDetailPage({ projectIdOverride, backTo, backLabel }: ClientProjectDetailPageProps = {}) {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const projectId = projectIdOverride ?? routeProjectId ?? null;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: projectDetail, isLoading, isError } = useProjectDetail(projectId);
  const project = projectDetail ? toClientProjectDetail(projectDetail) : undefined;
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(ALL_SECTIONS_VISIBLE);
  const resolvedBackTo = backTo ?? '/portal/proyectos';

  const notifyMock = (label: string) => toast.show(`"${label}" es una acción de ejemplo — todavía no está conectada.`, 'info');
  const toggleSection = (key: SectionKey) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) {
    return (
      <DashboardLayout title="Detalle de proyecto">
        <div className={styles.page}>
          <Card className={styles.notFoundCard}>
            <p>Cargando ficha del proyecto…</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!project || isError) {
    return (
      <DashboardLayout title="Detalle de proyecto">
        <div className={styles.page}>
          <Card className={styles.notFoundCard}>
            <p>No se pudo cargar este proyecto.</p>
            <p className={styles.notFoundHint}>Verifica que el enlace apunte a un proyecto existente.</p>
            <Button variant="outline" iconLeft={<ChevronLeftIcon size={16} />} onClick={() => navigate(resolvedBackTo)}>
              {backLabel ?? 'Volver a proyectos'}
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Detalle de proyecto">
      <div className={styles.page}>
        <Link className={styles.breadcrumb} to={resolvedBackTo}>
          <ChevronLeftIcon size={16} /> {backLabel ?? `Volver a proyectos de ${project.company.name}`}
        </Link>

        <h2 className={styles.title}>{project.name}</h2>

        <div className={styles.statusActionsRow}>
          <StatusPill tone={HEALTH_TONE[project.health]}>{HEALTH_LABEL[project.health]}</StatusPill>
          <Button variant="outline" iconLeft={<LinkIcon size={15} />} onClick={() => notifyMock('Compartir PDF')}>
            Compartir PDF
          </Button>
          <Button variant="outline" iconLeft={<DownloadIcon size={15} />} onClick={() => notifyMock('Descargar PDF')}>
            Descargar PDF
          </Button>
        </div>

        <div className={styles.viewTabs} role="tablist" aria-label="Vista de la ficha">
          <span className={styles.viewTabDisabled} role="tab" aria-selected={false} aria-disabled title="Solo el equipo Kabeli puede ver esta pestaña">
            <LockIcon size={13} /> Vista Interna
          </span>
          <span className={styles.viewTabActive} role="tab" aria-selected={true}>
            Vista Cliente
          </span>
        </div>

        <div className={styles.sectionToggles} role="group" aria-label="Mostrar u ocultar secciones">
          {SECTION_TOGGLES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={[styles.sectionToggle, visible[key] ? styles.sectionToggleOn : ''].filter(Boolean).join(' ')}
              aria-pressed={visible[key]}
              aria-label={`${visible[key] ? 'Ocultar' : 'Mostrar'} ${label}`}
              title={label}
              onClick={() => toggleSection(key)}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {visible.info && (
        <Card className={styles.infoBar}>
          <div className={styles.infoClient}>
            <div className={styles.infoLogoPlaceholder} aria-hidden="true">
              <BuildingIcon size={22} />
            </div>
            <InfoField label="Cliente" value={project.company.name} />
          </div>
          <InfoField label="Responsable Kabeli" value={project.kabeliOwnerName} />
          <InfoField
            label="Responsable cliente"
            value={
              <>
                {project.clientContactName}
                <span className={styles.infoValueSub}>{project.clientContactPosition}</span>
              </>
            }
          />
          <InfoField
            label="Fecha de inicio - Fin"
            value={
              <>
                {project.startDate}
                <br />
                {project.endDate}
              </>
            }
          />
        </Card>
        )}

        {visible.billing && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Facturación</h3>
          <ProjectBillingCard billing={project.billing} />
        </section>
        )}

        {visible.links && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Accesos y enlaces</h3>
          <div className={styles.linksRow}>
            {ACCESS_LINKS.map(({ label, subtitle, icon: LinkIconCmp }) => (
              <button key={label} type="button" className={styles.linkCard} onClick={() => notifyMock(label)}>
                <LinkIconCmp size={16} className={styles.linkIcon} />
                <span className={styles.linkText}>
                  <span className={styles.linkTitle}>{label}</span>
                  <span className={styles.linkSubtitle}>{subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        )}

        {visible.roadmap && (
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Hoja de ruta</h3>
            <span className={styles.sectionCaption}>Cada fase tiene su propio cronograma independiente · la línea roja marca el avance esperado a hoy</span>
          </div>
          <div className={styles.roadmapList}>
            {project.roadmap.map((phase) => (
              <PhaseProgressBar key={phase.name} phase={phase} />
            ))}
          </div>
        </section>
        )}

        {visible.hours && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Horas y avance</h3>
          <div className={styles.hoursGrid}>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Horas estimadas</span>
              <span className={[styles.statValue, styles.statValueLarge].join(' ')}>{formatHours(project.estimatedHours)}</span>
              <div className={styles.hoursDeviationRow}>
                <span className={styles.statLabel}>Horas desviación</span>
                <span className={styles.statSub}>{formatHours(project.hoursDeviation)}</span>
                <StatusPill tone="warning">En riesgo</StatusPill>
              </div>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Horas utilizadas a la fecha</span>
              <span className={styles.statValue}>{formatHours(project.usedHoursToDate)}</span>
              <span className={styles.statSub}>actualizado al {project.usedHoursUpdatedAt}</span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Avance real vs. esperado</span>
              <span className={styles.statValue}>
                {project.progressActualPercent}%{' '}
                <span className={styles.statSub}>vs {project.progressExpectedPercent}% esperado</span>
                <span className={styles.deviationBadge}>{project.progressActualPercent - project.progressExpectedPercent}%</span>
              </span>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${project.progressActualPercent}%` }} />
                <div className={styles.progressExpectedMarker} style={{ left: `${project.progressExpectedPercent}%` }} />
              </div>
            </Card>
            <Card className={[styles.statCard, styles.statCardDark].join(' ')}>
              <span className={styles.statLabelDark}>Fecha fin del proyecto</span>
              <span className={styles.statValueDark}>{project.endDate}</span>
              <span className={styles.statSubDark}>{project.daysRemaining} días restantes</span>
            </Card>
          </div>
        </section>
        )}

        {visible.gantt && (
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Roadmap por Fases</h3>
            <span className={styles.sectionCaption}>Vista por semana de diseño, desarrollo, QA y aprobación por fase</span>
          </div>
          <PhaseRoadmap phaseRoadmap={project.phaseRoadmap} onNonFunctionalAction={() => notifyMock('Roadmap por Fases')} />
        </section>
        )}

        {visible.impact && (() => {
          const { before, after, reductionPercent } = project.businessImpact;
          return (
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Impacto en el negocio</h3>
            <span className={styles.sectionCaption}>Proceso manual vs. proceso con automatizado</span>
          </div>
          <div className={styles.impactCard}>
            <div className={styles.impactColumn}>
              <span className={styles.impactHeading}>Antes de automatizar</span>
              <ImpactStat icon={ClockIcon} iconTone="before" label="Tiempo total del proceso" value={`${before.totalProcessHours} horas`} />
              <ImpactStat icon={UsersIcon} iconTone="before" label="Personas involucradas" value={`${before.peopleInvolved} personas`} />
              <ImpactStat icon={CalendarIcon} iconTone="before" label="Duración calendario" value={`${before.cycleDays} días laborales (8h c/u)`} />
              <ImpactStat icon={LockIcon} iconTone="before" label="Modalidad" value={before.modality} last />
            </div>
            <div className={styles.impactColumn}>
              <span className={styles.impactHeading}>Después — medido en QA / Marcha blanca</span>
              <ImpactStat icon={ClockIcon} iconTone="after" label="Tiempo total del proceso" value={`${after.totalProcessHours} horas`} />
              <ImpactStat
                icon={UsersIcon}
                iconTone="after"
                label="Personas involucradas"
                value={after.peopleInvolved === 0 ? `0 personas · solo supervisión` : `${after.peopleInvolved} personas`}
              />
              <ImpactStat icon={CalendarIcon} iconTone="after" label="Duración calendario" value={after.cycleDays === 0 ? 'Mismo día' : `${after.cycleDays} días`} />
              <ImpactStat icon={UnlockIcon} iconTone="after" label="Modalidad" value={after.modality} last />
            </div>
            <div className={styles.impactCallout}>
              <p className={styles.impactCalloutValue}>-{reductionPercent}%</p>
              <p className={styles.impactCalloutCaption}>reducción de tiempo de proceso</p>
            </div>
          </div>
        </section>
          );
        })()}

        {visible.periodReport && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Avance del periodo</h3>
          <PeriodReportCard report={project.periodReport} />
        </section>
        )}

        {visible.qa && project.qaMetrics && (() => {
          const qa = project.qaMetrics;
          const withoutErrors = qa.executed - qa.withErrors;
          const executedPercent = Math.round((qa.executed / qa.planned) * 100);
          const stats: ReadonlyArray<{ value: number; label: string; dot: string }> = [
            { value: qa.planned, label: 'Pruebas planificadas', dot: '#93a0ac' },
            { value: qa.executed, label: `Pruebas ejecutadas (${executedPercent}%)`, dot: '#0f2a44' },
            { value: qa.withErrors, label: 'Con error', dot: '#d5504b' },
            { value: withoutErrors, label: 'Sin error', dot: '#2e9e52' },
            { value: qa.remaining, label: 'Pruebas restantes', dot: '#6c63e8' },
          ];
          return (
          <section className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <h3 className={styles.sectionTitle}>Métricas de la etapa actual — {qa.stageLabel}</h3>
              <span className={styles.sectionCaption}>{qa.caption}</span>
            </div>
            <Card className={styles.qaCard}>
              <div className={styles.qaHeaderRow}>
                <span>Inicio pruebas: {qa.startDate}</span>
                <span>Estado hasta hoy</span>
                <span>Fin pruebas: {qa.endDate}</span>
              </div>
              <div className={styles.qaBarTrack}>
                <div className={styles.qaBarSegment} style={{ width: `${(withoutErrors / qa.planned) * 100}%`, background: '#2e9e52' }} />
                <div className={styles.qaBarSegment} style={{ width: `${(qa.withErrors / qa.planned) * 100}%`, background: '#d5504b' }} />
              </div>
              <div className={styles.qaStats}>
                {stats.map((stat) => (
                  <div key={stat.label} className={styles.qaStat}>
                    <span className={styles.qaStatValue}>{stat.value}</span>
                    <span className={styles.qaStatLabel}>
                      <span className={styles.qaStatDot} style={{ background: stat.dot }} />
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
          );
        })()}

        {visible.bitacora && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Bitácora</h3>
          <ProjectBitacora entries={project.bitacora} onSeeMore={() => notifyMock('Ver más')} />
        </section>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.infoField}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

function ImpactStat({
  icon: Icon,
  iconTone,
  label,
  value,
  last = false,
}: {
  icon: ComponentType<IconProps>;
  iconTone: 'before' | 'after';
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={[styles.impactStat, last ? styles.impactStatLast : ''].filter(Boolean).join(' ')}>
      <span className={[styles.impactIcon, iconTone === 'after' ? styles.impactIconAfter : ''].filter(Boolean).join(' ')}>
        <Icon size={14} />
      </span>
      <span className={styles.impactLabel}>{label}</span>
      <span className={styles.impactValue}>{value}</span>
    </div>
  );
}
