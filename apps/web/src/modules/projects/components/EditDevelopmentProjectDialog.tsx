import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUS_LABELS,
  updateProjectSchema,
  type ProjectDetail,
  type ProjectSalesStage,
  type ProjectStatus,
  type UpdateProjectInput,
} from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon, FileTextIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useProjectQuotation } from '@/modules/estimation/api/quotation.queries';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { assignableOptions } from '@/modules/users/lib/assignable-options';
import {
  useChangeProjectStatus,
  useSetProjectOvertimeAuthorization,
  useUpdateProject,
} from '../api/projects.queries';
import {
  PaymentPlanEditor,
  missingApprovalBillingData,
  paymentPlanFromProject,
  paymentPlanPayload,
  validatePaymentPlan,
  type PaymentPlanDraft,
} from './PaymentPlanEditor';
import styles from './EditProjectDialog.module.css';

type FormValues = z.input<typeof updateProjectSchema>;
type ProjectTipo = 'prospecto' | 'cotizacion' | 'aprobado' | 'finalizado';

const tipoOptions: Array<{ value: ProjectTipo; label: string }> = [
  { value: 'prospecto', label: 'Prospecto' },
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'aprobado', label: 'Proyecto aprobado' },
  { value: 'finalizado', label: 'Proyecto finalizado' },
];
const salesStageOf: Record<ProjectTipo, ProjectSalesStage | null> = {
  prospecto: 'prospect', cotizacion: 'quoted', aprobado: 'approved', finalizado: null,
};
const statusOptions: Record<ProjectTipo, ProjectStatus[]> = {
  prospecto: ['draft'],
  cotizacion: ['draft'],
  aprobado: ['draft', 'active', 'on_hold'],
  finalizado: ['finished'],
};
const defaultStatus: Record<ProjectTipo, ProjectStatus> = {
  prospecto: 'draft', cotizacion: 'draft', aprobado: 'draft', finalizado: 'finished',
};
const phaseOptions = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));

function tipoOf(project: ProjectDetail): ProjectTipo {
  if (project.status === 'finished') return 'finalizado';
  return project.salesStage === 'approved' ? 'aprobado'
    : project.salesStage === 'quoted' ? 'cotizacion' : 'prospecto';
}

function formValues(project: ProjectDetail): FormValues {
  // No incluir teams, phases ni módulos: son entidades que se gestionan en
  // «Equipos asignados» y «Roadmap». Evita sobrescribir relaciones al guardar.
  return {
    name: project.name,
    clientId: project.client?.id ?? null,
    leaderUserId: project.leader?.id ?? null,
    commercialManagerUserId: project.commercialManager?.id ?? null,
    salesStage: project.salesStage,
    phase: project.phase,
    startDate: project.startDate,
    endDate: project.endDate,
    soldHours: project.soldHours,
    soldHoursChangeReason: '',
    quotationLink: project.quotationLink ?? '',
    contractLink: project.contractLink ?? '',
    onHoldReason: project.onHoldReason ?? '',
    stopsClock: project.stopsClock,
  };
}

/** Mostrar solo fechas documentadas por el evento de traspaso; nunca usar updatedAt como sustituto. */
const formatTransferDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago',
  }).format(new Date(iso)).replace(/\./g, '');

const quotationLabel: Record<NonNullable<ProjectDetail['quotationStatus']>, string> = {
  none: 'Sin cotización',
  draft: 'Borrador',
  sent: 'Enviada',
  approved_pending: 'Aprobada · traspaso pendiente',
  transferred: 'Traspasada',
  planning_applied: 'Planificación aplicada',
};

export interface EditDevelopmentProjectDialogProps {
  open: boolean;
  project: ProjectDetail;
  isManagement: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onViewQuotations?: () => void;
}

/**
 * Edición administrativa acotada al prototipo Kora v5.02.
 * Equipos/colaboradores se gestionan en «Equipos asignados» y fases,
 * bloques y tareas en «Roadmap»; ningún mutador de estas entidades vive aquí.
 */
