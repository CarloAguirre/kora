import type { ProjectPaymentStatus } from '@kora/contracts';
import styles from './ProjectMilestoneDetailPanel.module.css';
import { SidePanel } from '@/shared/components/ui/SidePanel';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { CheckIcon } from '@/shared/components/icons/Icons';
import { getProjectStageLabel } from '@/modules/projects/lib/project-stage-display';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { formatMoney } from '@/shared/lib/format-money';
import { paymentTriggerLabel } from '@/modules/projects/lib/payment-milestone-display';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');

const STEPS: ReadonlyArray<{ status: ProjectPaymentStatus; label: string }> = [
  { status: 'pending', label: 'Pendiente' },
  { status: 'to_invoice', label: 'Por facturar' },
  { status: 'invoiced', label: 'Facturado' },
  { status: 'paid', label: 'Pagado' },
];

export interface ProjectMilestoneDetailPanelProps {
  projectId: string | null;
  milestoneId: string | null;
  onClose: () => void;
  onIssue: () => void;
  onMarkPaid: () => void;
}

/**
 * Detalle de un tramo de pago de proyecto, en panel lateral — igual patrón
 * que el mockup de referencia: el hito que lo deja por facturar (aprobación,
 * fase o fecha — ver `docs/DECISION-FACTURACION-PROYECTOS.md`) junto a la
 * etapa actual del proyecto.
 * Las acciones (`onIssue`/`onMarkPaid`) abren los mismos diálogos que ya
 * usaba la tabla — este panel no duplica esa lógica.
 */
export function ProjectMilestoneDetailPanel({ projectId, milestoneId, onClose, onIssue, onMarkPaid }: ProjectMilestoneDetailPanelProps) {
  const { data: project } = useProjectDetail(projectId);
  const milestone = project?.paymentMilestones.find((m) => m.id === milestoneId);

  const open = projectId !== null && milestoneId !== null;
  const stepIndex = milestone ? STEPS.findIndex((s) => s.status === milestone.status) : -1;
  const invoiced = milestone?.status === 'invoiced' || milestone?.status === 'paid';
  const currency = project?.contractCurrency ?? 'UF';

  return (
    <SidePanel
      open={open}
      title={project?.client?.companyName ?? ''}
      description={project?.name}
      onClose={onClose}
      footer={
        milestone && (
          <div className={styles.footerContent}>
            <div className={styles.statusTrack}>
              {STEPS.map((step, index) => (
                <div key={step.status} className={styles.statusStepWrap}>
                  <span className={[styles.statusStep, index <= stepIndex ? styles.statusStepDone : ''].filter(Boolean).join(' ')}>
                    {index < stepIndex && <CheckIcon size={12} />}
                    {step.label}
                  </span>
                  {index < STEPS.length - 1 && <span className={styles.statusSep} />}
                </div>
              ))}
            </div>

            {invoiced && (
              <p className={styles.record}>
                Folio <strong>{milestone.invoiceNumber ?? '—'}</strong> · emitida el <strong>{formatDate(milestone.issuedAt)}</strong>
                {milestone.dueAt && (
                  <>
                    {' '}
                    · vence el <strong>{formatDate(milestone.dueAt)}</strong>
                  </>
                )}
              </p>
            )}
            {milestone.isOverdue && (
              <Badge tone="danger">Pago atrasado</Badge>
            )}
            {milestone.status === 'paid' && (
              <p className={styles.record}>
                Pago recibido el <strong>{formatDate(milestone.paidAt)}</strong>
              </p>
            )}

            {(milestone.status === 'pending' || milestone.status === 'to_invoice') && (
              <Button
                className={styles.actionButton}
                variant={milestone.status === 'pending' ? 'outline' : 'primary'}
                onClick={onIssue}
              >
                Marcar como facturado
              </Button>
            )}
            {milestone.status === 'invoiced' && (
              <Button className={styles.actionButton} onClick={onMarkPaid}>
                Marcar como pagado
              </Button>
            )}
            {milestone.status === 'paid' && (
              <div className={styles.doneBadge}>
                <CheckIcon size={16} /> Pagado
              </div>
            )}
          </div>
        )
      }
    >
      {!project || !milestone ? (
        <p className={styles.hint}>Cargando…</p>
      ) : (
        <>
          <Badge tone="info">
            {milestone.name}
            {milestone.percent !== null ? ` (${milestone.percent}%)` : ''}
          </Badge>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Detalle del tramo</p>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Proyecto</span>
              <span className={styles.rowValue}>{project.name}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Hito de cobro</span>
              <span className={styles.rowValue}>{paymentTriggerLabel(milestone)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Etapa actual del proyecto</span>
              <span className={styles.rowValue}>{getProjectStageLabel(project)}</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={[styles.row, styles.rowHighlight].join(' ')}>
            <span className={styles.rowLabel}>Monto del tramo{milestone.percent !== null ? ` (${milestone.percent}%)` : ''}</span>
            <span className={styles.rowValueHighlight}>{formatMoney(milestone.amount, currency)}</span>
          </div>
          <p className={styles.note}>
            {milestone.status === 'pending'
              ? 'El tramo queda por facturar cuando se cumpla su hito; se avisa por correo a Finanzas y Gerencia.'
              : 'Kora no emite la factura: solo registra folio, fechas y pago.'}
          </p>
        </>
      )}
    </SidePanel>
  );
}
