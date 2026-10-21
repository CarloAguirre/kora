import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EstimationCreationMode, ProjectSummary } from '@kora/contracts';
import { projectEstimationPath } from '@/app/router/paths';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
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
      'Analiza los antecedentes de Drive, formula las aclaraciones necesarias y luego genera la estimación.',
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
    const candidate = detail.data?.documentationLink ?? '';
    setDriveFolderUrl(candidate.includes('drive.google.com') ? candidate : '');
  }, [detail.data?.documentationLink, driveTouched, selected]);

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
      setError('Vincula la carpeta de Drive del levantamiento para usar el agente IA.');
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
                ? 'Buscando carpeta vinculada al proyecto…'
                : 'Si Kora ya tiene el enlace documental del prospecto, se completa automáticamente.'
            }
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
