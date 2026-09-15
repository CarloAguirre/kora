import { useMemo, useState } from 'react';
import type { HourEntrySummary, ProjectModule, ProjectObservation } from '@kora/contracts';
import styles from './BitacoraMiniCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { useToast } from '@/shared/components/ui/Toast';
import { AlertIcon, CheckIcon, PlusIcon } from '@/shared/components/icons/Icons';
import { AddBitacoraRecordModal } from './AddBitacoraRecordModal';
import { rowDateDisplay, rowId, rowPhase, rowStatusBadge, rowTitle, toBitacoraRows } from '../lib/bitacora-row';

const MINI_LIST_SIZE = 7;

export interface BitacoraMiniCardProps {
  projectId: string;
  events: readonly HourEntrySummary[];
  observations: readonly ProjectObservation[];
  modules: readonly ProjectModule[];
  canManage: boolean;
  onViewMore: () => void;
}

/** Vista comprimida de la Bitácora para la columna lateral de la pestaña Resumen — los últimos registros (eventos + manuales), con acceso directo a "Agregar registro" y a la tabla completa. */
export function BitacoraMiniCard({ projectId, events, observations, modules, canManage, onViewMore }: BitacoraMiniCardProps) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const topRows = useMemo(() => toBitacoraRows(events, observations).slice(0, MINI_LIST_SIZE), [events, observations]);

  return (
    <Card>
      <div className={styles.header}>
        <span className={styles.title}>Bitácora</span>
        {canManage && (
          <Button variant="ghost" size="icon" onClick={() => setAddOpen(true)} aria-label="Agregar registro">
            <PlusIcon size={18} />
          </Button>
        )}
      </div>

      {topRows.length === 0 ? (
        <p className={styles.empty}>Aún no hay actividad registrada para este proyecto.</p>
      ) : (
        <div className={styles.list}>
          {topRows.map((row) => {
            const status = rowStatusBadge(row);
            const isAlert = status?.tone === 'danger' || status?.tone === 'warning';
            return (
              <div key={rowId(row)} className={styles.item}>
                <span className={[styles.dot, styles[`dot_${status?.tone ?? 'neutral'}`]].join(' ')}>
                  {isAlert ? <AlertIcon size={14} /> : <CheckIcon size={14} />}
                </span>
                <div className={styles.itemBody}>
                  <span className={styles.itemTitle}>{rowTitle(row)}</span>
                  <span className={styles.itemMeta}>
                    {rowDateDisplay(row)}
                    {rowPhase(row) !== '—' ? ` · ${rowPhase(row)}` : ''}
                  </span>
                  {status && (
                    <Badge className={styles.itemBadge} tone={status.tone}>
                      {status.label}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="ghost" size="sm" className={styles.viewMore} onClick={onViewMore}>
        Ver más
      </Button>

      <AddBitacoraRecordModal
        open={addOpen}
        projectId={projectId}
        modules={modules}
        onClose={() => setAddOpen(false)}
        onSuccess={(message) => toast.success(message)}
      />
    </Card>
  );
}
