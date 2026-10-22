import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  EstimationCreationMode,
  EstimationDriveFolderResolution,
  EstimationDriveInventory,
  EstimationDriveInventoryItem,
  ProjectSummary,
} from '@kora/contracts';
import { projectEstimationPath } from '@/app/router/paths';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import {
  useEstimationDriveInventory,
  useResolveEstimationDriveFolder,
} from '../api/estimation.queries';
import styles from './NewEstimationModal.module.css';

interface NewEstimationModalProps {
  open: boolean;
  prospects: readonly ProjectSummary[];
  onClose: () => void;
}

const MODE_OPTIONS: readonly {
  value: EstimationCreationMode;
  title: string;
  description: string;
}[] = [
  {
    value: 'ai',
    title: '✦ Propuesta del agente IA',
    description:
      'Lee los antecedentes relevantes de Drive y propone roles, horas y supuestos para una estimación inicial.',
  },
  {
    value: 'standard',
    title: 'Plantilla estándar',
    description:
      'Desarrollo, Líder, QA, Arquitecto, IA, PMO y UX como base editable.',
  },
  {
    value: 'rpa',
    title: 'Plantilla RPA',
    description:
      'Dev RPA, Líder, QA, Arquitecto, Dev IA, PMO y marcha blanca como base editable.',
  },
];

