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
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { PhaseProgressBar } from '../components/PhaseProgressBar';
import { PhaseRoadmap } from '../components/PhaseRoadmap';
import { ProjectBillingCard } from '../components/ProjectBillingCard';
import { ProjectBitacora } from '../components/ProjectBitacora';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { toClientProjectDetail } from '../adapters/project-detail.adapter';
import type { ClientAccessLinks, ClientProjectHealth } from '../types';

interface AccessLink {
  readonly key: keyof ClientAccessLinks;
  readonly label: string;
  readonly subtitle: string;
  readonly icon: ComponentType<IconProps>;
}

/** Fuente real en `project.accessLinks` (`demoLink`/`testEnvironmentLink`/
 *  `figmaLink`/`documentationLink`, declarados en la pestaña "Extras" de la
 *  ficha interna) — solo se muestra la tarjeta de las que el proyecto tiene
 *  configuradas, ver `configuredAccessLinks` más abajo. */
const ACCESS_LINKS: readonly AccessLink[] = [
  { key: 'demo', label: 'Ver demo', subtitle: 'Ambiente de demostración', icon: PlayIcon },
  { key: 'testEnvironment', label: 'Ambiente de prueba', subtitle: 'Acceso a usuarios', icon: CircleCheckIcon },
  { key: 'figma', label: 'Figma', subtitle: 'Diseño', icon: DiamondIcon },
  { key: 'documentation', label: 'Documentación', subtitle: 'Especificaciones', icon: AlignLeftIcon },
];

type SectionKey = 'info' | 'billing' | 'links' | 'roadmap' | 'hours' | 'gantt' | 'impact' | 'qa' | 'bitacora';

/**
 * Un botón por sección — "esta botonera muestra o esconde las secciones de
 * abajo" (Figma node 9203:2178, todavía 9 botones en el archivo — no se
 * sincronizó con las 2 secciones nuevas de la variante "Kora · Proyectos y
 * Soporte 2" del node 9663:24207). Se prioriza el invariante que esta misma
 * lista ya documentaba (un ícono = una sección, nunca desincronizados) sobre
 * copiar un conteo de Figma que quedó desactualizado: son 9 ahora ("Avance
 * del periodo" se quitó — su contenido ya vive en "Bitácora").
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
 * Ya no quedan botones puramente decorativos en esta vista:
 * - "Compartir PDF" copia el link de esta misma ficha al portapapeles y
 *   "Descargar PDF" abre el diálogo de impresión del navegador (no hay
 *   generación de PDF en el backend, así que no hay nada real que "conectar"
 *   más allá de eso — ver `handleSharePdf`/`handleDownloadPdf`).
 * - "Accesos y enlaces" ("Ver demo", "Ambiente de prueba", etc.) lee de
 *   `project.accessLinks` (declarados en la pestaña "Extras" de la ficha
 *   interna) y solo muestra las tarjetas que el proyecto tiene configuradas.
 * - Los controles de "Roadmap por Fases" (zoom, filtro de rango, chips de
 *   ámbito, selección de tarea/entrega/incidente) y el "Ver más" de la
 *   Bitácora son reales — ver esos componentes.
 * La única pieza deliberadamente deshabilitada es la pestaña "Vista Interna"
 * del Figma, con un candado (igual que en el propio Figma): esta ruta YA ES
 * la vista cliente, no hay una pantalla interna a la que alternar desde aquí.
 *
 * La botonera de íconos bajo el título replica la del Figma en el orden y
 * los conceptos, no en la cantidad exacta: el archivo se quedó con 9 botones
 * sin sincronizar con la fusión de "Hitos y aprobaciones" + "Puntos de
 * atención e incidentes" en una sola "Bitácora" — acá son 9, uno por sección.
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
  /** Mismas horas que alimentan la Bitácora interna (`DevelopmentProjectDetailView`) — por id real, no por el slug de la ruta. */
  const { data: projectHourEntries } = useHourEntriesList(
    { projectId: projectDetail?.id, page: 1, pageSize: 20, sortField: 'date', sortDirection: 'desc' },
    { enabled: Boolean(projectDetail?.id) },
  );
  const project = projectDetail ? toClientProjectDetail(projectDetail, projectHourEntries?.items ?? []) : undefined;
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(ALL_SECTIONS_VISIBLE);
  const resolvedBackTo = backTo ?? '/portal/proyectos';

  const toggleSection = (key: SectionKey) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  /** No hay generación de PDF en el backend — "Compartir" copia el enlace de
   *  esta misma ficha (quien lo reciba necesita acceso al portal cliente) y
   *  "Descargar" abre el diálogo de impresión del navegador, que ya ofrece
   *  "Guardar como PDF". */
  const handleSharePdf = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show('Enlace copiado al portapapeles.', 'success');
    } catch {
      toast.show('No se pudo copiar el enlace.', 'error');
    }
  };
  const handleDownloadPdf = () => window.print();

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

  const configuredAccessLinks = ACCESS_LINKS.map((link) => ({ ...link, url: project.accessLinks[link.key] })).filter(
    (link): link is AccessLink & { url: string } => Boolean(link.url),
  );

  return (
    <DashboardLayout title="Detalle de proyecto">
      <div className={styles.page}>
        <Link className={styles.breadcrumb} to={resolvedBackTo}>
          <ChevronLeftIcon size={16} /> {backLabel ?? `Volver a proyectos de ${project.company.name}`}
        </Link>

        <h2 className={styles.title}>{project.name}</h2>

        <div className={styles.statusActionsRow}>
          <StatusPill tone={HEALTH_TONE[project.health]}>{HEALTH_LABEL[project.health]}</StatusPill>
          <Button variant="outline" iconLeft={<LinkIcon size={15} />} onClick={handleSharePdf}>
            Compartir PDF
          </Button>
          <Button variant="outline" iconLeft={<DownloadIcon size={15} />} onClick={handleDownloadPdf}>
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

        {visible.links && configuredAccessLinks.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Accesos y enlaces</h3>
          <div className={styles.linksRow}>
            {configuredAccessLinks.map(({ key, label, subtitle, icon: LinkIconCmp, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={styles.linkCard}>
                <LinkIconCmp size={16} className={styles.linkIcon} />
                <span className={styles.linkText}>
                  <span className={styles.linkTitle}>{label}</span>
                  <span className={styles.linkSubtitle}>{subtitle}</span>
                </span>
              </a>
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
                <div className={styles.hoursDeviationValueRow}>
                  <span className={styles.statSub}>{formatHours(project.hoursDeviation)}</span>
                  {project.hoursDeviation > 0 ? (
                    <StatusPill tone="warning">En riesgo</StatusPill>
                  ) : (
                    <StatusPill tone="success">Sin desviación</StatusPill>
                  )}
                </div>
              </div>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Horas utilizadas a la fecha</span>
              <span className={styles.statValue}>{formatHours(project.usedHoursToDate)}</span>
              <span className={styles.statSub}>
                actualizado al
                <br />
                {project.usedHoursUpdatedAt}
              </span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Avance real vs. esperado</span>
              <div className={styles.progressValueRow}>
                <span className={styles.statValue}>{project.progressActualPercent}%</span>
                <span className={styles.deviationBadge}>{project.progressActualPercent - project.progressExpectedPercent}%</span>
              </div>
              <span className={styles.statSub}>vs {project.progressExpectedPercent}% esperado</span>
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
          <PhaseRoadmap phaseRoadmap={project.phaseRoadmap} />
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
          <ProjectBitacora entries={project.bitacora} />
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