export function EditDevelopmentProjectDialog({
  open, project, isManagement, onClose, onSuccess, onViewQuotations,
}: EditDevelopmentProjectDialogProps) {
  const updateProject = useUpdateProject();
  const changeStatus = useChangeProjectStatus();
  const updateOvertime = useSetProjectOvertimeAuthorization();
  const { data: quotation } = useProjectQuotation(project.id, open);
  const transferredVersion = quotation?.versions.find((version) => version.id === quotation.transferredVersionId);
  const latestVersion = [...(quotation?.versions ?? [])]
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const pendingApprovedVersion = quotation?.versions
    .filter((version) => version.status === 'approved')
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const quotationHeading = transferredVersion
    ? `v${transferredVersion.versionNumber} traspasada${quotation?.transferredAt
      ? ` el ${formatTransferDate(quotation.transferredAt)}` : ''}`
    : project.quotationStatus === 'approved_pending' && pendingApprovedVersion
      ? `v${pendingApprovedVersion.versionNumber} aprobada · traspaso pendiente`
      : latestVersion && project.quotationStatus
        ? `v${latestVersion.versionNumber} · ${quotationLabel[project.quotationStatus]}`
        : project.quotationStatus && project.quotationStatus !== 'none'
          ? quotationLabel[project.quotationStatus] : null;
  const [tipo, setTipo] = useState<ProjectTipo>(() => tipoOf(project));
  const [estado, setEstado] = useState<ProjectStatus>(project.status);
  const [isInternal, setIsInternal] = useState(project.isInternal);
  const [allowsOvertime, setAllowsOvertime] = useState(project.allowsOvertime);
  const [manualActivationReason, setManualActivationReason] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanDraft>(() => paymentPlanFromProject(project));
  const [paymentPlanDirty, setPaymentPlanDirty] = useState(false);
  const [paymentPlanError, setPaymentPlanError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [approvalBillingBlocked, setApprovalBillingBlocked] = useState(false);
  const approvalBillingRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, reset, setError, formState: { errors, isSubmitting } } =
    useForm<FormValues, unknown, UpdateProjectInput>({
      resolver: zodResolver(updateProjectSchema),
      defaultValues: formValues(project),
    });

  useEffect(() => {
    if (!open) return;
    reset(formValues(project));
    setTipo(tipoOf(project));
    setEstado(project.status);
    setIsInternal(project.isInternal);
    setAllowsOvertime(project.allowsOvertime);
    setManualActivationReason('');
    setPaymentPlan(paymentPlanFromProject(project));
    setPaymentPlanDirty(false);
    setPaymentPlanError(null);
    setApprovalBillingBlocked(false);
    setServerError(null);
  }, [open, project, reset]);

  const clientId = watch('clientId') ?? '';
  const leaderId = watch('leaderUserId') ?? '';
  const commercialId = watch('commercialManagerUserId') ?? '';
  const soldHours = Number(watch('soldHours'));
  const soldHoursChanged = project.hito0At != null && tipo !== 'prospecto' &&
    soldHours !== project.soldHours;
  const missingHoursReason = soldHoursChanged && !watch('soldHoursChangeReason')?.trim();
  const estimationDisabled = tipo === 'prospecto';
  const statusLocked = tipo !== 'aprobado';
  const manualActivation = tipo === 'aprobado' && project.status === 'draft' && estado === 'active';
  const billingIssue = !isInternal && tipo === 'aprobado' && project.salesStage !== 'approved'
    ? missingApprovalBillingData(paymentPlan) : null;
  const canEditPayment = !isInternal && !estimationDisabled;

  const { data: clients } = useClientsList(
    { page: 1, pageSize: 200, sortField: 'companyName' }, { enabled: open },
  );
  const { data: leaders } = useUsersList(
    { page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' }, { enabled: open },
  );
  const { data: commercialUsers } = useUsersList(
    { page: 1, pageSize: 200, sortField: 'firstName', isCommercialManager: true }, { enabled: open },
  );

  const changeTipo = (next: ProjectTipo) => {
    setTipo(next);
    const mapped = salesStageOf[next];
    if (mapped) setValue('salesStage', mapped, { shouldValidate: true });
    if (!statusOptions[next].includes(estado)) {
      setEstado(next === 'aprobado' && project.hito0At != null
        ? 'active' : defaultStatus[next]);
    }
  };

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    if (!values.commercialManagerUserId) {
      setError('commercialManagerUserId', { message: 'Selecciona el responsable comercial.' });
      return;
    }
    if (manualActivation && !manualActivationReason.trim()) {
      setServerError('Indica el motivo o referencia de la activación manual.');
      return;
    }
    if (missingHoursReason) {
      setError('soldHoursChangeReason', { message: 'Indica el motivo del ajuste de HH vendidas.' });
      return;
    }
    if (billingIssue) {
      setApprovalBillingBlocked(true);
      approvalBillingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const sendPlan = canEditPayment && paymentPlanDirty;
    if (sendPlan) {
      const error = validatePaymentPlan(paymentPlan);
      setPaymentPlanError(error);
      if (error) return;
    }
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: {
          ...values,
          isInternal: isInternal !== project.isInternal ? isInternal : undefined,
          ...(sendPlan ? paymentPlanPayload(paymentPlan) : {}),
        },
      });
      if (estado !== project.status) {
        await changeStatus.mutateAsync({
          projectId: project.id,
          input: { status: estado, ...(manualActivation ? { reason: manualActivationReason.trim() } : {}) },
        });
      }
      if (project.canAuthorizeOvertime && allowsOvertime !== project.allowsOvertime) {
        await updateOvertime.mutateAsync({ projectId: project.id, input: { allowsOvertime } });
      }
      onSuccess(`Se actualizaron los datos de ${values.name ?? project.name}.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.fieldIssues) {
          for (const [field, messages] of Object.entries(error.fieldIssues)) {
            if (field in values && messages[0]) {
              setError(field as keyof FormValues, { message: messages[0] });
            }
          }
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
    }
  });

  return (
    <Modal
      open={open}
      side
      projectEditSide
      title="Editar proyecto"
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
        <Button type="submit" form="edit-project-form" loading={isSubmitting}
          loadingText="Guardando…" disabled={missingHoursReason}>Guardar cambios</Button>
      </>}
    >
      <form id="edit-project-form" className={styles.form} onSubmit={submit} noValidate>
        {serverError && <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{serverError}</span>
        </div>}

        {quotationHeading && (
          <div className={styles.quotationBanner}>
            <span className={styles.quotationBannerText}><FileTextIcon size={14} /> Cotización · {quotationHeading}</span>
            {onViewQuotations && <button type="button" onClick={onViewQuotations}>
              Ver cotizaciones
            </button>}
          </div>
        )}

        <div className={styles.section}>
          <TextField label="Nombre del proyecto" required
            errorText={errors.name?.message} {...register('name')} />
          <Combobox label="Cliente" placeholder="Buscar cliente…"
            options={(clients?.items ?? []).map((c) => ({ value: c.id, label: c.companyName }))}
            value={clientId}
            onChange={(value) => setValue('clientId', value || null, { shouldValidate: true })}
            emptyMessage="No se encontraron clientes." />

          <div className={styles.row}>
            <Select label="Líder Kabeli a cargo" placeholder="Sin asignar"
              disabled={!isManagement}
              helperText={isManagement ? undefined : 'Solo Gerencia/PMO puede reasignar el proyecto a otro líder.'}
              options={assignableOptions(leaders?.items ?? [], (u) =>
                ({ value: u.id, label: u.fullName, status: u.status }), leaderId)}
              value={leaderId}
              onChange={(e) => setValue('leaderUserId', e.target.value || null, { shouldValidate: true })} />
            <Select label="Responsable comercial" placeholder="Sin asignar" required
              helperText="Ejecutivo comercial de Kabeli a cargo de la cuenta."
              errorText={errors.commercialManagerUserId?.message}
              options={assignableOptions(commercialUsers?.items ?? [], (u) =>
                ({ value: u.id, label: u.fullName, status: u.status }), commercialId)}
              value={commercialId}
              onChange={(e) => setValue('commercialManagerUserId', e.target.value || null, { shouldValidate: true })} />
          </div>

          <div className={styles.row3}>
            <Select label="Tipo de proyecto" options={tipoOptions} value={tipo}
              onChange={(e) => changeTipo(e.target.value as ProjectTipo)} />
            <Select label="Estado"
              options={statusOptions[tipo].map((status) => ({
                value: status,
                label: status === 'active' && project.status === 'draft'
                  ? 'Activo (activación manual)' : PROJECT_STATUS_LABELS[status],
              }))}
              value={estado} disabled={statusLocked}
              onChange={(e) => setEstado(e.target.value as ProjectStatus)} />
            <Select label="Etapa de avance" placeholder="Sin definir"
              options={phaseOptions}
              helperText={estado === 'active' ? undefined : 'Solo para proyectos activos.'}
              disabled={estado !== 'active'}
              {...register('phase', { setValueAs: (value: string) => value || null })} />
          </div>

          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={isInternal} disabled={!isManagement}
              onChange={(e) => setIsInternal(e.target.checked)} />
            Proyecto interno
          </label>
          <p className={styles.hint}>
            {isManagement
              ? 'Proyecto de la propia empresa: no lleva monto ni plan de pago, no aparece en Facturación y no envía correos de cobro.'
              : 'Solo Gerencia/PMO puede marcar o desmarcar un proyecto como interno.'}
          </p>

          {billingIssue && <div ref={approvalBillingRef}
            className={approvalBillingBlocked ? styles.alert : styles.warnBox}
            role={approvalBillingBlocked ? 'alert' : 'status'}>
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{billingIssue}</span>
          </div>}

          {estado === 'on_hold' && <div className={styles.field}>
            <label htmlFor="onHoldReason" className={styles.label}>Motivo del detenimiento</label>
            <textarea id="onHoldReason" className={styles.textarea} {...register('onHoldReason')} />
            <label className={styles.checkboxLabel}>
              <input type="checkbox" {...register('stopsClock')} />
              Detener el reloj del proyecto
            </label>
          </div>}
          {manualActivation && <div className={styles.field}>
            <label className={styles.label} htmlFor="manualActivationReason">Motivo de activación manual</label>
            <textarea id="manualActivationReason" className={styles.textarea}
              value={manualActivationReason}
              onChange={(e) => setManualActivationReason(e.target.value)} />
            <p className={styles.hint}>El motivo queda registrado en la bitácora al activar el proyecto.</p>
          </div>}
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Fechas y horas</h3>
          <div className={styles.row3}>
            <TextField label="Fecha de inicio" type="date" disabled={estimationDisabled}
              {...register('startDate', { setValueAs: (v: string) => v || null })} />
            <TextField label="Fecha de fin" type="date" disabled={estimationDisabled}
              {...register('endDate', { setValueAs: (v: string) => v || null })} />
            <TextField label={tipo === 'prospecto' || tipo === 'cotizacion' ? 'HH estimadas' : 'HH vendidas'}
              type="number" min={0} disabled={estimationDisabled}
              errorText={errors.soldHours?.message} {...register('soldHours')} />
          </div>
          {soldHoursChanged && <div className={styles.field}>
            <label className={styles.label} htmlFor="soldHoursChangeReason">Motivo del ajuste de HH vendidas</label>
            <textarea id="soldHoursChangeReason" className={styles.textarea}
              aria-invalid={missingHoursReason || Boolean(errors.soldHoursChangeReason)}
              {...register('soldHoursChangeReason')} />
            {missingHoursReason && <p className={styles.hint} role="alert">
              Debes ingresar un motivo del ajuste de HH vendidas para habilitar «Guardar cambios».
            </p>}
          </div>}
          {project.canAuthorizeOvertime && <div>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={allowsOvertime}
                onChange={(e) => setAllowsOvertime(e.target.checked)} />
              Autorizar horas extra
            </label>
            <p className={styles.hint}>Permite registrar horas marcadas como horas extra en este proyecto.</p>
          </div>}
        </section>

        {!isInternal && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Plan de pago</h3>
          <p className={styles.hint}>
            Cada tramo queda Por facturar cuando se cumple su hito y se avisa por correo a Finanzas y Gerencia.
            Los tramos ya facturados no se editan desde acá.
          </p>
          <PaymentPlanEditor value={paymentPlan} disabled={estimationDisabled}
            onChange={(next) => {
              setPaymentPlan(next);
              setPaymentPlanDirty(true);
              setPaymentPlanError(null);
            }} />
          {paymentPlanError && <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{paymentPlanError}</span>
          </div>}
        </section>}

        <div className={styles.projectStructureInfo}>
          Los equipos, sus líderes, colaboradores y horas se gestionan en la ficha,
          sección <strong>Equipos asignados</strong>.
          Las fases, los bloques de trabajo y las tareas se gestionan en la pestaña
          <strong> Roadmap</strong>.
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Documentación</h3>
          <div className={styles.row}>
            <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
            <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
          </div>
        </section>
      </form>
    </Modal>
  );
}
