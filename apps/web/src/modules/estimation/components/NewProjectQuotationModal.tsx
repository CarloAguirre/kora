import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDetail, QuotationVersion } from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import { useCreateQuotationVersion, useProjectQuotation } from '../api/quotation.queries';
import { AiQuotationWizardModal } from './AiQuotationWizardModal';
import styles from './NewProjectQuotationModal.module.css';
import estimationStyles from './NewEstimationModal.module.css';

type Mode = 'ai' | 'blank' | 'copy';

/** El modal inicia la cotización para ESTE proyecto; los datos de otro
 * proyecto solo se consultan con permisos y nunca se alteran al copiar. */
export function NewProjectQuotationModal({ project, versions, onClose }: {
  project: ProjectDetail;
  versions: readonly QuotationVersion[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('ai');
  const [sourceProjectId, setSourceProjectId] = useState(project.id);
  const [sourceVersionId, setSourceVersionId] = useState('');
  const [error, setError] = useState('');
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const create = useCreateQuotationVersion(project.id);
  const otherProjects = useProjectsList({ type: 'development', page: 1, pageSize: 200 },
    { enabled: mode === 'copy' });
  const source = useProjectQuotation(sourceProjectId, mode === 'copy' && sourceProjectId !== project.id);
  const copyVersions = sourceProjectId === project.id ? versions : source.data?.versions ?? [];
  const selectedVersionId = copyVersions.some((v) => v.id === sourceVersionId)
    ? sourceVersionId : copyVersions[copyVersions.length - 1]?.id ?? '';

  const submit = async () => {
    setError('');
    if (mode === 'ai') {
      setAiWizardOpen(true);
      return;
    }
    if (mode === 'copy' && !selectedVersionId) {
      setError('Elige una cotización de origen para copiar.');
      return;
    }
    try {
      const created = await create.mutateAsync(mode === 'copy'
        ? { sourceVersionId: selectedVersionId,
          ...(sourceProjectId !== project.id ? { sourceProjectId } : {}) }
        : {});
      navigate(projectQuotationPath(project) + '?version=' + created.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la versión.');
    }
  };

  if (aiWizardOpen) {
    return <AiQuotationWizardModal project={project} onClose={onClose} />;
  }

  return (
    <Modal open title="Nueva cotización"
      description={project.name + ' · ' + (project.client?.companyName ?? 'Cliente por confirmar')}
      onClose={onClose} dismissible={!create.isPending}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
        <Button loading={create.isPending} onClick={() => void submit()}>Continuar</Button>
      </>}>
      <fieldset className={estimationStyles.fieldset}>
        <legend>Partir desde</legend>
        <div className={estimationStyles.options}>
        {([
          ['ai', '✦ Con el agente IA',
            'Gemini analiza el documento KDM de ejemplo. Preguntas y HH reales; fuente Drive simulada.'],
          ['blank', 'En blanco',
            'Crea un borrador versionado en PostgreSQL con equipos y horas por definir.'],
          ['copy', 'Copiar otra cotización',
            'Copia datos comerciales de una versión existente sin modificar su proyecto.'],
        ] as const).map(([value, title, description]) => (
          <label key={value}
            className={[estimationStyles.option,
              mode === value ? estimationStyles.optionSelected : ''].filter(Boolean).join(' ')}>
            <input type="radio" name="new-quotation-mode" value={value}
              checked={mode === value} onChange={() => { setMode(value); setError(''); }} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>
        ))}
        </div>
      </fieldset>

      {mode === 'ai' && <p className={styles.demo}>
        <strong>Fuente temporal de demostración: Requerimiento_KDM.pdf.</strong>
        {' '}No se lee la carpeta real del proyecto. Se requiere Gemini configurado;
        no se hará pasar un resultado simulado por uno generado por IA.
      </p>}

      {mode === 'copy' && (
        <div className={styles.copy}>
          <Select label="Proyecto de origen" value={sourceProjectId}
              options={[
                { value: project.id, label: project.name + ' (actual)' },
                ...(otherProjects.data?.items ?? []).filter((item) => item.id !== project.id)
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(event) => { setSourceProjectId(event.target.value); setSourceVersionId(''); }}
            />
          {source.isLoading && <p>Consultando versiones de origen…</p>}
          {source.error && <p role="alert">No tienes acceso a las versiones de ese proyecto.</p>}
          <Select label="Versión a copiar" value={selectedVersionId}
            placeholder={copyVersions.length === 0 ? 'Sin versiones disponibles' : undefined}
            options={copyVersions.map((v) => ({
              value: v.id,
              label: 'v' + v.versionNumber + ' · ' + v.name +
                (v.status === 'draft' ? ' (Borrador)' : ' (Histórica)'),
            }))}
            disabled={source.isLoading || Boolean(source.error)}
            onChange={(event) => setSourceVersionId(event.target.value)}
          />
          <small>La copia se crea como borrador independiente y no hereda la evidencia ni la aceptación IA.</small>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Modal>
  );
}