export function NewEstimationModal({ open, prospects, onClose }: NewEstimationModalProps) {
  const navigate = useNavigate();
  const [projectRef, setProjectRef] = useState('');
  const [mode, setMode] = useState<EstimationCreationMode>('ai');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [driveTouched, setDriveTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => prospects.find((project) => project.slug === projectRef || project.id === projectRef) ?? null,
    [projectRef, prospects],
  );
  const detail = useProjectDetail(selected?.slug ?? null);

  const resolutionInput = useMemo(() => {
    if (!detail.data) return null;
    return {
      projectId: detail.data.id,
      projectName: detail.data.name,
      clientName: detail.data.client?.companyName ?? null,
      documentationLink: detail.data.documentationLink,
      quotationLink: detail.data.quotationLink,
    };
  }, [detail.data]);

  const driveResolution = useResolveEstimationDriveFolder(
    resolutionInput,
    open && mode === 'ai' && Boolean(selected),
  );

  const driveUrlIsValid = isGoogleDriveFolderUrl(driveFolderUrl);
  const driveInventory = useEstimationDriveInventory(
    driveFolderUrl.trim(),
    open && mode === 'ai' && driveUrlIsValid,
  );

  useEffect(() => {
    if (!open) {
      setProjectRef('');
      setMode('ai');
      setDriveFolderUrl('');
      setInstructions('');
      setDriveTouched(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!selected) {
      setDriveFolderUrl('');
      return;
    }
    if (driveTouched) return;

    const explicit = detail.data?.documentationLink ?? '';
    if (isGoogleDriveFolderUrl(explicit)) {
      setDriveFolderUrl(explicit);
      return;
    }

    const resolved = driveResolution.data?.selectedFolder?.url ?? '';
    setDriveFolderUrl(isGoogleDriveFolderUrl(resolved) ? resolved : '');
  }, [
    detail.data?.documentationLink,
    driveResolution.data?.selectedFolder?.url,
    driveTouched,
    selected,
  ]);

  const projectOptions = prospects.map((project) => ({
    value: project.slug,
    label: `${project.client?.companyName ?? 'Cliente por confirmar'} — ${project.name}`,
  }));

  const submit = () => {
    if (!selected) {
      setError('Elige un prospecto en cotización.');
      return;
    }
    if (mode === 'ai' && !driveFolderUrl.trim()) {
      setError('Confirma o vincula la carpeta de Drive del levantamiento para usar el agente IA.');
      return;
    }

    navigate(`${projectEstimationPath(selected)}?mode=${mode}`, {
      state: {
        creationMode: mode,
        driveFolderUrl: driveFolderUrl.trim(),
        instructions: instructions.trim(),
      },
    });
    onClose();
  };

  const selectCandidate = (url: string) => {
    setDriveTouched(true);
    setDriveFolderUrl(url);
    setError(null);
  };

  return (
    <Modal
      open={open}
      title="Nueva estimación"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Crear estimación</Button>
        </>
      }
    >
      <Select
        label="Prospecto"
        placeholder="Elige un prospecto"
        value={projectRef}
        onChange={(event) => {
          setProjectRef(event.target.value);
          setDriveTouched(false);
          setDriveFolderUrl('');
          setError(null);
        }}
        options={projectOptions}
        helperText="Solo aparecen prospectos en cotización. Los proyectos ya aprobados o en ejecución no se seleccionan aquí."
      />

      <fieldset className={styles.fieldset}>
        <legend>Partir desde</legend>
        <div className={styles.options}>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={[
                styles.option,
                mode === option.value ? styles.optionSelected : '',
              ].filter(Boolean).join(' ')}
            >
              <input
                type="radio"
                name="estimation-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => {
                  setMode(option.value);
                  setError(null);
                }}
              />
              <span>
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
          <div className={styles.optionDisabled} aria-disabled="true">
            <span className={styles.fakeRadio} />
            <span>
              <strong>Copiar una estimación existente</strong>
              <small>Se habilitará cuando el historial de estimaciones quede persistido.</small>
            </span>
          </div>
        </div>
      </fieldset>

      {mode === 'ai' && (
        <div className={styles.driveBox}>
          <TextField
            label="Carpeta de Drive del levantamiento"
            type="url"
            value={driveFolderUrl}
            onChange={(event) => {
              setDriveTouched(true);
              setDriveFolderUrl(event.target.value);
              setError(null);
            }}
            placeholder="https://drive.google.com/drive/folders/…"
            helperText={
              detail.isLoading
                ? 'Buscando antecedentes del prospecto…'
                : driveFolderUrl
                  ? 'Kora usará esta carpeta como fuente documental de la estimación.'
                  : 'Kora intenta descubrir una carpeta por proyecto/cliente; también puedes pegarla manualmente.'
            }
          />

          <DriveResolutionPreview
            loading={driveResolution.isLoading || driveResolution.isFetching}
            resolution={driveResolution.data}
            hasSelectedFolder={driveUrlIsValid}
            onSelect={selectCandidate}
          />

          <DriveInventoryPreview
            loading={driveInventory.isLoading || driveInventory.isFetching}
            inventory={driveInventory.data}
          />

          <label className={styles.instructions}>
            <span>Indicaciones para el agente (opcional)</span>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Ej. Considerar solo el módulo de despacho; el cliente ya tiene licencias."
            />
          </label>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </Modal>
  );
}

function DriveResolutionPreview({
  loading,
  resolution,
  hasSelectedFolder,
  onSelect,
}: {
  loading: boolean;
  resolution: EstimationDriveFolderResolution | undefined;
  hasSelectedFolder: boolean;
  onSelect: (url: string) => void;
}) {
  if (loading && !hasSelectedFolder) {
    return <div className={styles.driveStatus}>Buscando carpeta del proyecto en Drive…</div>;
  }

  if (!resolution || hasSelectedFolder) return null;

  if (resolution.connection !== 'connected') {
    return <div className={styles.driveWarning}>{resolution.message}</div>;
  }

  if (resolution.status === 'not_found') {
    return (
      <div className={styles.driveWarning}>
        {resolution.message} Puedes pegar la carpeta manualmente.
      </div>
    );
  }

  if (resolution.candidates.length === 0) return null;

  return (
    <div className={styles.candidates}>
      <div className={styles.candidateTitle}>
        <strong>Carpetas candidatas</strong>
        <span>Confirma la fuente correcta antes de analizar.</span>
      </div>
      {resolution.candidates.slice(0, 4).map((candidate) => (
        <button
          key={candidate.folderId}
          type="button"
          className={styles.candidate}
          onClick={() => onSelect(candidate.url)}
        >
          <span>
            <strong>{candidate.name}</strong>
            {candidate.ancestorNames.length > 0 && (
              <small>{candidate.ancestorNames.join(' / ')}</small>
            )}
          </span>
          <b>{candidate.score}%</b>
        </button>
      ))}
    </div>
  );
}

