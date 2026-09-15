import { useState } from 'react';
import type { TeamSummary } from '@kora/contracts';
import styles from './TeamsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon, DownloadIcon } from '@/shared/components/icons/Icons';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon } from '@/shared/components/icons/Icons';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { TeamFormDialog } from '../components/TeamFormDialog';
import { TeamCard } from '../components/TeamCard';
import { LeaderTeamConsole } from './LeaderTeamConsole';
import { useDeleteTeam, useTeamsList } from '../api/teams.queries';
import { useHourEntriesExport } from '@/modules/hours/hooks/useHourEntriesExport';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';

const STATUS_FILTER_OPTIONS = [
  { value: 'true', label: 'Activo' },
  { value: 'false', label: 'Inactivo' },
];

/**
 * `/equipos`. Para `admin`/`pmo` es la administración global de equipos (M2).
 * Para `leader` es su propia consola de equipo — ver `LeaderTeamConsole` — en
 * vez de la tabla administrativa de todos los equipos de la organización, que
 * no le pertenece. Mismo criterio de dispatch por rol que `ForecastPage`.
 */
export function TeamsListPage() {
  const { user } = useAuth();
  const { data: ledTeams, isLoading: loadingLedTeams } = useTeamsList(
    user?.role === 'leader' ? { leaderUserId: user.id, pageSize: 50, isActive: true } : { pageSize: 1 },
  );

  if (user?.role === 'leader') {
    if (loadingLedTeams) {
      return (
        <DashboardLayout title="Equipos">
          <p>Cargando…</p>
        </DashboardLayout>
      );
    }
    return <LeaderTeamConsole teams={ledTeams?.items ?? []} />;
  }

  return <TeamsAdminListPage />;
}

/** Administración de equipos (M2). */
function TeamsAdminListPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const { exporting, exportError, exportEntries } = useHourEntriesExport();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Sin paginación de servidor: hoy la organización tiene un puñado de equipos
  // (ver captura de referencia), así que se trae todo de una vez y los KPIs se
  // calculan en el cliente — mismo criterio que `useUsersList({ pageSize: 200 })`
  // en `TeamDetailPage` para listas de este tamaño.
  const { data, isLoading, error } = useTeamsList({
    pageSize: 100,
    search: search || undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
  });
  const deleteTeam = useDeleteTeam();

  const [dialog, setDialog] = useState<
    { kind: 'none' } | { kind: 'form'; team: TeamSummary | null } | { kind: 'delete'; team: TeamSummary }
  >({
    kind: 'none',
  });
  const closeDialog = () => setDialog({ kind: 'none' });

  const handleExportHours = () => exportEntries({ sortField: 'date', sortDirection: 'desc' });

  const handleDelete = async () => {
    if (dialog.kind !== 'delete') return;
    await deleteTeam.mutateAsync(dialog.team.id);
    toast.success(`Se eliminó el equipo ${dialog.team.name}.`);
  };

  const teams = data?.items ?? [];
  const totalPeople = teams.reduce((sum, team) => sum + team.memberCount, 0);

  return (
    <DashboardLayout title="Equipos">
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.subtitle}>{data ? `${data.total} equipo${data.total === 1 ? '' : 's'}` : ' '}</p>
          <div className={styles.headerActions}>
            {user?.role === 'pmo' && (
              <Button
                variant="outlineDark"
                iconLeft={<DownloadIcon size={18} />}
                loading={exporting}
                loadingText="Generando…"
                onClick={() => void handleExportHours()}
              >
                Descargar registro de horas
              </Button>
            )}
            {can('teams:manage') && (
              <Button onClick={() => setDialog({ kind: 'form', team: null })} iconLeft={<PlusIcon size={18} />}>
                Nuevo equipo
              </Button>
            )}
          </div>
        </header>

        {exportError && (
          <p className={styles.exportError} role="alert">
            {exportError}
          </p>
        )}

        <div className={styles.kpis}>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Equipos activos</span>
            <span className={styles.kpiValue}>{data ? teams.filter((team) => team.isActive).length : '…'}</span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Personas en equipos</span>
            <span className={styles.kpiValue}>{data ? totalPeople : '…'}</span>
          </Card>
        </div>

        <div className={styles.filters}>
          <TextField
            className={styles.search}
            label="Buscar"
            type="search"
            placeholder="Nombre del equipo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            iconLeft={<SearchIcon size={16} />}
          />
          <Select
            className={styles.statusFilter}
            label="Estado"
            placeholder="Todos"
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          />
        </div>

        <div className={styles.grid}>
          {isLoading && <p className={styles.gridMessage}>Cargando…</p>}
          {!isLoading && error && <p className={styles.gridMessage}>No se pudo cargar el listado de equipos.</p>}
          {!isLoading && !error && teams.length === 0 && (
            <p className={styles.gridMessage}>No hay equipos que coincidan con la búsqueda.</p>
          )}
          {!isLoading &&
            !error &&
            teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                canManage={can('teams:manage')}
                onEdit={() => setDialog({ kind: 'form', team })}
                onDelete={() => setDialog({ kind: 'delete', team })}
              />
            ))}
        </div>
      </div>

      <TeamFormDialog
        open={dialog.kind === 'form'}
        team={dialog.kind === 'form' ? dialog.team : null}
        onClose={closeDialog}
        onSuccess={(message) => toast.success(message)}
      />

      <ConfirmActionDialog
        open={dialog.kind === 'delete'}
        title="Eliminar equipo"
        description={
          dialog.kind === 'delete'
            ? `Se eliminará el equipo ${dialog.team.name}. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onClose={closeDialog}
      />
    </DashboardLayout>
  );
}
