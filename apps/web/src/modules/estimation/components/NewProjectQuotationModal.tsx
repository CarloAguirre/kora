import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDetail, QuotationVersion } from '@kora/contracts';
import { projectEstimationPath, projectQuotationPath } from '@/app/router/paths';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useCreateQuotationVersion, useProjectQuotation } from '../api/quotation.queries';
import { DEMO_KDM_FOLDER_URL } from '../lib/demo-source';
import styles from './NewProjectQuotationModal.module.css';

type Mode = 'ai' | 'blank' | 'copy';

/** El modal inicia la cotización para ESTE proyecto; los datos de otro
 * proyecto solo se consultan con permisos y nunca se alteran al copiar. */
export function NewProjectQuotationModal({ project, versions, onClose }: {
  project: ProjectDetail;
  versions: readonly QuotationVersion[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [mode, setMode] = useState<Mode>('ai');
  const [sourceProjectId, setSourceProjectId] = useState(project.id);
  const [sourceVersionId, setSourceVersionId] = useState('');
  const [error, setError] = useState('');
  const create = useCreateQuotationVersion(project.id);
  const otherProjects = useProjectsList({ type: 'development', page: 1, pageSize: 200 },
    { enabled: can('projects:manage') && mode === 'copy' });
  const source = useProjectQuotation(sourceProjectId, mode === 'copy' && sourceProjectId !== project.id);
  const copyVersions = sourceProjectId === project.id ? versions : source.data?.versions ?? [];
  const selectedVersionId = copyVersions.some((v) => v.id === sourceVersionId)
    ? sourceVersionId : copyVersions[copyVersions.length - 1]?.id ?? '';

  const submit = async () => {
    setError('');
    if (mode === 'ai') {
      navigate(projectEstimationPath(project) + '?mode=ai&demo=kdm', {
        state: {
          creationMode: 'ai',
          driveFolderUrl: DEMO_KDM_FOLDER_URL,
          demoSource: 'kdm',
        },
      });
      onClose();
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

  return (
    <Modal open title="Nueva cotización"
      description={project.name + ' · ' + (project.client?.companyName ?? 'Cliente por confirmar')}
      onClose={onClose} dismissible={!create.isPending}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
        <Button loading={create.isPending} onClick={() => void submit()}>Continuar</Button>
      </>}>
      <fieldset className={styles.choices}>
        <legend>Partir desde</legend>
        {([
          ['ai', '✦ Con el agente IA',
            'Gemini analiza el documento KDM de ejemplo. Preguntas y HH reales; fuente Drive simulada.'],
          ['blank', 'En blanco',
            'Crea un borrador versionado en PostgreSQL con equipos y horas por definir.'],
          ['copy', 'Copiar otra cotización',
            'Copia datos comerciales de una versión existente sin modificar su proyecto.'],
        ] as const).map(([value, title, description]) => (
          <label key={value} className={mode === value ? styles.active : styles.choice}>
            <input type="radio" name="new-quotation-mode" value={value}
              checked={mode === value} onChange={() => { setMode(value); setError(''); }} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>
        ))}
      </fieldset>

      {mode === 'ai' && <p className={styles.demo}>
        <strong>Fuente temporal de demostración: Requerimiento_KDM.pdf.</strong>
        {' '}No se lee la carpeta real del proyecto. Se requiere Gemini configurado;
        no se hará pasar un resultado simulado por uno generado por IA.
      </p>}

      {mode === 'copy' && (
        <div className={styles.copy}>
          {can('projects:manage') && (
            <label>Proyecto de origen
              <select aria-label="Proyecto de origen" value={sourceProjectId}
                onChange={(event) => { setSourceProjectId(event.target.value); setSourceVersionId(''); }}>
                <option value={project.id}>{project.name} (actual)</option>
                {(otherProjects.data?.items ?? []).filter((item) => item.id !== project.id)
                  .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          {source.isLoading && <p>Consultando versiones de origen…</p>}
          {source.error && <p role="alert">No tienes acceso a las versiones de ese proyecto.</p>}
          <label>Versión a copiar
            <select aria-label="Versión a copiar" value={selectedVersionId}
              onChange={(event) => setSourceVersionId(event.target.value)}>
              {copyVersions.length === 0 && <option value="">Sin versiones disponibles</option>}
              {copyVersions.map((v) => <option key={v.id} value={v.id}>
                v{v.versionNumber} · {v.name} ({v.status === 'draft' ? 'Borrador' : 'Histórica'})
              </option>)}
            </select>
          </label>
          <small>La copia se crea como borrador independiente y no hereda la evidencia ni la aceptación IA.</small>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Modal>
  );
}
