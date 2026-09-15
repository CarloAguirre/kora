import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTeamSchema, type CreateTeamInput, type TeamSummary } from '@kora/contracts';
import { SidePanel } from '@/shared/components/ui/SidePanel';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import { Avatar } from '@/shared/components/ui/Avatar';
import { AlertIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import {
  useAddTeamMember,
  useCreateTeam,
  useCreateTeamType,
  useRemoveTeamMember,
  useTeamDetail,
  useTeamTypes,
  useUpdateTeam,
} from '../api/teams.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { TEAM_TYPE_COLOR_CHOICES, TEAM_TYPE_ICON_OPTIONS, TeamTypeIcon } from '../team-type-icons';
import styles from './TeamFormDialog.module.css';

const STATUS_OPTIONS = [
  { value: 'true', label: 'Activo' },
  { value: 'false', label: 'Inactivo' },
];

const EMPTY_NEW_TYPE = { name: '', colorIdx: 0, icon: TEAM_TYPE_ICON_OPTIONS[0]! };

/** `''` de un `<select>` sin elegir → `null`, para "sin líder" en vez de una cadena vacía. */
const emptyToNull = (value: string) => value || null;

/** Un colaborador en el panel: `memberId` es `null` mientras no se ha guardado (recién agregado en esta sesión de edición). */
interface DraftMember {
  memberId: string | null;
  userId: string;
  fullName: string;
}

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
  const createTeamType = useCreateTeamType();
  const addTeamMember = useAddTeamMember();
  const removeTeamMember = useRemoveTeamMember();
  const { data: teamTypes } = useTeamTypes();
  const { data: teamDetail } = useTeamDetail(open && isEditing ? team.id : null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [teamTypeId, setTeamTypeId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [newType, setNewType] = useState(EMPTY_NEW_TYPE);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [initialMembers, setInitialMembers] = useState<DraftMember[]>([]);

  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  const { data: candidateUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });

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
    reset(
      team
        ? { name: team.name, description: team.description ?? '', leaderUserId: team.leader?.id ?? null }
        : { name: '', description: '', leaderUserId: null },
    );
    setIsActive(team?.isActive ?? true);
    setTeamTypeId(team?.teamType?.id ?? null);
    setCreatingType(false);
    setNewType(EMPTY_NEW_TYPE);
    setTypeError(null);
    setServerError(null);
    if (!team) {
      setMembers([]);
      setInitialMembers([]);
    }
  }, [open, team, reset]);

  // Los colaboradores actuales llegan aparte (`TeamSummary` no los trae) — se
  // cargan en cuanto responde `useTeamDetail`, y quedan también en
  // `initialMembers` para poder calcular, al guardar, a quién hay que quitar.
  useEffect(() => {
    if (!open || !isEditing || !teamDetail) return;
    const loaded = teamDetail.members.map((member) => ({
      memberId: member.id,
      userId: member.userId,
      fullName: member.fullName,
    }));
    setMembers(loaded);
    setInitialMembers(loaded);
  }, [open, isEditing, teamDetail]);

  const addDraftMember = (userId: string) => {
    const user = candidateUsers?.items.find((candidate) => candidate.id === userId);
    if (!user) return;
    setMembers((prev) => [...prev, { memberId: null, userId: user.id, fullName: user.fullName }]);
  };

  const removeDraftMember = (userId: string) => {
    setMembers((prev) => prev.filter((member) => member.userId !== userId));
  };

  const availableCandidates = (candidateUsers?.items ?? []).filter(
    (user) => !members.some((member) => member.userId === user.id),
  );

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const payload = { ...values, teamTypeId };
    try {
      let teamId: string;
      if (isEditing) {
        await updateTeam.mutateAsync({ teamId: team.id, input: { ...payload, isActive } });
        teamId = team.id;
      } else {
        const created = await createTeam.mutateAsync(payload);
        teamId = created.id;
      }

      const removedMembers = initialMembers.filter(
        (initial) => !members.some((member) => member.userId === initial.userId),
      );
      const addedMembers = members.filter((member) => member.memberId === null);
      await Promise.all([
        ...removedMembers.map((member) => removeTeamMember.mutateAsync({ teamId, memberId: member.memberId! })),
        ...addedMembers.map((member) =>
          addTeamMember.mutateAsync({ teamId, input: { userId: member.userId, weeklyHours: 44 } }),
        ),
      ]);

      onSuccess(isEditing ? `Se actualizó el equipo ${values.name}.` : `Se creó el equipo ${values.name}.`);
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

  const handleCreateType = async () => {
    const name = newType.name.trim();
    if (!name) {
      setTypeError('Ponle un nombre al tipo de equipo.');
      return;
    }
    setTypeError(null);
    try {
      const { id } = await createTeamType.mutateAsync({
        name,
        color: TEAM_TYPE_COLOR_CHOICES[newType.colorIdx]!.color,
        icon: newType.icon,
      });
      setTeamTypeId(id);
      setCreatingType(false);
      setNewType(EMPTY_NEW_TYPE);
    } catch (error) {
      setTypeError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el tipo de equipo.');
    }
  };

  return (
    <SidePanel
      open={open}
      title={isEditing ? 'Editar equipo' : 'Crear equipo'}
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

        <div>
          <span className={styles.fieldLabel}>Tipo de equipo</span>
          {typeError && (
            <div className={styles.alert} role="alert">
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>{typeError}</span>
            </div>
          )}
          <div className={styles.typeGrid}>
            {(teamTypes?.items ?? []).map((type) => (
              <button
                key={type.id}
                type="button"
                className={[styles.typeOption, teamTypeId === type.id ? styles.typeOptionActive : '']
                  .filter(Boolean)
                  .join(' ')}
                style={teamTypeId === type.id ? { borderColor: type.color, background: `${type.color}1a`, color: type.color } : undefined}
                onClick={() => setTeamTypeId(type.id)}
              >
                <TeamTypeIcon icon={type.icon} size={18} />
                <span>{type.name}</span>
              </button>
            ))}

            {creatingType ? (
              <div className={styles.typeCreate}>
                <div>
                  <span className={styles.miniLabel}>Nombre del tipo</span>
                  <TextField
                    placeholder="Ej: Innovación, Soporte, Ventas"
                    value={newType.name}
                    onChange={(event) => setNewType((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div>
                  <span className={styles.miniLabel}>Color</span>
                  <div className={styles.swatchRow}>
                    {TEAM_TYPE_COLOR_CHOICES.map((choice, index) => (
                      <button
                        key={choice.color}
                        type="button"
                        aria-label={choice.color}
                        className={[styles.swatch, index === newType.colorIdx ? styles.swatchActive : ''].join(' ')}
                        onClick={() => setNewType((prev) => ({ ...prev, colorIdx: index }))}
                      >
                        <span style={{ background: choice.color }} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={styles.miniLabel}>Ícono</span>
                  <div className={styles.iconRow}>
                    {TEAM_TYPE_ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        aria-label={icon}
                        className={[styles.iconOption, icon === newType.icon ? styles.iconOptionActive : ''].join(' ')}
                        onClick={() => setNewType((prev) => ({ ...prev, icon }))}
                      >
                        <TeamTypeIcon icon={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.typeCreateActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setCreatingType(false);
                      setTypeError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    loading={createTeamType.isPending}
                    loadingText="Creando…"
                    onClick={() => void handleCreateType()}
                  >
                    Crear tipo
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={[styles.typeOption, styles.typeOptionAdd].join(' ')}
                onClick={() => setCreatingType(true)}
              >
                <PlusIcon size={18} />
                <span>Nuevo tipo</span>
              </button>
            )}
          </div>
        </div>

        <div className={styles.row}>
          <Select
            label="Líder"
            placeholder="Sin asignar"
            options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
            {...register('leaderUserId', { setValueAs: emptyToNull })}
          />
          {isEditing && (
            <Select
              label="Estado"
              options={STATUS_OPTIONS}
              value={String(isActive)}
              onChange={(event) => setIsActive(event.target.value === 'true')}
            />
          )}
        </div>

        <div>
          <div className={styles.fieldTitleRow}>
            <span className={styles.fieldLabel}>Colaboradores</span>
            <Badge tone="neutral">{members.length}</Badge>
          </div>
          <Select
            placeholder="Selecciona un colaborador para agregar…"
            options={availableCandidates.map((user) => ({ value: user.id, label: user.fullName }))}
            value=""
            onChange={(event) => {
              if (event.target.value) addDraftMember(event.target.value);
            }}
          />
          {members.length > 0 && (
            <div className={styles.memberList}>
              {members.map((member) => (
                <div key={member.userId} className={styles.memberRow}>
                  <Avatar name={member.fullName} size={30} />
                  <span className={styles.memberName}>{member.fullName}</span>
                  <button
                    type="button"
                    className={styles.memberRemove}
                    onClick={() => removeDraftMember(member.userId)}
                    aria-label={`Quitar a ${member.fullName}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </SidePanel>
  );
}
