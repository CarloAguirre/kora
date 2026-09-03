import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addTeamMemberSchema, type AddTeamMemberInput } from '@kora/contracts';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import styles from './TeamDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { useToast } from '@/shared/components/ui/Toast';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useAddTeamMember, useDeleteTeam, useRemoveTeamMember, useTeamDetail } from '../api/teams.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { TeamFormDialog } from '../components/TeamFormDialog';
import { EditTeamMemberDialog } from '../components/EditTeamMemberDialog';
import { TeamAvailabilityHeatmap } from '../components/TeamAvailabilityHeatmap';
import type { TeamMember } from '@kora/contracts';

/**
 * Ficha de equipo: sus miembros, con horas semanales comprometidas.
 * `weeklyHours` es la base de la disponibilidad que consumirá el forecast (M6).
 */
export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const toast = useToast();
  const { data: team, isLoading } = useTeamDetail(teamId ?? null);
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const deleteTeam = useDeleteTeam();
  const [formError, setFormError] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Candidatos para agregar: colaboradores y líderes que aún no pertenecen al
  // equipo. 200 alcanza con margen para una plantilla de este tamaño; si algún
  // día no bastara, el selector pasaría a buscar por texto en vez de listar todo.
  const { data: candidateUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });
  const memberUserIds = new Set((team?.members ?? []).map((member) => member.userId));
  const availableUsers = (candidateUsers?.items ?? []).filter((user) => !memberUserIds.has(user.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof addTeamMemberSchema>, unknown, AddTeamMemberInput>({
    resolver: zodResolver(addTeamMemberSchema),
    defaultValues: { userId: '', position: '', weeklyHours: 44 },
  });

  const onAddMember = handleSubmit(async (values) => {
    if (!teamId) return;
    setFormError(null);
    try {
      await addMember.mutateAsync({ teamId, input: values });
      toast.success('Se agregó el miembro al equipo.');
      reset({ userId: '', position: '', weeklyHours: 44 });
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : 'No se pudo agregar el miembro.');
    }
  });

  const handleRemove = async (memberId: string) => {
    if (!teamId) return;
    await removeMember.mutateAsync({ teamId, memberId });
    toast.success('Se retiró al miembro del equipo.');
  };

  const handleDeleteTeam = async () => {
    if (!teamId || !team) return;
    await deleteTeam.mutateAsync(teamId);
    toast.success(`Se eliminó el equipo ${team.name}.`);
    void navigate('/equipos');
  };

  const columns: Column<TeamMember>[] = [
    { key: 'fullName', header: 'Nombre', render: (member) => member.fullName },
    { key: 'position', header: 'Cargo', render: (member) => member.position ?? '—' },
    { key: 'weeklyHours', header: 'Horas semanales', render: (member) => String(member.weeklyHours) },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '90px',
      render: (member) =>
        can('teams:manage') ? (
          <div className={styles.memberActions}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingMember(member)}
              aria-label={`Editar a ${member.fullName}`}
            >
              <PencilIcon size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleRemove(member.id)}
              aria-label={`Retirar a ${member.fullName}`}
            >
              <TrashIcon size={16} />
            </Button>
          </div>
        ) : null,
    },
  ];

  if (isLoading || !team) {
    return (
      <DashboardLayout title="Equipo">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={team.name}>
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/equipos')}>
            ← Volver a equipos
          </Button>

          {can('teams:manage') && (
            <div className={styles.topRowActions}>
              <Button variant="outline" size="sm" iconLeft={<PencilIcon size={16} />} onClick={() => setEditingTeam(true)}>
                Editar equipo
              </Button>
              <Button
                variant="outline"
                size="sm"
                iconLeft={<TrashIcon size={16} />}
                onClick={() => setDeletingTeam(true)}
              >
                Eliminar equipo
              </Button>
            </div>
          )}
        </div>

        {(team.description || team.leader) && (
          <Card>
            {team.description && <p className={styles.description}>{team.description}</p>}
            {team.leader && <p className={styles.leader}>Líder: {team.leader.fullName}</p>}
          </Card>
        )}

        <Card>
          <h2 className={styles.sectionTitle}>Miembros ({team.members.length})</h2>

          <DataTable
            caption="Miembros del equipo"
            columns={columns}
            items={team.members}
            getRowKey={(member) => member.id}
            loading={false}
            error={null}
            emptyMessage="Este equipo aún no tiene miembros."
          />

          {can('teams:manage') && (
            <form className={styles.addForm} onSubmit={onAddMember}>
              <h3 className={styles.sectionTitle}>Agregar miembro</h3>
              {formError && <p className={styles.error}>{formError}</p>}
              <div className={styles.addFormRow}>
                <Select
                  label="Persona"
                  placeholder="Selecciona a quién agregar"
                  options={availableUsers.map((user) => ({ value: user.id, label: user.fullName }))}
                  errorText={errors.userId?.message}
                  {...register('userId')}
                />
                <TextField label="Cargo" {...register('position')} />
                <TextField label="Horas semanales" type="number" {...register('weeklyHours')} />
                <Button type="submit" loading={isSubmitting} loadingText="Agregando…">
                  Agregar
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Disponibilidad</h2>
          <TeamAvailabilityHeatmap teamId={team.id} />
        </Card>
      </div>

      <TeamFormDialog
        open={editingTeam}
        team={team}
        onClose={() => setEditingTeam(false)}
        onSuccess={(message) => toast.success(message)}
      />

      <EditTeamMemberDialog
        open={editingMember !== null}
        teamId={team.id}
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSuccess={(message) => toast.success(message)}
      />

      <ConfirmActionDialog
        open={deletingTeam}
        title="Eliminar equipo"
        description={`Se eliminará el equipo ${team.name}. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDeleteTeam}
        onClose={() => setDeletingTeam(false)}
      />
    </DashboardLayout>
  );
}
