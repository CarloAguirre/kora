import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ROLE_CODES,
  ROLE_LABELS,
  createUserSchema,
  type CreateUserInput,
  type RoleCode,
  type UserSummary,
} from '@kora/contracts';
import styles from './UserFormDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useCreateUser, useUpdateUser } from '../api/users.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { teamRequirementFor } from '../lib/team-requirement';

/**
 * Alta y edición de usuarios en un mismo diálogo.
 *
 * Son el mismo formulario con los mismos campos y las mismas reglas; separarlos
 * en dos componentes duplicaría todo para que luego uno se corrigiera y el otro
 * no. Lo que cambia —el título, el botón, si el correo es editable— se resuelve
 * con el modo.
 *
 * La regla de qué roles llevan equipo se comparte con el servidor y se aplica
 * aquí en vivo: al elegir "Administrador", el selector de equipo desaparece.
 */

export interface UserFormDialogProps {
  open: boolean;
  /** Usuario a editar, o null para dar de alta. */
  user: UserSummary | null;
  teams: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const ROLE_OPTIONS = ROLE_CODES.map((code) => ({ value: code, label: ROLE_LABELS[code] }));

/**
 * Lo que el formulario MANEJA frente a lo que el esquema PRODUCE.
 *
 * `createUserSchema` aplica valores por defecto, así que su tipo de entrada y
 * su tipo de salida no son el mismo: al escribir, `grantAccess` puede faltar;
 * al validar, siempre viene. Declarar ambos —`z.input` para los campos y
 * `CreateUserInput` para el envío— es lo que hace que `handleSubmit` reciba
 * datos ya completos y tipados, sin un `as` de por medio.
 */
type UserFormValues = z.input<typeof createUserSchema>;

export function UserFormDialog({ open, user, teams, onClose, onSuccess }: UserFormDialogProps) {
  const isEditing = user !== null;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'collaborator',
      teamId: null,
      isCommercialManager: false,
      grantAccess: true,
    },
  });

  const selectedRole = watch('role') as RoleCode;
  const teamRequirement = teamRequirementFor(selectedRole);

  // Al abrir, el formulario refleja al usuario que toque (o queda limpio para
  // un alta). Sin esto, reabrir el diálogo mostraría los datos del anterior.
  useEffect(() => {
    if (!open) return;

    reset(
      user
        ? {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            teamId: user.team?.id ?? null,
            isCommercialManager: user.isCommercialManager,
            grantAccess: user.hasAccountAccess,
          }
        : {
            email: '',
            firstName: '',
            lastName: '',
            role: 'collaborator',
            teamId: null,
            isCommercialManager: false,
            grantAccess: true,
          },
    );
    setServerError(null);
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    // El servidor ignora el equipo en los roles que no lo admiten; enviarlo a
    // null aquí evita mandar datos que se van a descartar.
    const teamId = teamRequirement === 'forbidden' ? null : (values.teamId ?? null);

    try {
      if (isEditing) {
        await updateUser.mutateAsync({
          userId: user.id,
          input: {
            email: values.email,
            firstName: values.firstName,
            lastName: values.lastName,
            role: values.role,
            teamId,
            isCommercialManager: values.isCommercialManager,
          },
        });
        onSuccess(`Se actualizaron los datos de ${values.firstName} ${values.lastName}.`);
      } else {
        const created = await createUser.mutateAsync({ ...values, teamId });
        onSuccess(
          created.invitationSent
            ? `Se creó a ${values.firstName} y se le envió la invitación.`
            : `Se creó a ${values.firstName}, pero no se pudo enviar la invitación. Reenvíala desde el listado.`,
        );
      }

      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        // Los errores por campo se muestran junto al campo culpable, que es
        // donde la persona los puede corregir.
        const issues = error.fieldIssues;
        if (issues) {
          for (const [field, messages] of Object.entries(issues)) {
            if (field in values && messages[0]) {
              setError(field as keyof UserFormValues, { message: messages[0] });
            }
          }
        }

        if (error.code === 'USER_EMAIL_ALREADY_IN_USE') {
          setError('email', { message: error.message });
        } else if (!issues) {
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
      title={isEditing ? 'Editar usuario' : 'Nuevo usuario'}
      description={
        isEditing
          ? 'Los cambios de rol y estado quedan registrados en la auditoría.'
          : 'La persona recibirá un enlace para definir su propia contraseña.'
      }
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={isSubmitting} loadingText="Guardando…">
            {isEditing ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form id="user-form" className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <div className={styles.row}>
          <TextField
            label="Nombre"
            required
            autoComplete="given-name"
            errorText={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            label="Apellido"
            required
            autoComplete="family-name"
            errorText={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <TextField
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          placeholder="nombre@kabeli.cl"
          errorText={errors.email?.message}
          {...register('email')}
        />

        <div className={styles.row}>
          <Select
            label="Rol"
            required
            options={ROLE_OPTIONS}
            errorText={errors.role?.message}
            {...register('role')}
          />

          {teamRequirement !== 'forbidden' && (
            <Select
              label="Equipo"
              required={teamRequirement === 'required'}
              placeholder={teamRequirement === 'optional' ? 'Sin equipo' : 'Selecciona un equipo'}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              errorText={errors.teamId?.message}
              {...register('teamId')}
            />
          )}
        </div>

        <div className={styles.checkboxRow}>
          <input
            id="isCommercialManager"
            type="checkbox"
            className={styles.checkbox}
            {...register('isCommercialManager')}
          />
          <label className={styles.checkboxLabel} htmlFor="isCommercialManager">
            <span className={styles.checkboxTitle}>Es responsable comercial</span>
            <span className={styles.checkboxHint}>
              Aparecerá como opción al asignar la cartera comercial de un cliente.
            </span>
          </label>
        </div>

        {!isEditing && (
          <div className={styles.checkboxRow}>
            <input
              id="grantAccess"
              type="checkbox"
              className={styles.checkbox}
              {...register('grantAccess')}
            />
            <label className={styles.checkboxLabel} htmlFor="grantAccess">
              <span className={styles.checkboxTitle}>Dar acceso al sistema</span>
              <span className={styles.checkboxHint}>
                Sin esto, la persona queda registrada como ficha pero no podrá iniciar sesión.
              </span>
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
