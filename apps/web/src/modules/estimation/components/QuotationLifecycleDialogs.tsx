import type { ProjectDetail, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import styles from './QuotationLifecycleDialogs.module.css';

export type TransferTiming = 'now' | 'later';

const formatted = (value: number) => value.toLocaleString('es-CL', {
  maximumFractionDigits: 2,
});

type ApprovalProps = {
  project: ProjectDetail;
  version: QuotationVersion;
  previouslyApprovedVersionNumber?: number;
  timing: TransferTiming;
  onTimingChange: (timing: TransferTiming) => void;
  onCancel: () => void;
  onApprove: () => void;
  pending: boolean;
  error?: string;
};

export function QuotationApprovalDialog({
  project, version, previouslyApprovedVersionNumber, timing, onTimingChange,
  onCancel, onApprove, pending, error,
}: ApprovalProps) {
  const canTransferNow = project.status === 'draft';
  return (
    <Modal open title="Registrar aprobación del cliente"
      className={styles.approvalDialog} dismissible={!pending} onClose={onCancel}
      footer={<div className={styles.actions}>
        <Button variant="outline" disabled={pending} onClick={onCancel}>Cancelar</Button>
        <Button variant="secondary" loading={pending} onClick={onApprove}>Registrar aprobación</Button>
      </div>}>
      <p className={styles.intro}>
        El cliente aprobó la <strong>v{version.versionNumber} · {version.name}</strong>.
        {' '}Se registrará la aprobación comercial; el traspaso al proyecto es una acción separada.
      </p>
      {version.status !== 'sent' && (
        <p className={styles.warning}>
          Esta versión no fue marcada como enviada al cliente. Confirma que es la versión que aprobó.
        </p>
      )}
      {previouslyApprovedVersionNumber != null && (
        <p className={styles.warning}>
          La v{previouslyApprovedVersionNumber} estaba aprobada; su estado comercial se actualizará.
        </p>
      )}
      <fieldset className={styles.choices}>
        <legend>¿Cuándo traspasar a la ficha del proyecto?</legend>
        <label className={[styles.choice, timing === 'now' ? styles.selected : ''].join(' ')}>
          <input type="radio" name="quotation-transfer-timing" value="now"
            checked={timing === 'now'} disabled={pending || !canTransferNow}
            onChange={() => onTimingChange('now')} />
          <span>
            <strong>Aprobar y traspasar ahora</strong>
            <small>HH vendidas, equipos, fases, plan de pago y documentación se cargarán en la ficha tras confirmar el resumen del traspaso.</small>
          </span>
        </label>
        <label className={[styles.choice, timing === 'later' ? styles.selected : ''].join(' ')}>
          <input type="radio" name="quotation-transfer-timing" value="later"
            checked={timing === 'later'} disabled={pending}
            onChange={() => onTimingChange('later')} />
          <span>
            <strong>Aprobar y traspasar después</strong>
            <small>Por ejemplo, hasta la firma del contrato o el primer pago. La cotización quedará aprobada, con traspaso pendiente.</small>
          </span>
        </label>
      </fieldset>
      {!canTransferNow && (
        <p className={styles.warning}>
          El proyecto no está en «No iniciado». Podrás registrar la aprobación, pero el traspaso
          exige conciliación de la ejecución existente.
        </p>
      )}
      {error && <p role="alert" className={styles.dialogError}>{error}</p>}
    </Modal>
  );
}

type TransferProps = {
  project: ProjectDetail;
  version: QuotationVersion;
  open: boolean;
  afterApproval: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onTransfer: () => void;
};

/** Solo una vista previa comercial: el backend sigue validando el traspaso y
 * protegiendo registros operativos existentes antes de aplicar cualquier dato. */
export function QuotationTransferDialog({
  project, version, open, afterApproval, pending, error, onClose, onTransfer,
}: TransferProps) {
  const teams = version.draft.teams.map((team) => {
    const teamName = project.teams.find((t) => t.teamId === team.teamId)?.teamName ??
      'Equipo Kora';
    const hours = version.draft.mode === 'phases'
      ? version.draft.phases.reduce((sum, phase) =>
          sum + (phase.teamHours.find((row) => row.teamId === team.teamId)?.hours ?? 0), 0)
      : team.collaborators * team.duration * team.hoursPerWeek *
        (team.unit === 'day' ? 1 / 5 : 1) * team.dedicationPercent / 100;
    return { id: team.teamId, name: teamName, collaborators: team.collaborators, hours };
  });
  const weeks = version.draft.phases.length
    ? Math.max(...version.draft.phases.map((phase) => phase.startWeek + phase.durationWeeks - 1))
    : null;
  const entries: { key: string; source: string; target: string }[] = [
    { key: 'approval', source: 'Aprobación', target: 'Tipo de proyecto: Proyecto aprobado' },
    { key: 'hours', source: 'Total de horas',
      target: 'HH vendidas: ' + formatted(version.totalHours) +
        (weeks ? ' · ' + weeks + ' semanas estimadas' : '') },
    ...teams.map((team) => ({
      key: 'team-' + team.id,
      source: team.name,
      target: 'Equipo ' + team.name + ': ' + team.collaborators + ' colaborador' +
        (team.collaborators === 1 ? '' : 'es') + ' · ' +
        formatted(team.hours) + ' horas estimadas',
    })),
    ...(version.draft.phases.length > 0
      ? version.draft.phases.map((phase, index) => ({
          key: 'phase-' + index,
          source: 'Fase ' + (index + 2) + ' · ' + phase.name,
          target: 'Roadmap: fase con equipos y horas de referencia, semanas ' +
            phase.startWeek + ' a ' + (phase.startWeek + phase.durationWeeks - 1) +
            ' · ' + formatted(phase.teamHours.reduce((sum, row) => sum + row.hours, 0)) +
            ' HH',
        }))
      : [{ key: 'phases', source: 'Fases', target: 'La planificación se organizará en el Roadmap según la cotización aprobada.' }]),
    { key: 'net', source: 'Neto', target: version.netAmount == null
      ? 'Monto del contrato: sin valor calculado'
      : 'Monto del contrato: ' + formatted(version.netAmount) + ' ' + version.currency },
    { key: 'plan', source: 'Plan de pago',
      target: 'Tramos: ' + version.draft.paymentPlan.map((item) =>
        item.name + ' ' + formatted(item.percent) + '%').join(' · ') },
    { key: 'version', source: 'Versión aprobada',
      target: 'Documentación → Cotización: v' + version.versionNumber },
    { key: 'commercial', source: 'Valor HH, impuesto, licencias',
      target: 'Resumen comercial (pestaña Cotizaciones)' },
  ];
  return (
    <Modal open={open} title="Traspasar a la ficha del proyecto"
      className={styles.transferDialog} dismissible={!pending} onClose={onClose}
      footer={<div className={styles.actions}>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          {afterApproval ? 'Dejar pendiente' : 'Cancelar'}
        </Button>
        <Button loading={pending} onClick={onTransfer}>Traspasar</Button>
      </div>}>
      <p className={styles.transferIntro}>
        Se completarán los campos comerciales y de planificación de <strong>{project.name}</strong>.
        {' '}Los líderes de equipo, fechas, responsables y registros operativos existentes están
        protegidos por las validaciones de Kora; si requieren conciliación, el traspaso no se realizará automáticamente.
      </p>
      <div className={styles.mapping} aria-label="Resumen del traspaso">
        <span className={styles.columnHead}>COTIZACIÓN V{version.versionNumber}</span>
        <span aria-hidden="true" />
        <span className={styles.columnHead}>EDITAR PROYECTO</span>
        {entries.map((entry) => (
          <div className={styles.mappingRow} key={entry.key}>
            <span className={styles.mappingSource}>{entry.source}</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
            <span className={styles.mappingTarget}>{entry.target}</span>
          </div>
        ))}
      </div>
      {error && <p role="alert" className={styles.dialogError}>{error}</p>}
    </Modal>
  );
}
