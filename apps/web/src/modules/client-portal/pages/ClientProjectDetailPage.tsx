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
  CheckIcon,
  ChevronLeftIcon,
  CircleCheckIcon,
  ClockIcon,
  DiamondIcon,
  DownloadIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  PlayIcon,
  RefreshIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UnlockIcon,
  UsersIcon,
  type IconProps,
} from '@/shared/components/icons/Icons';
import { PhaseProgressBar } from '../components/PhaseProgressBar';
import { ProjectGanttChart } from '../components/ProjectGanttChart';
import { StatusPill, type StatusPillTone } from '../components/StatusPill';
import { MOCK_CLIENT_PROJECT_DETAILS_BY_ID } from '../mocks/client-portal.mocks';
import type { ClientMilestoneStatus, ClientProjectHealth } from '../types';

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

type SectionKey = 'info' | 'links' | 'roadmap' | 'hours' | 'milestones' | 'gantt' | 'impact' | 'attention' | 'qa';

/**
 * Un botón por sección — "esta botonera muestra o esconde las secciones de
 * abajo" (Figma node 9203:2178: 9 botones circulares, no 8 — el orden y los
 * íconos de abajo replican exactamente esa fila, confirmado con
 * `get_design_context` sobre ese nodo).
 */
const SECTION_TOGGLES: ReadonlyArray<{ key: SectionKey; label: string; icon: typeof LinkIcon }> = [
  { key: 'links', label: 'Accesos y enlaces', icon: LinkIcon },
  { key: 'roadmap', label: 'Hoja de ruta', icon: RefreshIcon },
  { key: 'milestones', label: 'Hitos y aprobaciones', icon: CheckIcon },
  { key: 'info', label: 'Datos del proyecto', icon: ListIcon },
  { key: 'hours', label: 'Horas y avance', icon: ClockIcon },
  { key: 'impact', label: 'Impacto en el negocio', icon: TrendingUpIcon },
  { key: 'qa', label: 'Métricas de la etapa actual', icon: BarChartIcon },
  { key: 'gantt', label: 'Roadmap del proyecto', icon: CalendarIcon },
  { key: 'attention', label: 'Puntos de atención e incidentes', icon: TriangleAlertIcon },
];

