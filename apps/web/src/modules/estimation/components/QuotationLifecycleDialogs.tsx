import type { ProjectDetail, QuotationVersion } from '@kora/contracts';
import { soldHoursAreCommercialEstimate } from '@kora/contracts';
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
  const canTransferNow = project.status === 'draft' || project.status === 'active';
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
      {project.status === 'active' && (
        <p className={styles.warning}>
          El proyecto está Activo. Puedes traspasar la cotización aunque tenga fecha de inicio,
          fases o registros de horas. Kora agregará la nueva planificación sin reiniciar las HH
          consumidas ni reemplazar las fases y pagos históricos.
        </p>
      )}
      {!canTransferNow && (
        <p className={styles.warning}>
          Este estado operativo no permite un traspaso inicial. Puedes aprobar la versión y
          dejar el traspaso pendiente.
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
  /** Nombres del catálogo de equipos: antes del primer traspaso los equipos
   * cotizados todavía no están en `project.teams`. */
  teamNames?: ReadonlyMap<string, string>;
  afterApproval: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onTransfer: () => void;
};

/** Solo una vista previa comercial: el backend sigue validando el traspaso y
 * protegiendo registros operativos existentes antes de aplicar cualquier dato. */
export function QuotationTransferDialog({
  project, version, open, teamNames, afterApproval, pending, error, onClose, onTransfer,
}: TransferProps) {
  const teams = version.draft.teams.map((team) => {
    const teamName = project.teams.find((t) => t.teamId === team.teamId)?.teamName ??
      teamNames?.get(team.teamId) ?? 'Equipo sin nombre';
    const hours = version.draft.mode === 'phases'
      ? version.draft.phases.reduce((sum, phase) =>
          sum + (phase.teamHours.find((row) => row.teamId === team.teamId)?.hours ?? 0), 0)
      : team.collaborators * team.duration * team.hoursPerWeek *
        (team.unit === 'day' ? 1 / 5 : 1) * team.dedicationPercent / 100;
    return { id: team.teamId, name: teamName, collaborators: team.collaborators, hours };
  });
  const previousTeamHours = project.teams.reduce((sum, row) =>
    sum + (row.assignedHours ?? 0), 0);
  // Mismo criterio que el backend: sin Roadmap ni contrato, las HH vendidas
  // actuales son las «HH estimadas» de Prospecto/Cotización y se reemplazan.
  const replacesEstimate = soldHoursAreCommercialEstimate({
    moduleCount: project.modules?.length ?? 0, contractAmount: project.contractAmount ?? null,
  });
  const currentSoldHours = project.soldHours ?? 0;
  const previousSoldHours = replacesEstimate ? 0 : currentSoldHours;
  const historicalConsumed = project.usedHours ?? 0;
  const historicalBillable = version.draft.phaseZeroBillableHours ?? 0;
  const hasHistoricalPhase = project.teams.length > 0 ||
    currentSoldHours > 0 || historicalConsumed > 0;
  const quotedTeamIds = new Set(teams.map((row) => row.id));
  const weeks = version.draft.phases.length
    ? Math.max(...version.draft.phases.map((phase) => phase.startWeek + phase.durationWeeks - 1))
    : null;
  const entries: { key: string; source: string; target: string }[] = [
    { key: 'approval', source: 'Aprobación', target: 'Tipo de proyecto: Proyecto aprobado' },
    ...(hasHistoricalPhase ? [
      { key: 'phase1', source: 'Presupuesto previo del proyecto',
        target: formatted(previousTeamHours) + (replacesEstimate
          ? ' HH estimadas por equipo, reemplazadas por la cotización. '
          : ' HH previamente asignadas que se mantienen. ') +
          formatted(historicalConsumed) + ' HH consumidas históricas conservadas (sin sumarlas otra vez).' },
      replacesEstimate
        ? { key: 'previous-sold', source: 'HH estimadas (Prospecto/Cotización)',
            target: formatted(currentSoldHours) + ' HH; se reemplazan por la cotización aprobada.' }
        : { key: 'previous-sold', source: 'HH vendidas anteriores',
            target: formatted(previousSoldHours) + ' HH; no se reemplazan.' },
    ] : []),
    { key: 'hours', source: 'Nuevas fases · Cotización',
      target: formatted(version.totalHours) + ' HH nuevas' +
        (weeks ? ' · ' + weeks + ' semanas estimadas' : '') },
    ...(historicalBillable > 0 ? [{
      key: 'phase-zero-charge', source: 'Fase 0 · Levantamiento cobrable',
      target: formatted(historicalBillable) +
        ' HH ya consumidas, incorporadas al precio sin crear nuevas tareas.',
    }] : []),
    { key: 'total-project-hours', source: 'Total HH vendidas tras traspaso',
      target: formatted(previousSoldHours + version.totalHours + historicalBillable) +
        (replacesEstimate
          ? (historicalBillable > 0 ? ' HH (fases futuras + Fase 0)' : ' HH (cotización)')
          : historicalBillable > 0
            ? ' HH (anteriores + fases futuras + Fase 0)'
            : ' HH (anteriores + cotización)') },
    ...teams.map((team) => {
      const existing = project.teams.find((item) => item.teamId === team.id);
      const prior = existing?.assignedHours ?? 0;
      const label = (/^equipo\b/i.test(team.name) ? team.name : 'Equipo ' + team.name) + ': ' +
        (existing ? 'se conservan cupo, líder e integrantes · ' : '');
      return {
        key: 'team-' + team.id, source: team.name,
        target: label + (replacesEstimate
          ? (existing?.assignedHours != null
              ? formatted(prior) + ' HH estimadas se reemplazan por '
              : '') + formatted(team.hours) + ' HH asignadas'
          : formatted(prior) + ' HH previas + ' + formatted(team.hours) +
            ' HH nuevas = ' + formatted(prior + team.hours) + ' HH asignadas'),
      };
    }),
    ...project.teams.filter((team) => !quotedTeamIds.has(team.teamId))
      .map((team) => ({
        key: 'historic-team-' + team.teamId, source: team.teamName,
        target: 'Equipo histórico conservado: ' +
          (team.assignedHours === null ? 'sin presupuesto declarado' :
            replacesEstimate
              ? formatted(team.assignedHours) + ' HH estimadas que quedan sin presupuesto (no está en la cotización)'
              : formatted(team.assignedHours) + ' HH previas') +
          ' · cupo, líder e integrantes sin cambios',
      })),
    ...(version.draft.phases.length > 0
      ? version.draft.phases.map((phase, index) => ({
          key: 'phase-' + index,
          source: 'Fase nueva ' + (index + 1) + ' · ' + phase.name,
          target: 'Roadmap: fase con equipos y horas de referencia, semanas ' +
            phase.startWeek + ' a ' + (phase.startWeek + phase.durationWeeks - 1) +
            ' · ' + formatted(phase.teamHours.reduce((sum, row) => sum + row.hours, 0)) +
            ' HH',
        }))
      : [{ key: 'phases', source: 'Fases', target: 'La planificación se organizará en el Roadmap según la cotización aprobada.' }]),
    { key: 'net', source: 'Neto de esta cotización', target: version.netAmount == null
      ? 'Esta cotización no tiene un valor neto calculado'
      : 'Valor neto nuevo: ' + formatted(version.netAmount) + ' ' + version.currency },
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
        Se agregarán las fases y HH de la cotización aprobada a <strong>{project.name}</strong>.
        {' '}Las HH consumidas, módulos, equipos y asignaciones anteriores permanecen intactos.
        {historicalConsumed > 0
          ? ' Como existe trabajo histórico de Fase 0, las fases nuevas comienzan el día del traspaso, sin superponer horas pasadas.'
          : ' Las fases nuevas toman la fecha de inicio que ya tenga registrada el proyecto.'}
        {' '}Los pagos emitidos también se conservan.
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
