import type { DashboardSupportOvertimeUser } from '@kora/contracts';
import styles from './SupportOvertimeTable.module.css';
import { Avatar } from '@/shared/components/ui/Avatar';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const COLUMNS: Column<DashboardSupportOvertimeUser>[] = [
  {
    key: 'user',
    header: 'Colaborador',
    render: (user) => (
      <span className={styles.user}>
        <Avatar name={user.fullName} size={28} color="var(--kora-navy)" />
        {user.fullName}
      </span>
    ),
  },
  { key: 'approved', header: 'Aprobadas', align: 'right', render: (user) => `${formatHours(user.approvedHours)} h` },
  {
    key: 'pending',
    header: 'Pendientes',
    align: 'right',
    render: (user) => (user.pendingHours > 0 ? `${formatHours(user.pendingHours)} h` : <span className={styles.muted}>—</span>),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (user) => <strong>{formatHours(user.approvedHours + user.pendingHours)} h</strong>,
  },
];

/**
 * "Horas extra del mes" por colaborador en los proyectos de soporte del
 * alcance — en soporte lo que pasa de la jornada de 8h queda solo como horas
 * extra (ver `CreateTicketHhRequestUseCase`), así el líder ve quién las hizo.
 */
export function SupportOvertimeTable({ users, loading }: { users: readonly DashboardSupportOvertimeUser[]; loading: boolean }) {
  return (
    <div className={styles.card}>
      <div>
        <span className={styles.title}>Horas extra del mes</span>
        <p className={styles.subtitle}>Por colaborador, en proyectos de soporte</p>
      </div>
      <DataTable
        columns={COLUMNS}
        items={[...users]}
        getRowKey={(user) => user.userId}
        loading={loading}
        emptyMessage="Nadie ha registrado horas extra este mes."
      />
    </div>
  );
}
