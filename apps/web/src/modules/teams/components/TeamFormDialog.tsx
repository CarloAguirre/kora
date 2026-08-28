import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTeamSchema, type CreateTeamInput, type TeamSummary } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useCreateTeam, useUpdateTeam } from '../api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import styles from './TeamFormDialog.module.css';

export interface TeamFormDialogProps {
  open: boolean;
  team: TeamSummary | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function TeamFormDialog({ open, team, onClose, onSuccess }: TeamFormDialogProps) {
  const isEditing = team !== null;
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: '', description: '', leaderUserId: null },
  });

  useEffect(() => {
    if (!open) return;
    reset(team ? { name: team.name, description: team.description ?? '', leaderUserId: team.leader?.id ?? null } : { name: '', description: '', leaderUserId: null });
    setServerError(null);
  }, [open, team, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (isEditing) {
        await updateTeam.mutateAsync({ teamId: team.id, input: values });
        onSuccess(`Se actualizó el equipo ${values.name}.`);
      } else {
        await createTeam.mutateAsync(values);
        onSuccess(`Se creó el equipo ${values.name}.`);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === 'TEAM_NAME_ALREADY_IN_USE') {
          setError('name', { message: error.message });
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('No se pudo guardar. Inténtalo de nuevo.');
      }
    }
  });

  return (
    <Modal
      open={open}
      title={isEditing ? 'Editar equipo' : 'Nuevo equipo'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="team-form" loading={isSubmitting} loadingText="Guardando…">
            {isEditing ? 'Guardar cambios' : 'Crear equipo'}
          </Button>
        </>
      }
    >
      <form id="team-form" className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <TextField label="Nombre" required errorText={errors.name?.message} {...register('name')} />
        <TextField label="Descripción" {...register('description')} />
      </form>
    </Modal>
  );
}
