import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateTeamMemberSchema, type TeamMember, type UpdateTeamMemberInput } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useUpdateTeamMember } from '../api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import styles from './EditTeamMemberDialog.module.css';

export interface EditTeamMemberDialogProps {
  open: boolean;
  teamId: string;
  member: TeamMember | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function EditTeamMemberDialog({ open, teamId, member, onClose, onSuccess }: EditTeamMemberDialogProps) {
  const updateMember = useUpdateTeamMember();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof updateTeamMemberSchema>, unknown, UpdateTeamMemberInput>({
    resolver: zodResolver(updateTeamMemberSchema),
    defaultValues: { position: '', weeklyHours: 44 },
  });

  useEffect(() => {
    if (!open || !member) return;
    reset({ position: member.position ?? '', weeklyHours: member.weeklyHours });
    setServerError(null);
  }, [open, member, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!member) return;
    setServerError(null);
    try {
      await updateMember.mutateAsync({ teamId, memberId: member.id, input: values });
      onSuccess(`Se actualizó a ${member.fullName}.`);
      onClose();
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo guardar. Inténtalo de nuevo.');
    }
  });

  if (!member) return null;

  return (
    <Modal
      open={open}
      title={`Editar a ${member.fullName}`}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="team-member-form" loading={isSubmitting} loadingText="Guardando…">
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id="team-member-form" className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <TextField label="Cargo" errorText={errors.position?.message} {...register('position')} />
        <TextField
          label="Horas semanales"
          type="number"
          errorText={errors.weeklyHours?.message}
          {...register('weeklyHours')}
        />
      </form>
    </Modal>
  );
}
