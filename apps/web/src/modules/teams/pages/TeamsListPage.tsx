import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeamSummary } from '@kora/contracts';
import styles from './TeamsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Card } from '@/shared/components/ui/Card';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon, PencilIcon } from '@/shared/components/icons/Icons';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon } from '@/shared/components/icons/Icons';
import { TeamFormDialog } from '../components/TeamFormDialog';
import { LeaderTeamConsole } from './LeaderTeamConsole';
import { useTeamsList } from '../api/teams.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';

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

/** Administración de equipos (M2). Sigue el mismo patrón compacto de Usuarios/Clientes. */
function TeamsAdminListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useTeamsList({ page, pageSize: 25, search: search || undefined });

  const [dialog, setDialog] = useState<{ kind: 'none' } | { kind: 'form'; team: TeamSummary | null }>({
    kind: 'none',
  });

  const columns: Column<TeamSummary>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (team) => (
        <Link to={`/equipos/${team.id}`} className={styles.link}>
          {team.name}
        </Link>
      ),
    },
    { key: 'leader', header: 'Líder', render: (team) => team.leader?.fullName ?? <span className={styles.empty}>—</span> },
    { key: 'memberCount', header: 'Miembros', render: (team) => String(team.memberCount) },
    {
      key: 'status',
      header: 'Estado',
      render: (team) => <Badge tone={team.isActive ? 'success' : 'neutral'}>{team.isActive ? 'Activo' : 'Inactivo'}</Badge>,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '80px',
      render: (team) =>
        can('teams:manage') ? (
          <Button variant="ghost" size="icon" onClick={() => setDialog({ kind: 'form', team })} aria-label={`Editar ${team.name}`}>
            <PencilIcon size={16} />
          </Button>
        ) : null,
    },
  ];

  return (
    <DashboardLayout title="Equipos">
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.subtitle}>{data ? `${data.total} equipo${data.total === 1 ? '' : 's'}` : ' '}</p>
          {can('teams:manage') && (
            <Button onClick={() => setDialog({ kind: 'form', team: null })} iconLeft={<PlusIcon size={18} />}>
              Nuevo equipo
            </Button>
          )}
        </header>

        <Card>
          <TextField
            className={styles.search}
            label="Buscar"
            type="search"
            placeholder="Nombre del equipo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            iconLeft={<SearchIcon size={16} />}
          />

          <DataTable
            caption="Listado de equipos"
            columns={columns}
            items={data?.items ?? []}
            getRowKey={(team) => team.id}
            loading={isLoading}
            error={error ? 'No se pudo cargar el listado de equipos.' : null}
            emptyMessage="No hay equipos que coincidan con la búsqueda."
          />

          {data && (
            <Pagination page={page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
          )}
        </Card>
      </div>

      <TeamFormDialog
        open={dialog.kind === 'form'}
        team={dialog.kind === 'form' ? dialog.team : null}
        onClose={() => setDialog({ kind: 'none' })}
        onSuccess={(message) => toast.success(message)}
      />
    </DashboardLayout>
  );
}
