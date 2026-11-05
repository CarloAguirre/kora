import { useMemo, useState } from 'react';
import {
  PROJECT_OBSERVATION_STATUS_LABELS, PROJECT_OBSERVATION_TYPE_LABELS,
  type CollaboratorProjectDetail,
} from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { TextField } from '@/shared/components/ui/TextField';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { SearchIcon, EyeIcon } from '@/shared/components/icons/Icons';
import styles from './MyProjectBitacora.module.css';

interface Row {
  id: string; date: string; title: string; type: string; phase: string; person: string;
  status: string; tone: BadgeTone; detail: string; incident: boolean; work: boolean; milestone: boolean;
  createdAt: string;
}
function rowsFromProject(project: CollaboratorProjectDetail): Row[] {
  const events: Row[] = project.events.map((e) => ({
    id: 'h-' + e.id, date: e.date, createdAt: e.createdAt,
    title: e.userName + ' registró ' + e.hours + ' HH · ' + (e.description || e.activity),
    type: e.hasBlocker ? 'Incidente' : 'Evento', phase: e.moduleName ?? '—',
    person: e.userName, status: 'Aprobado', tone: e.hasBlocker ? 'danger' : 'success',
    detail: [e.activity, e.description, e.blockerDescription ? 'Bloqueo: ' + e.blockerDescription : ''].filter(Boolean).join(' · '),
    incident: e.hasBlocker, work: false, milestone: false,
  }));
  const obs: Row[] = project.observations.map((o) => ({
    id: 'o-' + o.id, date: o.date, createdAt: o.createdAt,
    title: o.title ?? o.message, type: PROJECT_OBSERVATION_TYPE_LABELS[o.type],
    phase: o.moduleName ?? '—', person: o.authorName,
    status: o.status ? PROJECT_OBSERVATION_STATUS_LABELS[o.status] : 'Registrado',
    tone: o.status === 'resuelto' || o.status === 'cumplido' ? 'success'
      : o.status === 'rechazado' || o.status === 'abierto' ? 'danger' : 'neutral',
    detail: o.message, incident: o.type === 'incidente',
    work: Boolean(o.taskId || o.deliveryId), milestone: o.type === 'hito',
  }));
  const deliveries: Row[] = project.modules.flatMap((m) => m.deliveries.map((d) => ({
    id: 'd-' + d.id, date: d.createdAt.slice(0, 10), createdAt: d.createdAt,
    title: d.name ?? 'Entrega de fase: ' + m.name, type: 'Entrega',
    phase: m.name, person: d.assigneeName ?? d.teamName ?? '—',
    status: d.status === 'approved' ? 'Aprobada' : d.status === 'delivered' ? 'Entregada' : 'Planificada',
    tone: (d.status === 'approved' ? 'success' : d.status === 'delivered' ? 'info' : 'neutral') as BadgeTone,
    detail: d.description ?? '', incident: false, work: true, milestone: false,
  })));
  return [...events, ...obs, ...deliveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const dateLabel = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL');

export function MyProjectBitacora({ project }: { project: CollaboratorProjectDetail }) {
  const [filter, setFilter] = useState<'all' | 'incidents' | 'work' | 'milestones'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const rows = useMemo(() => rowsFromProject(project), [project]);
  const filtered = useMemo(() => rows.filter((r) =>
    (filter === 'all' || (filter === 'incidents' && r.incident)
      || (filter === 'work' && r.work) || (filter === 'milestones' && r.milestone))
    && (!from || r.date >= from) && (!to || r.date <= to)
    && (!search.trim() || [r.title, r.person, r.phase, r.detail].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  ), [rows, filter, search, from, to]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / DEFAULT_PAGE_SIZE));
  const visible = filtered.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);
  const columns: Column<Row>[] = [
    { key: 'date', header: 'Fecha', render: (r) => dateLabel(r.date) },
    { key: 'type', header: 'Tipo', render: (r) => <Badge tone={r.incident ? 'danger' : 'neutral'}>{r.type}</Badge> },
    { key: 'description', header: 'Descripción', render: (r) => r.title },
    { key: 'phase', header: 'Fase', render: (r) => r.phase },
    { key: 'responsible', header: 'Responsable', render: (r) => r.person },
    { key: 'status', header: 'Estado', render: (r) => <Badge tone={r.tone}>{r.status}</Badge> },
    { key: 'view', header: 'Ver', align: 'center', render: (r) =>
      <Button variant="ghost" size="icon" aria-label={'Ver detalle ' + r.title}
        onClick={() => setSelected(r)}><EyeIcon size={16} /></Button> },
  ];
  return <Card className={styles.card}>
    <div className={styles.filters}>
      <div className={styles.types} role="group" aria-label="Filtrar bitácora por tipo">
        {([
          ['all', 'Todos'], ['incidents', 'Incidentes'],
          ['work', 'Entregas y tareas'], ['milestones', 'Hitos y observaciones'],
        ] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}
      </div>
      <TextField className={styles.search} label="Buscar" type="search" iconLeft={<SearchIcon size={16}/>}
        placeholder="Buscar en la bitácora…" value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      <TextField className={styles.date} label="Desde" type="date" value={from}
        onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
      <TextField className={styles.date} label="Hasta" type="date" value={to}
        onChange={(e) => { setTo(e.target.value); setPage(1); }} />
    </div>
    {project.activityTruncated && <p className={styles.notice}>
      Se muestran las últimas 500 horas aprobadas; los registros anteriores no están incluidos.
    </p>}
    <DataTable caption="Bitácora de mi proyecto" columns={columns} items={visible}
      getRowKey={(r) => r.id} emptyMessage="No hay registros para los filtros seleccionados." />
    <Pagination page={page} pageCount={pageCount} total={filtered.length}
      pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />
    <Modal title="Detalle del registro" open={Boolean(selected)} onClose={() => setSelected(null)}
      footer={<Button variant="outline" onClick={() => setSelected(null)}>Cerrar</Button>}>
      {selected && <dl className={styles.detail}>
        <dt>Fecha</dt><dd>{dateLabel(selected.date)}</dd>
        <dt>Tipo</dt><dd>{selected.type}</dd>
        <dt>Fase</dt><dd>{selected.phase}</dd>
        <dt>Responsable</dt><dd>{selected.person}</dd>
        <dt>Estado</dt><dd>{selected.status}</dd>
        <dt>Descripción</dt><dd>{selected.detail || selected.title}</dd>
      </dl>}
    </Modal>
  </Card>;
}
