import { useMemo } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { CalendarIcon, CircleCheckIcon, DiamondIcon } from '@/shared/components/icons/Icons';
import { StatusPill } from './StatusPill';
import styles from './CommittedDeliveriesRoadmap.module.css';

export interface CommittedDelivery {
  id: string;
  name: string;
  phase: string;
  team: string | null;
  estimatedDate: string;
  status: 'planned' | 'approved';
  received: boolean;
}

const formatDate = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!))
    .toLocaleDateString('es-CL', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
};
const dateValue = (date: string) => Date.parse(date.slice(0, 10) + 'T00:00:00Z');
const DAY = 86_400_000;

function deliveryState(item: CommittedDelivery, today: string) {
  if (item.received) return { label: 'OK del cliente', tone: 'success' as const, className: styles.received };
  if (item.status === 'approved') return {
    label: 'Entregada · pendiente de OK', tone: 'warning' as const, className: styles.waiting,
  };
  if (item.estimatedDate < today) return {
    label: 'Fecha comprometida vencida', tone: 'warning' as const, className: styles.delayed,
  };
  return { label: 'Comprometida', tone: 'neutral' as const, className: styles.committed };
}

/**
 * La vista EXTERNA solo presenta compromisos de entrega. No divulga tareas,
 * bloques, horas asignadas, ni fases operativas como si fueran compromisos.
 * Las fases se muestran como contexto de cada entrega, no como eje del Gantt.
 */
export function CommittedDeliveriesRoadmap({
  deliveries,
  onReview,
}: {
  readonly deliveries: readonly CommittedDelivery[];
  readonly onReview: (deliveryId: string) => void;
}) {
  const sorted = useMemo(() =>
    [...deliveries].sort((a, b) => a.estimatedDate.localeCompare(b.estimatedDate) || a.name.localeCompare(b.name)),
  [deliveries]);
  // Fecha local: en Chile UTC adelanta el día a partir de las 21:00.
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const awaiting = sorted.filter((entry) => entry.status === 'approved' && !entry.received).length;
  const received = sorted.filter((entry) => entry.received).length;

  if (sorted.length === 0) {
    return <div className={styles.empty}>Todavía no existen entregas comprometidas para este proyecto.</div>;
  }

  // Eje temporal real: las distancias se calculan por fecha, no por posición en el array.
  const minDate = Math.min(...sorted.map((entry) => dateValue(entry.estimatedDate))) - DAY * 7;
  const maxDate = Math.max(...sorted.map((entry) => dateValue(entry.estimatedDate))) + DAY * 7;
  const width = Math.max(1000, sorted.length * 125);
  const percentOf = (date: string) =>
    Math.max(0, Math.min(100, (dateValue(date) - minDate) / (maxDate - minDate) * 100));
  const todayPercent = (dateValue(today) - minDate) / (maxDate - minDate) * 100;
  const monthTicks: Array<{ id: string; label: string; left: number }> = [];
  const cursor = new Date(minDate);
  cursor.setUTCDate(1);
  if (cursor.getTime() < minDate) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() <= maxDate && monthTicks.length < 36) {
    const id = cursor.toISOString().slice(0, 10);
    monthTicks.push({
      id,
      label: cursor.toLocaleDateString('es-CL', { timeZone: 'UTC', month: 'short', year: '2-digit' }),
      left: percentOf(id),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <div className={styles.card}>
      <div className={styles.topline}>
        <div className={styles.chips}>
          <span>{sorted.length} entregas comprometidas</span>
          <span>{awaiting} esperando OK</span>
          <span>{received} recibidas</span>
        </div>
        <span className={styles.caption}>Fechas de entrega acordadas y recepción del cliente</span>
      </div>
      <div className={styles.legend}>
        <span><i className={styles.committedKey}/> Comprometida</span>
        <span><i className={styles.waitingKey}/> Entregada · esperando OK</span>
        <span><i className={styles.receivedKey}/> OK del cliente</span>
        <span><i className={styles.delayedKey}/> Fecha vencida</span>
      </div>
      <div className={styles.scroll} tabIndex={0} aria-label="Calendario cronológico de entregas comprometidas">
        <div className={styles.timeline} style={{ minWidth: width }}>
          <div className={styles.axis}>
            {monthTicks.map((tick) => <span key={tick.id} className={styles.tick} style={{ left: `${tick.left}%` }}>
              {tick.label}
            </span>)}
          </div>
          <div className={styles.track}>
            {monthTicks.map((tick) => <span aria-hidden key={tick.id}
              className={styles.gridLine} style={{ left: `${tick.left}%` }}/>)}
            {todayPercent >= 0 && todayPercent <= 100 && (
              <span className={styles.today} style={{ left: `${todayPercent}%` }} title="Hoy">
                <span>Hoy</span>
              </span>
            )}
            {sorted.map((delivery, idx) => {
              const state = deliveryState(delivery, today);
              return (
                <div key={delivery.id}
                  className={[styles.marker, state.className].join(' ')}
                  style={{ left: `${percentOf(delivery.estimatedDate)}%`, top: `${idx % 3 * 38 + 12}px` }}
                  title={`${delivery.name} · ${formatDate(delivery.estimatedDate)} · ${state.label}`}>
                  <DiamondIcon size={18}/>
                  <span>{delivery.name}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.dates}>
            <span>{formatDate(new Date(minDate).toISOString())}</span>
            <span>{formatDate(new Date(maxDate).toISOString())}</span>
          </div>
        </div>
      </div>

      <div className={styles.deliveriesTitle}>Entregas comprometidas</div>
      <div className={styles.deliveries}>
        {sorted.map((delivery) => {
          const state = deliveryState(delivery, today);
          return (
            <div key={delivery.id} className={[styles.deliveryRow, delivery.received ? styles.deliveryReceived : ''].join(' ')}>
              <span className={[styles.diamond, state.className].join(' ')}><DiamondIcon size={17}/></span>
              <div className={styles.deliveryText}>
                <strong>{delivery.name}</strong>
                <span>{delivery.phase}{delivery.team ? ` · ${delivery.team}` : ''} · Comprometida para el {formatDate(delivery.estimatedDate)}</span>
              </div>
              <StatusPill tone={state.tone}>{state.label}</StatusPill>
              {delivery.status === 'approved' && !delivery.received && (
                <Button size="sm" iconLeft={<CircleCheckIcon size={14}/>}
                  onClick={() => onReview(delivery.id)}>
                  Dar OK
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className={styles.help}><CalendarIcon size={14}/> Las fechas se mantienen según lo planificado.
        El OK acredita recepción, no reemplaza la aprobación técnica interna.</p>
    </div>
  );
}