const ALL_SECTIONS_VISIBLE: Record<SectionKey, boolean> = {
  info: true,
  links: true,
  roadmap: true,
  hours: true,
  milestones: true,
  gantt: true,
  impact: true,
  attention: true,
  qa: true,
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

const MILESTONE_LABEL: Readonly<Record<ClientMilestoneStatus, string>> = {
  completed: 'Completado',
  awaiting_approval: 'Esperando aprobación',
  pending: 'Pendiente',
};

const MILESTONE_TONE: Readonly<Record<ClientMilestoneStatus, StatusPillTone>> = {
  completed: 'success',
  awaiting_approval: 'warning',
  pending: 'neutral',
};

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/**
 * Ficha de proyecto del portal de cliente — versión reducida de la pantalla
 * de detalle del Figma de referencia (node 9203:2063 / 9263:2075).
 *
 * MOCK Y RECORTES DELIBERADOS — ver docs/DECISION-PORTAL-CLIENTE.md:
 * - La pestaña "Vista Interna" del Figma se muestra deshabilitada con un
 *   candado (igual que en el propio Figma): esta ruta ES la vista cliente,
 *   no hay una pantalla interna a la que alternar desde aquí.
 * - Los botones "Compartir PDF" / "Descargar PDF" y los accesos ("Ver demo",
 *   "Ambiente de prueba", etc.) no tienen una acción real detrás todavía —
 *   muestran un aviso en vez de fallar en silencio.
 * - "Roadmap del proyecto" (Gantt semanal por módulo, `ProjectGanttChart`) sí
 *   está integrado, con datos de ejemplo (`gantt` en `ClientProjectDetail`) en
 *   vez de un cálculo real a partir de fechas — no se sumó ninguna librería
 *   de gráficos nueva, es una cuadrícula con barras posicionadas por %.
 *
 * La botonera de 9 íconos bajo el título replica la del Figma: cada botón
 * muestra u oculta UNA de las 9 secciones de abajo (mismo orden). `SECTION_TOGGLES`
 * es la única lista — el botón y la sección que controla nunca pueden
 * desincronizarse porque ambos leen de ahí.
 */
export function ClientProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const project = projectId ? MOCK_CLIENT_PROJECT_DETAILS_BY_ID[projectId] : undefined;
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(ALL_SECTIONS_VISIBLE);

  const notifyMock = (label: string) => toast.show(`"${label}" es una acción de ejemplo — todavía no está conectada.`, 'info');
  const toggleSection = (key: SectionKey) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!project) {
    return (
      <DashboardLayout title="Detalle de proyecto">
        <div className={styles.page}>
          <Card className={styles.notFoundCard}>
            <p>Todavía no hay una ficha de ejemplo cargada para este proyecto.</p>
            <p className={styles.notFoundHint}>
              Por ahora solo "Portal de Gestión Financiera + Agente IA de Tickets" tiene datos de muestra completos —
              ver <code>mocks/client-portal.mocks.ts</code>.
            </p>
            <Button variant="outline" iconLeft={<ChevronLeftIcon size={16} />} onClick={() => navigate('/portal/proyectos')}>
              Volver a proyectos
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Detalle de proyecto">
      <div className={styles.page}>
        <Link className={styles.breadcrumb} to="/portal/proyectos">
          <ChevronLeftIcon size={16} /> Volver a proyectos de {project.company.name}
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

        {visible.links && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Accesos y enlaces</h3>
          <div className={styles.linksRow}>
            {ACCESS_LINKS.map(({ label, subtitle, icon: LinkIconCmp }) => (
              <button key={label} type="button" className={styles.linkCard} onClick={() => notifyMock(label)}>
                <LinkIconCmp size={16} />
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
            <span className={styles.sectionCaption}>Cada fase tiene su propio cronograma independiente · la línea roja marca el avance real a hoy</span>
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
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLabel}>Avance real vs. esperado</span>
              <span className={styles.statValue}>
                {project.progressActualPercent}%{' '}
                <span className={styles.statSub}>vs {project.progressExpectedPercent}% esperado</span>
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

        {visible.milestones && (
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Hitos y aprobaciones</h3>
            <span className={styles.sectionCaption}>{project.milestonesCaption}</span>
          </div>
          <Card className={styles.milestonesCard}>
            {project.milestones.map((milestone) => (
              <div key={milestone.id} className={styles.milestoneRow}>
                <span className={[styles.milestoneDot, styles[`milestoneDot_${milestone.status}`]].join(' ')} aria-hidden="true" />
                <div className={styles.milestoneBody}>
                  <div className={styles.milestoneHeadRow}>
                    <span className={styles.milestoneTitle}>{milestone.title}</span>
                    <StatusPill tone={MILESTONE_TONE[milestone.status]}>{MILESTONE_LABEL[milestone.status]}</StatusPill>
                  </div>
                  <span className={styles.milestoneMeta}>{milestone.submittedBy}</span>
                  {milestone.approvalNote && <p className={styles.milestoneApprovalBox}>✓ {milestone.approvalNote}</p>}
                  {milestone.waitingText && (
                    <div className={styles.milestoneWaitingBox}>
                      <span>{milestone.waitingText}</span>
                      <Button size="sm" variant="secondary" style={{ color: '#fff' }} onClick={() => notifyMock('Dar OK')}>
                        Dar OK
                      </Button>
                    </div>
                  )}
                  {milestone.pendingNote && <p className={styles.milestonePendingBox}>{milestone.pendingNote}</p>}
                </div>
              </div>
            ))}
          </Card>
        </section>
        )}

        {visible.gantt && (
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionTitle}>Roadmap del proyecto</h3>
            <span className={styles.sectionCaption}>Vista por semana de diseño, desarrollo, QA y aprobación por módulo</span>
          </div>
          <ProjectGanttChart gantt={project.gantt} />
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

        {visible.attention && (
          <section className={styles.section}>
            <Card className={styles.attentionCard}>
              <div className={styles.attentionHeader}>
                <TriangleAlertIcon size={16} />
                <h3 className={styles.attentionTitle}>Puntos de atención e incidentes</h3>
              </div>
              <p className={styles.attentionSummary}>
                {project.attentionPoints.length} punto{project.attentionPoints.length === 1 ? '' : 's'} de atención pendiente
                {project.attentionPoints.length === 1 ? '' : 's'} · {project.incidents.length} incidente{project.incidents.length === 1 ? '' : 's'} registrado
                {project.incidents.length === 1 ? '' : 's'}
              </p>

              <h4 className={styles.attentionSubheading}>Puntos de atención</h4>
              {project.attentionPoints.length === 0 ? (
                <p className={styles.attentionEmpty}>Sin puntos de atención para este periodo.</p>
              ) : (
                project.attentionPoints.map((point) => (
                  <div key={point.id} className={styles.attentionGrid}>
                    <div>
                      <span className={styles.attentionFieldLabel}>Descripción</span>
                      <p className={styles.attentionFieldValue}>{point.description}</p>
                    </div>
                    <div>
                      <span className={styles.attentionFieldLabel}>Responsable</span>
                      <p className={styles.attentionFieldValue}>{point.responsibleName}</p>
                    </div>
                    <div>
                      <span className={styles.attentionFieldLabel}>Plan de acción</span>
                      <p className={styles.attentionFieldValue}>{point.actionPlan}</p>
                    </div>
                    <div>
                      <span className={styles.attentionFieldLabel}>Fecha de cierre</span>
                      <p className={styles.attentionFieldValue}>{point.closingDate}</p>
                    </div>
                  </div>
                ))
              )}

              <h4 className={styles.attentionSubheading}>Incidentes o problemas</h4>
              {project.incidents.length === 0 ? (
                <p className={styles.attentionEmpty}>Sin incidentes registrados para este periodo.</p>
              ) : (
                project.incidents.map((incident) => (
                  <p key={incident.id} className={styles.attentionIncident}>
                    {incident.description}
                  </p>
                ))
              )}
            </Card>
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
