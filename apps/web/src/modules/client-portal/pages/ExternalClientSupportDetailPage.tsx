import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './ClientSupportContractDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { StatusPill } from '../components/StatusPill';
import { PortalTable, type PortalTableColumn } from '../components/PortalTable';
import { formatMoney } from '@/shared/lib/format-money';
import { usePortalContract, type PortalTicket } from '../api/client-portal.api';
import { ChevronLeftIcon, SearchIcon } from '@/shared/components/icons/Icons';

const formatDate = (value: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-CL') : '—';
const formatHours = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const statusLabel = (status: string) =>
  status === 'pending' ? 'Pendiente'
    : status === 'done' || status === 'closed' ? 'Cerrado' : 'En proceso';

/**
 * Ficha externa: lee exclusivamente tickets del contrato autorizado,
 * no busca /tickets?clientId=... como la vista PMO.
 */
export function ExternalClientSupportDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const { data, isLoading, isError } = usePortalContract(contractId ?? null);
  const [projectId, setProjectId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plan = data?.plan;
  const tickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.tickets ?? []).filter((ticket) =>
      (projectId === 'all' || ticket.developmentProjectId === projectId) &&
      (statusFilter === 'all' || (statusFilter === 'closed'
        ? ticket.status === 'done' || ticket.status === 'closed'
        : statusFilter === 'pending'
          ? ticket.status === 'pending' : !['closed', 'done', 'pending'].includes(ticket.status))) &&
      (!query || `${ticket.title} ${ticket.code}`.toLowerCase().includes(query)));
  }, [data?.tickets, projectId, statusFilter, search]);
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const columns: PortalTableColumn<PortalTicket>[] = [
    { key: 'code', header: 'Ticket', sortValue: (t) => t.code,
      render: (t) => <button type="button" onClick={() => setSelectedId(t.id)}
        aria-label={`Ver ticket ${t.code}`}>{t.code}</button> },
    { key: 'subject', header: 'Asunto', sortValue: (t) => t.title,
      render: (t) => t.title },
    { key: 'priority', header: 'Prioridad', sortValue: (t) => t.priority,
      render: (t) => t.priority },
    { key: 'status', header: 'Estado', sortValue: (t) => t.status,
      render: (t) => <StatusPill tone={['closed', 'done'].includes(t.status) ? 'success' : 'info'}>
        {statusLabel(t.status)}
      </StatusPill> },
    { key: 'hours', header: 'HH consumidas', sortValue: (t) => t.usedHours,
      render: (t) => formatHours(t.usedHours) },
    { key: 'date', header: 'Fecha registro', sortValue: (t) => t.createdAt,
      render: (t) => formatDate(t.createdAt) },
  ];
  if (isLoading) return <DashboardLayout title="Soporte"><Card>Cargando contrato…</Card></DashboardLayout>;
  if (isError || !plan) return <DashboardLayout title="Soporte">
    <Card><p role="alert">No tienes acceso a este contrato o no está disponible.</p>
      <Link to="/portal/soporte">Volver a soporte</Link></Card>
  </DashboardLayout>;

  const total = tickets.reduce((sum, t) => sum + t.usedHours, 0);
  return (
    <DashboardLayout title="Soporte">
      <div className={styles.page}>
        <Link to="/portal/soporte"><ChevronLeftIcon size={16}/> Volver a mis contratos</Link>
        <h2>{plan.name}</h2>
        <StatusPill tone={plan.status === 'active' ? 'success' : 'neutral'}>
          {plan.status === 'active' ? 'Vigente' : 'Finalizado'}
        </StatusPill>
        <Card>
          <h3>Detalle del contrato</h3>
          <p><strong>Cliente:</strong> {plan.clientName}</p>
          <p><strong>Responsable Kabeli:</strong> {plan.leaderName ?? '—'}</p>
          <p><strong>Vigencia:</strong> {formatDate(plan.startDate)} – {formatDate(plan.endDate)}</p>
          <p><strong>Modalidad:</strong> {plan.planType === 'monthly' ? 'Mensual' : plan.planType === 'bundle' ? 'Bolsa' : 'A demanda'}</p>
          <p><strong>HH contratadas:</strong> {formatHours(plan.summary.contractedHours)}</p>
          <p><strong>HH consumidas:</strong> {formatHours(plan.summary.usedHours)}</p>
          <p><strong>Valor HH:</strong> {formatMoney(plan.summary.planValueUf, plan.currency)}</p>
        </Card>
        <Card>
          <h3>Proyectos del contrato</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button size="sm" variant={projectId === 'all' ? 'primary' : 'outline'}
              onClick={() => setProjectId('all')}>Todos</Button>
            {plan.linkedProjects.map((project) => (
              <Button key={project.id} size="sm"
                variant={projectId === project.id ? 'primary' : 'outline'}
                onClick={() => setProjectId(project.id)}>{project.name}</Button>
            ))}
          </div>
        </Card>
        <Card>
          <h3>Tickets e historial</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {['all', 'pending', 'in_progress', 'closed'].map((key) => (
              <Button key={key} size="sm" variant={statusFilter === key ? 'primary' : 'outline'}
                onClick={() => setStatusFilter(key)}>
                {key === 'all' ? 'Todos' : key === 'pending' ? 'Pendientes' : key === 'closed' ? 'Cerrados' : 'En proceso'}
              </Button>
            ))}
            <TextField type="search" aria-label="Buscar ticket" placeholder="Buscar ticket"
              iconLeft={<SearchIcon size={16}/>} value={search} onChange={(e) => setSearch(e.target.value)}/>
          </div>
          <p>{tickets.length} tickets · {formatHours(total)} HH consumidas en el filtro</p>
          <PortalTable columns={columns} items={tickets} getRowKey={(ticket) => ticket.id}/>
        </Card>
        {selected && <Card>
          <h3>Ticket {selected.code}: {selected.title}</h3>
          <p><strong>Estado:</strong> {statusLabel(selected.status)} · <strong>Prioridad:</strong> {selected.priority}</p>
          <p><strong>Fecha de reporte:</strong> {formatDate(selected.createdAt)}</p>
          <p><strong>Horas utilizadas:</strong> {formatHours(selected.usedHours)}</p>
          <p><strong>Descripción:</strong> {selected.description || 'Sin descripción'}</p>
          <p><strong>Solución:</strong> {selected.resolution || 'Aún no informada'}</p>
          <p><strong>Resolución:</strong> {formatDate(selected.resolvedAt)}</p>
          <Button variant="outline" onClick={() => setSelectedId(null)}>Cerrar detalle</Button>
        </Card>}
      </div>
    </DashboardLayout>
  );
}
