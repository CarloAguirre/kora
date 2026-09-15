import { useState } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import styles from './ProjectExtrasTab.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { useUpdateProject } from '../api/projects.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

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

/**
 * Tab "Extras" de la ficha interna — accesos y datos de impacto en el
 * negocio. Solo informativo por ahora: el portal cliente sigue siendo mock
 * (ver docs/DECISION-PORTAL-CLIENTE.md) y no lee estos campos todavía.
 */
export function ProjectExtrasTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const toast = useToast();
  const updateProject = useUpdateProject();
  const [links, setLinks] = useState<AccessLinksDraft>(() => toAccessLinksDraft(project));
  const [impact, setImpact] = useState<ImpactDraft>(() => toImpactDraft(project));
  const [qa, setQa] = useState<QaMetricsDraft>(() => toQaMetricsDraft(project));

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
    </div>
  );
}