function DriveInventoryPreview({
  loading,
  inventory,
}: {
  loading: boolean;
  inventory: EstimationDriveInventory | undefined;
}) {
  if (loading) {
    return <div className={styles.driveStatus}>Inventariando antecedentes…</div>;
  }

  if (!inventory) return null;

  if (inventory.connection !== 'connected') {
    return (
      <div
        className={
          inventory.connection === 'not_configured'
            ? styles.driveWarning
            : styles.driveError
        }
      >
        {inventory.message}
      </div>
    );
  }

  const analyzableFiles = inventory.items.filter(
    (item) =>
      item.itemType === 'file' &&
      item.priority !== 'excluded' &&
      item.analyzable,
  );
  const visibleItems = analyzableFiles
    .sort((left, right) => priorityRank(left) - priorityRank(right))
    .slice(0, 8);

  return (
    <div className={styles.inventory}>
      <div className={styles.inventorySummary}>
        <strong>Antecedentes detectados</strong>
        <span>
          {inventory.summary.files} archivos · {analyzableFiles.length} analizables
          {inventory.summary.recommended > 0
            ? ` · ${inventory.summary.recommended} prioritarios`
            : ''}
          {inventory.summary.excluded > 0
            ? ` · ${inventory.summary.excluded} excluidos`
            : ''}
        </span>
      </div>

      {visibleItems.length === 0 ? (
        <div className={styles.driveStatus}>
          No se encontraron archivos utilizables dentro de los primeros niveles de la carpeta.
        </div>
      ) : (
        <div className={styles.driveFiles}>
          {visibleItems.map((file) => (
            <div key={file.id} className={styles.driveFile}>
              <span className={styles.driveFileIcon} aria-hidden="true">
                {driveFileIcon(file.kind)}
              </span>
              <span className={styles.driveFileInfo}>
                {file.url ? (
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.name}
                  </a>
                ) : (
                  <span className={styles.driveFileName}>{file.name}</span>
                )}
                <small>{file.path}</small>
              </span>
              <time dateTime={file.modifiedAt}>{formatRelativeTime(file.modifiedAt)}</time>
            </div>
          ))}
        </div>
      )}

      {analyzableFiles.length > visibleItems.length && (
        <span className={styles.moreFiles}>
          + {analyzableFiles.length - visibleItems.length} archivos analizables adicionales
        </span>
      )}
      {inventory.summary.files > analyzableFiles.length && (
        <span className={styles.moreFiles}>
          Los archivos Office no convertidos y otros formatos incompatibles se muestran en Drive, pero no se envían a la IA en esta PoC.
        </span>
      )}
    </div>
  );
}

function priorityRank(item: EstimationDriveInventoryItem): number {
  return item.priority === 'recommended' ? 0 : 1;
}

function isGoogleDriveFolderUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.hostname === 'drive.google.com' &&
      (/\/folders\/[a-zA-Z0-9_-]+/.test(url.pathname) ||
        /^[a-zA-Z0-9_-]+$/.test(url.searchParams.get('id') ?? ''))
    );
  } catch {
    return false;
  }
}

function driveFileIcon(
  kind: EstimationDriveInventoryItem['kind'],
): string {
  switch (kind) {
    case 'spreadsheet':
      return '📊';
    case 'presentation':
      return '📑';
    case 'image':
      return '🖼️';
    case 'pdf':
    case 'document':
      return '📄';
    default:
      return '📎';
  }
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < hour) return formatter.format(Math.round(diffMs / minute), 'minute');
  if (absMs < day) return formatter.format(Math.round(diffMs / hour), 'hour');
  return formatter.format(Math.round(diffMs / day), 'day');
}
