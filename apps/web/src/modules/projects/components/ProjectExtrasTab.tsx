import { useState } from 'react';
import {
  PROJECT_PAYMENT_STATUS_LABELS,
  type IssueProjectPaymentMilestoneInvoiceInput,
  type MarkProjectPaymentMilestonePaidInput,
  type ProjectDetail,
  type ProjectPaymentMilestone,
  type ProjectPaymentStatus,
} from '@kora/contracts';
import styles from './ProjectExtrasTab.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { useToast } from '@/shared/components/ui/Toast';
import { PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import {
  useCreateProjectPaymentMilestone,
  useDeleteProjectPaymentMilestone,
  useIssueProjectPaymentMilestoneInvoice,
  useMarkProjectPaymentMilestonePaid,
  useUpdateProjectExtras,
  useUpdateProjectPaymentMilestone,
} from '../api/projects.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { IssueProjectMilestoneInvoiceDialog } from './IssueProjectMilestoneInvoiceDialog';
import { MarkProjectMilestonePaidDialog } from './MarkProjectMilestonePaidDialog';

interface AccessLinksDraft {
  demoLink: string;
  testEnvironmentLink: string;
  figmaLink: string;
  documentationLink: string;
}

interface ImpactDraft {
  impactBeforeHours: string;
  impactBeforePeople: string;
  impactBeforeDuration: string;
  impactBeforeModality: string;
  impactAfterHours: string;
  impactAfterPeople: string;
  impactAfterDuration: string;
  impactAfterModality: string;
}

function toAccessLinksDraft(project: ProjectDetail): AccessLinksDraft {
  return {
    demoLink: project.demoLink ?? '',
    testEnvironmentLink: project.testEnvironmentLink ?? '',
    figmaLink: project.figmaLink ?? '',
    documentationLink: project.documentationLink ?? '',
  };
}

interface QaMetricsDraft {
  qaTestingStartDate: string;
  qaTestingEndDate: string;
  qaEvaluatedModule: string;
  qaPlannedTests: string;
  qaExecutedTests: string;
  qaFailedTests: string;
}

function toQaMetricsDraft(project: ProjectDetail): QaMetricsDraft {
  return {
    qaTestingStartDate: project.qaTestingStartDate ?? '',
    qaTestingEndDate: project.qaTestingEndDate ?? '',
    qaEvaluatedModule: project.qaEvaluatedModule ?? '',
    qaPlannedTests: project.qaPlannedTests != null ? String(project.qaPlannedTests) : '',
    qaExecutedTests: project.qaExecutedTests != null ? String(project.qaExecutedTests) : '',
    qaFailedTests: project.qaFailedTests != null ? String(project.qaFailedTests) : '',
  };
}

function toImpactDraft(project: ProjectDetail): ImpactDraft {
  return {
    impactBeforeHours: project.impactBeforeHours != null ? String(project.impactBeforeHours) : '',
    impactBeforePeople: project.impactBeforePeople ?? '',
    impactBeforeDuration: project.impactBeforeDuration ?? '',
    impactBeforeModality: project.impactBeforeModality ?? '',
    impactAfterHours: project.impactAfterHours != null ? String(project.impactAfterHours) : '',
    impactAfterPeople: project.impactAfterPeople ?? '',
    impactAfterDuration: project.impactAfterDuration ?? '',
    impactAfterModality: project.impactAfterModality ?? '',
  };
}

interface MilestoneDraft {
  name: string;
  percent: string;
  amount: string;
  sortOrder: string;
}

const EMPTY_MILESTONE_DRAFT: MilestoneDraft = { name: '', percent: '', amount: '', sortOrder: '' };

function toMilestoneDraft(milestone: ProjectPaymentMilestone): MilestoneDraft {
  return {
    name: milestone.name,
    percent: milestone.percent != null ? String(milestone.percent) : '',
    amount: String(milestone.amount),
    sortOrder: String(milestone.sortOrder),
  };
}

const MILESTONE_STATUS_TONE: Readonly<Record<ProjectPaymentStatus, BadgeTone>> = {
  pending: 'neutral',
  invoiced: 'info',
  paid: 'success',
};

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');

/**
 * Tab "Extras" de la ficha interna — accesos, datos de impacto en el negocio
 * y (desde "Facturación de Proyectos") el cronograma de tramos de pago. Los
 * dos primeros bloques siguen siendo solo informativos: el portal cliente
 * sigue siendo mock (ver docs/DECISION-PORTAL-CLIENTE.md) y no los lee
 * todavía.
 */
export function ProjectExtrasTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const toast = useToast();
  const { can } = usePermissions();
  const updateProject = useUpdateProjectExtras();
  const [links, setLinks] = useState<AccessLinksDraft>(() => toAccessLinksDraft(project));
  const [impact, setImpact] = useState<ImpactDraft>(() => toImpactDraft(project));
  const [qa, setQa] = useState<QaMetricsDraft>(() => toQaMetricsDraft(project));

  const canManageMilestones = can('projects:manage');
  const canManageBillingActions = can('billing:manage');
  const canViewBilling = canManageMilestones || canManageBillingActions || can('billing:read');

  const createMilestone = useCreateProjectPaymentMilestone();
  const updateMilestone = useUpdateProjectPaymentMilestone();
  const deleteMilestone = useDeleteProjectPaymentMilestone();
  const issueMilestoneInvoice = useIssueProjectPaymentMilestoneInvoice();
  const markMilestonePaid = useMarkProjectPaymentMilestonePaid();

  const [newMilestone, setNewMilestone] = useState<MilestoneDraft>(EMPTY_MILESTONE_DRAFT);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft>(EMPTY_MILESTONE_DRAFT);
  const [invoiceDialogMilestone, setInvoiceDialogMilestone] = useState<ProjectPaymentMilestone | null>(null);
  const [paidDialogMilestone, setPaidDialogMilestone] = useState<ProjectPaymentMilestone | null>(null);

  const sortedMilestones = [...project.paymentMilestones].sort((a, b) => a.sortOrder - b.sortOrder);
  const minMilestoneSortOrder =
    project.paymentMilestones.length > 0 ? Math.min(...project.paymentMilestones.map((m) => m.sortOrder)) : null;

  const onAddMilestone = async () => {
    if (!newMilestone.name.trim() || newMilestone.amount === '') {
      toast.error('Ingresa al menos el nombre y el monto del tramo.');
      return;
    }
    try {
      await createMilestone.mutateAsync({
        projectId: project.id,
        input: {
          name: newMilestone.name.trim(),
          percent: newMilestone.percent === '' ? null : Number(newMilestone.percent),
          amount: Number(newMilestone.amount),
          sortOrder: newMilestone.sortOrder === '' ? undefined : Number(newMilestone.sortOrder),
        },
      });
      toast.success('Se agregó el tramo de pago.');
      setNewMilestone(EMPTY_MILESTONE_DRAFT);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo agregar el tramo.');
    }
  };

  const onStartEditMilestone = (milestone: ProjectPaymentMilestone) => {
    setEditingMilestoneId(milestone.id);
    setMilestoneDraft(toMilestoneDraft(milestone));
  };

  const onSaveMilestone = async () => {
    if (!editingMilestoneId) return;
    try {
      await updateMilestone.mutateAsync({
        projectId: project.id,
        milestoneId: editingMilestoneId,
        input: {
          name: milestoneDraft.name.trim(),
          percent: milestoneDraft.percent === '' ? null : Number(milestoneDraft.percent),
          amount: Number(milestoneDraft.amount),
          sortOrder: milestoneDraft.sortOrder === '' ? undefined : Number(milestoneDraft.sortOrder),
        },
      });
      toast.success('Se guardó el tramo de pago.');
      setEditingMilestoneId(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el tramo.');
    }
  };

  const onDeleteMilestone = async (milestone: ProjectPaymentMilestone) => {
    try {
      await deleteMilestone.mutateAsync({ projectId: project.id, milestoneId: milestone.id });
      toast.success('Se quitó el tramo de pago.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo quitar el tramo.');
    }
  };

  const onConfirmIssueInvoice = async (input: IssueProjectPaymentMilestoneInvoiceInput) => {
    if (!invoiceDialogMilestone) return;
    await issueMilestoneInvoice.mutateAsync({ projectId: project.id, milestoneId: invoiceDialogMilestone.id, input });
    toast.success('Factura registrada correctamente.');
  };

  const onConfirmMarkPaid = async (input: MarkProjectPaymentMilestonePaidInput) => {
    if (!paidDialogMilestone) return;
    await markMilestonePaid.mutateAsync({ projectId: project.id, milestoneId: paidDialogMilestone.id, input });
    toast.success('Pago registrado correctamente.');
  };

  const showHito0Notice =
    paidDialogMilestone !== null &&
    project.salesStage === 'approved' &&
    project.status === 'draft' &&
    paidDialogMilestone.sortOrder === minMilestoneSortOrder;

  const onSaveLinks = async () => {
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: {
          demoLink: links.demoLink || null,
          testEnvironmentLink: links.testEnvironmentLink || null,
          figmaLink: links.figmaLink || null,
          documentationLink: links.documentationLink || null,
        },
      });
      toast.success('Se guardaron los accesos y enlaces.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudieron guardar los enlaces.');
    }
  };

  const onSaveImpact = async () => {
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: {
          impactBeforeHours: impact.impactBeforeHours === '' ? null : Number(impact.impactBeforeHours),
          impactBeforePeople: impact.impactBeforePeople || null,
          impactBeforeDuration: impact.impactBeforeDuration || null,
          impactBeforeModality: impact.impactBeforeModality || null,
          impactAfterHours: impact.impactAfterHours === '' ? null : Number(impact.impactAfterHours),
          impactAfterPeople: impact.impactAfterPeople || null,
          impactAfterDuration: impact.impactAfterDuration || null,
          impactAfterModality: impact.impactAfterModality || null,
        },
      });
      toast.success('Se guardaron los datos de impacto.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudieron guardar los datos de impacto.');
    }
  };

  const onSaveQa = async () => {
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        input: {
          qaTestingStartDate: qa.qaTestingStartDate || null,
          qaTestingEndDate: qa.qaTestingEndDate || null,
          qaEvaluatedModule: qa.qaEvaluatedModule || null,
          qaPlannedTests: qa.qaPlannedTests === '' ? null : Number(qa.qaPlannedTests),
          qaExecutedTests: qa.qaExecutedTests === '' ? null : Number(qa.qaExecutedTests),
          qaFailedTests: qa.qaFailedTests === '' ? null : Number(qa.qaFailedTests),
        },
      });
      toast.success('Se guardaron las métricas QA.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudieron guardar las métricas QA.');
    }
  };

  const before = Number(impact.impactBeforeHours);
  const after = Number(impact.impactAfterHours);
  const reductionPct =
    impact.impactBeforeHours !== '' && impact.impactAfterHours !== '' && before > 0
      ? Math.round(((before - after) / before) * 100)
      : null;

  return (
    <div className={styles.wrap}>
      <Card>
        <p className={styles.title}>Accesos y enlaces</p>
        <p className={styles.hint}>Enlaces de referencia para el equipo — todavía no se muestran en el portal cliente.</p>
        <div className={styles.row}>
          <TextField
            label="Link de demo"
            placeholder="https://..."
            disabled={!canManage}
            value={links.demoLink}
            onChange={(event) => setLinks((prev) => ({ ...prev, demoLink: event.target.value }))}
          />
          <TextField
            label="Link ambiente de prueba"
            placeholder="https://..."
            disabled={!canManage}
            value={links.testEnvironmentLink}
            onChange={(event) => setLinks((prev) => ({ ...prev, testEnvironmentLink: event.target.value }))}
          />
        </div>
        <div className={styles.row}>
          <TextField
            label="Link Figma"
            placeholder="https://..."
            disabled={!canManage}
            value={links.figmaLink}
            onChange={(event) => setLinks((prev) => ({ ...prev, figmaLink: event.target.value }))}
          />
          <TextField
            label="Link documentación"
            placeholder="https://..."
            disabled={!canManage}
            value={links.documentationLink}
            onChange={(event) => setLinks((prev) => ({ ...prev, documentationLink: event.target.value }))}
          />
        </div>
        {canManage && (
          <Button type="button" size="sm" className={styles.saveButton} loading={updateProject.isPending} onClick={() => void onSaveLinks()}>
            Guardar cambios
          </Button>
        )}
      </Card>

      <Card>
        <p className={styles.title}>Datos de impacto en el negocio</p>
        <p className={styles.hint}>Proceso manual vs. proceso automatizado.</p>
        <div className={styles.impactCols}>
          <div className={styles.impactCol}>
            <span className={styles.impactColLabel}>Antes de automatizar</span>
            <TextField
              label="Tiempo total del proceso (horas)"
              type="number"
              step="0.1"
              disabled={!canManage}
              value={impact.impactBeforeHours}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactBeforeHours: event.target.value }))}
            />
            <TextField
              label="Personas involucradas"
              disabled={!canManage}
              value={impact.impactBeforePeople}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactBeforePeople: event.target.value }))}
            />
            <TextField
              label="Duración calendario"
              disabled={!canManage}
              value={impact.impactBeforeDuration}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactBeforeDuration: event.target.value }))}
            />
            <TextField
              label="Modalidad"
              disabled={!canManage}
              value={impact.impactBeforeModality}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactBeforeModality: event.target.value }))}
            />
          </div>
          <div className={styles.impactCol}>
            <span className={styles.impactColLabel}>Después (medido en QA / Marcha blanca)</span>
            <TextField
              label="Tiempo total del proceso (horas)"
              type="number"
              step="0.1"
              disabled={!canManage}
              value={impact.impactAfterHours}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactAfterHours: event.target.value }))}
            />
            <TextField
              label="Personas involucradas"
              disabled={!canManage}
              value={impact.impactAfterPeople}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactAfterPeople: event.target.value }))}
            />
            <TextField
              label="Duración calendario"
              disabled={!canManage}
              value={impact.impactAfterDuration}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactAfterDuration: event.target.value }))}
            />
            <TextField
              label="Modalidad"
              disabled={!canManage}
              value={impact.impactAfterModality}
              onChange={(event) => setImpact((prev) => ({ ...prev, impactAfterModality: event.target.value }))}
            />
          </div>
        </div>
        <p className={styles.reduction}>
          Reducción de tiempo de proceso: <b>{reductionPct !== null ? `${reductionPct}%` : '—'}</b>
        </p>
        {canManage && (
          <Button type="button" size="sm" className={styles.saveButton} loading={updateProject.isPending} onClick={() => void onSaveImpact()}>
            Guardar cambios
          </Button>
        )}
      </Card>

      <Card>
        <p className={styles.title}>Métricas QA</p>
        <p className={styles.hint}>Datos de la etapa de pruebas que se muestran en la vista de seguimiento del cliente.</p>
        <div className={styles.row}>
          <TextField
            label="Inicio de pruebas"
            type="date"
            disabled={!canManage}
            value={qa.qaTestingStartDate}
            onChange={(event) => setQa((prev) => ({ ...prev, qaTestingStartDate: event.target.value }))}
          />
          <TextField
            label="Fin de pruebas"
            type="date"
            disabled={!canManage}
            value={qa.qaTestingEndDate}
            onChange={(event) => setQa((prev) => ({ ...prev, qaTestingEndDate: event.target.value }))}
          />
        </div>
        <TextField
          label="Módulo evaluado"
          placeholder="tickets"
          disabled={!canManage}
          value={qa.qaEvaluatedModule}
          onChange={(event) => setQa((prev) => ({ ...prev, qaEvaluatedModule: event.target.value }))}
        />
        <div className={styles.row3}>
          <TextField
            label="Pruebas planificadas"
            type="number"
            min={0}
            disabled={!canManage}
            value={qa.qaPlannedTests}
            onChange={(event) => setQa((prev) => ({ ...prev, qaPlannedTests: event.target.value }))}
          />
          <TextField
            label="Pruebas ejecutadas"
            type="number"
            min={0}
            disabled={!canManage}
            value={qa.qaExecutedTests}
            onChange={(event) => setQa((prev) => ({ ...prev, qaExecutedTests: event.target.value }))}
          />
          <TextField
            label="Pruebas con error"
            type="number"
            min={0}
            disabled={!canManage}
            value={qa.qaFailedTests}
            onChange={(event) => setQa((prev) => ({ ...prev, qaFailedTests: event.target.value }))}
          />
        </div>
        {canManage && (
          <Button type="button" size="sm" className={styles.saveButton} loading={updateProject.isPending} onClick={() => void onSaveQa()}>
            Guardar cambios
          </Button>
        )}
      </Card>

      {canViewBilling && (
        <Card>
          <p className={styles.title}>Facturación del proyecto</p>
          <p className={styles.hint}>Cronograma de tramos de pago — pagar el primer tramo puede activar el proyecto (Hito 0).</p>

          {sortedMilestones.length === 0 ? (
            <p className={styles.hint}>Este proyecto todavía no tiene tramos de pago configurados.</p>
          ) : (
            <div className={styles.milestoneList}>
              {sortedMilestones.map((milestone) =>
                editingMilestoneId === milestone.id ? (
                  <div key={milestone.id} className={styles.milestoneEditRow}>
                    <TextField
                      label="Nombre"
                      value={milestoneDraft.name}
                      onChange={(e) => setMilestoneDraft((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <TextField
                      label="Porcentaje"
                      type="number"
                      min={0}
                      max={100}
                      value={milestoneDraft.percent}
                      onChange={(e) => setMilestoneDraft((prev) => ({ ...prev, percent: e.target.value }))}
                    />
                    <TextField
                      label="Monto"
                      type="number"
                      min={0}
                      value={milestoneDraft.amount}
                      onChange={(e) => setMilestoneDraft((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                    <TextField
                      label="Orden"
                      type="number"
                      min={0}
                      value={milestoneDraft.sortOrder}
                      onChange={(e) => setMilestoneDraft((prev) => ({ ...prev, sortOrder: e.target.value }))}
                    />
                    <div className={styles.milestoneEditActions}>
                      <Button variant="outline" size="sm" onClick={() => setEditingMilestoneId(null)} disabled={updateMilestone.isPending}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => void onSaveMilestone()} loading={updateMilestone.isPending}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={milestone.id} className={styles.milestoneRow}>
                    <div className={styles.milestoneInfo}>
                      <span className={styles.milestoneName}>{milestone.name}</span>
                      <span className={styles.milestoneMeta}>
                        {milestone.percent != null ? `${milestone.percent}% · ` : ''}
                        {milestone.amount.toLocaleString('es-CL', { maximumFractionDigits: 2 })}
                        {milestone.invoiceNumber ? ` · Folio ${milestone.invoiceNumber}` : ''}
                        {milestone.issuedAt ? ` · Emitido ${formatDate(milestone.issuedAt)}` : ''}
                        {milestone.paidAt ? ` · Pagado ${formatDate(milestone.paidAt)}` : ''}
                      </span>
                    </div>

                    <Badge tone={MILESTONE_STATUS_TONE[milestone.status]}>{PROJECT_PAYMENT_STATUS_LABELS[milestone.status]}</Badge>

                    <div className={styles.milestoneActions}>
                      {canManageMilestones && milestone.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => onStartEditMilestone(milestone)} aria-label={`Editar ${milestone.name}`}>
                            <PencilIcon size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void onDeleteMilestone(milestone)}
                            aria-label={`Quitar ${milestone.name}`}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        </>
                      )}
                      {canManageBillingActions && milestone.status === 'pending' && (
                        <Button size="sm" onClick={() => setInvoiceDialogMilestone(milestone)}>
                          Subir factura
                        </Button>
                      )}
                      {canManageBillingActions && milestone.status === 'invoiced' && (
                        <Button size="sm" onClick={() => setPaidDialogMilestone(milestone)}>
                          Marcar pagado
                        </Button>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {canManageMilestones && (
            <div className={styles.milestoneAddForm}>
              <TextField
                label="Nombre del tramo"
                placeholder="Ej: Marcha blanca"
                value={newMilestone.name}
                onChange={(e) => setNewMilestone((prev) => ({ ...prev, name: e.target.value }))}
              />
              <TextField
                label="Porcentaje (opcional)"
                type="number"
                min={0}
                max={100}
                value={newMilestone.percent}
                onChange={(e) => setNewMilestone((prev) => ({ ...prev, percent: e.target.value }))}
              />
              <TextField
                label="Monto"
                type="number"
                min={0}
                value={newMilestone.amount}
                onChange={(e) => setNewMilestone((prev) => ({ ...prev, amount: e.target.value }))}
              />
              <TextField
                label="Orden (opcional)"
                type="number"
                min={0}
                value={newMilestone.sortOrder}
                onChange={(e) => setNewMilestone((prev) => ({ ...prev, sortOrder: e.target.value }))}
              />
              <Button size="sm" onClick={() => void onAddMilestone()} loading={createMilestone.isPending} loadingText="Agregando…">
                Agregar tramo
              </Button>
            </div>
          )}
        </Card>
      )}

      <IssueProjectMilestoneInvoiceDialog
        open={invoiceDialogMilestone !== null}
        milestoneName={invoiceDialogMilestone?.name ?? ''}
        amount={invoiceDialogMilestone?.amount ?? 0}
        onClose={() => setInvoiceDialogMilestone(null)}
        onConfirm={onConfirmIssueInvoice}
      />

      <MarkProjectMilestonePaidDialog
        open={paidDialogMilestone !== null}
        milestoneName={paidDialogMilestone?.name ?? ''}
        showHito0Notice={showHito0Notice}
        onClose={() => setPaidDialogMilestone(null)}
        onConfirm={onConfirmMarkPaid}
      />
    </div>
  );
}
