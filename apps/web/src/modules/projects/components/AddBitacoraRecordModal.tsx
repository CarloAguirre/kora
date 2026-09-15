import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  addProjectObservationSchema,
  PROJECT_OBSERVATION_TYPES,
  PROJECT_OBSERVATION_TYPE_LABELS,
  type AddProjectObservationInput,
  type ProjectModule,
} from '@kora/contracts';
import styles from './BitacoraCard.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Modal } from '@/shared/components/ui/Modal';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useAddProjectObservation } from '../api/projects.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

/** `''` de un `<select>` sin elegir → `null`. */
const emptyToNull = (value: string) => value || null;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_OPTIONS = PROJECT_OBSERVATION_TYPES.map((type) => ({ value: type, label: PROJECT_OBSERVATION_TYPE_LABELS[type] }));

export interface AddBitacoraRecordModalProps {
  open: boolean;
  projectId: string;
  modules: readonly ProjectModule[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * "Agregar registro a la bitácora" — crea un `ProjectObservation` tipado
 * (hito/incidente/compromiso/atención/observación). Componente aparte
 * (no vive dentro de `BitacoraCard`) porque tanto la tabla completa como
 * `BitacoraMiniCard` (resumen en la pestaña Resumen) lo abren igual.
 */
export function AddBitacoraRecordModal({ open, projectId, modules, onClose, onSuccess }: AddBitacoraRecordModalProps) {
  const addObservation = useAddProjectObservation();

  const moduleOptions = modules.map((module, index) => ({ value: module.id, label: `Fase ${index + 1} — ${module.name}` }));

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof addProjectObservationSchema>, unknown, AddProjectObservationInput>({
    resolver: zodResolver(addProjectObservationSchema),
    defaultValues: { type: 'hito', title: '', message: '', date: todayISO(), moduleId: null },
  });

  useEffect(() => {
    if (open) reset({ type: 'hito', title: '', message: '', date: todayISO(), moduleId: null });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addObservation.mutateAsync({ projectId, input: values });
      onSuccess('Se agregó el registro a la bitácora.');
      onClose();
    } catch (error) {
      setError('root', { message: error instanceof ApiRequestError ? error.message : 'No se pudo agregar el registro.' });
    }
  });

  return (
    <Modal
      open={open}
      title="Agregar registro a la bitácora"
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="add-bitacora-form" loading={isSubmitting} loadingText="Guardando…">
            Guardar registro
          </Button>
        </>
      }
    >
      <form id="add-bitacora-form" className={styles.addForm} onSubmit={onSubmit} noValidate>
        {errors.root?.message && (
          <div className={styles.formError} role="alert">
            <AlertIcon size={18} />
            <span>{errors.root.message}</span>
          </div>
        )}
        <Select label="Tipo de registro" options={TYPE_OPTIONS} {...register('type')} />
        <TextField label="Título" placeholder="Ej: Cliente confirma alcance del módulo" errorText={errors.title?.message} {...register('title')} />
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="add-bitacora-message">
            Descripción
          </label>
          <textarea
            id="add-bitacora-message"
            className={styles.composerTextarea}
            placeholder="Ej: Cliente quedó de enviar el Excel el día martes AM…"
            rows={3}
            {...register('message')}
          />
          {errors.message && <span className={styles.composerError}>{errors.message.message}</span>}
        </div>
        <TextField label="Fecha" type="date" {...register('date')} />
        <Select
          label="Fase relacionada (opcional)"
          placeholder="Ninguna"
          options={moduleOptions}
          {...register('moduleId', { setValueAs: emptyToNull })}
        />
      </form>
    </Modal>
  );
}
