import { useState, type FormEvent, type ReactElement } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import type { HourEntrySummary, HourEntryStatus, ProjectObservation } from '@kora/contracts';
import styles from './BitacoraCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Tabs } from '@/shared/components/ui/Tabs';
import { AlertIcon, CheckIcon, CloseIcon, PaperclipIcon, PencilIcon, TrashIcon, UsersIcon } from '@/shared/components/icons/Icons';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const EVENT_ICON: Record<HourEntryStatus, ReactElement> = {
  approved: <CheckIcon size={16} />,
  rejected: <AlertIcon size={16} />,
  pending: <UsersIcon size={16} />,
};

const EVENT_STATUS_LABEL: Record<HourEntryStatus, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
};

interface BitacoraCardProps {
  events: readonly HourEntrySummary[];
  observations: readonly ProjectObservation[];
  canManage: boolean;
  observationRegister: UseFormRegisterReturn;
  observationError?: string;
  observationSubmitting: boolean;
  onSubmitObservation: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateObservation: (observationId: string, message: string) => Promise<void>;
  onDeleteObservation: (observationId: string) => Promise<void>;
}

/** Réplica de `BitacoraPanel.tsx` (v1): tarjeta "Bitácora" con pestañas Eventos/Observaciones. */
export function BitacoraCard({
  events,
  observations,
  canManage,
  observationRegister,
  observationError,
  observationSubmitting,
  onSubmitObservation,
  onUpdateObservation,
  onDeleteObservation,
}: BitacoraCardProps) {
  const [tab, setTab] = useState<'events' | 'observations'>('events');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEditing = (observation: ProjectObservation) => {
    setEditingId(observation.id);
    setEditValue(observation.message);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEditing = async (observationId: string) => {
    const message = editValue.trim();
    if (!message) return;
    setEditSubmitting(true);
    try {
      await onUpdateObservation(observationId, message);
      setEditingId(null);
      setEditValue('');
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteEntry = async (observationId: string) => {
    setDeletingId(observationId);
    try {
      await onDeleteObservation(observationId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <p className={styles.title}>Bitácora</p>

      <div className={styles.tabs}>
        <Tabs
          tabs={[
            { id: 'events', label: 'Eventos' },
            { id: 'observations', label: 'Observaciones' },
          ]}
          activeId={tab}
          onSelect={(id) => setTab(id as 'events' | 'observations')}
        />
      </div>

      {tab === 'events' ? (
        <div className={styles.list}>
          {events.length === 0 && <p className={styles.empty}>Aún no hay actividades registradas para este proyecto.</p>}
          {events.map((entry) => (
            <div key={entry.id} className={styles.eventCard}>
              <span className={[styles.eventIcon, styles[`eventIcon_${entry.status}`]].join(' ')}>{EVENT_ICON[entry.status]}</span>
              <div className={styles.eventContent}>
                <span className={styles.eventTitle}>
                  {entry.user.fullName} registró {formatHours(entry.hours)} HH{entry.category ? ` · ${entry.category}` : ''}
                </span>
                <span className={styles.eventDate}>{new Date(entry.createdAt).toLocaleString('es-CL')}</span>
                <span className={styles.eventDesc}>{entry.description || 'Sin descripción'}</span>
                <span className={[styles.eventBadge, styles[`eventBadge_${entry.status}`]].join(' ')}>{EVENT_STATUS_LABEL[entry.status]}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {canManage && (
            <form className={styles.composer} onSubmit={onSubmitObservation}>
              <textarea
                className={styles.composerTextarea}
                placeholder="Escribe una nueva entrada para el registro…"
                {...observationRegister}
              />
              {observationError && <span className={styles.composerError}>{observationError}</span>}
              <div className={styles.composerRow}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled
                  title="Adjuntar archivo (próximamente)"
                  aria-label="Adjuntar archivo (próximamente)"
                >
                  <PaperclipIcon size={16} />
                </Button>
                <Button type="submit" size="sm" loading={observationSubmitting} loadingText="Guardando…">
                  Guardar entrada
                </Button>
              </div>
            </form>
          )}

          <div className={styles.list}>
            {observations.length === 0 && <p className={styles.empty}>Aún no hay entradas. Escribe la primera arriba.</p>}
            {observations.map((observation, index) => (
              <div key={observation.id} className={styles.observation}>
                <span className={styles.observationAvatar}>{initialsOf(observation.authorName)}</span>
                <div className={styles.observationBody}>
                  <div className={styles.observationMeta}>
                    <span className={styles.observationAuthor}>{observation.authorName}</span>
                    <span className={styles.eventDate}>{new Date(observation.createdAt).toLocaleString('es-CL')}</span>
                    {index === 0 && <span className={styles.observationNewest}>Más reciente</span>}
                    {(observation.canEdit || observation.canDelete) && editingId !== observation.id && (
                      <span className={styles.observationActions}>
                        {observation.canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(observation)}
                            aria-label="Editar entrada"
                            title="Editar entrada"
                          >
                            <PencilIcon size={14} />
                          </Button>
                        )}
                        {observation.canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={deletingId === observation.id}
                            onClick={() => void deleteEntry(observation.id)}
                            aria-label="Borrar entrada"
                            title="Borrar entrada (disponible por 15 minutos)"
                          >
                            <TrashIcon size={14} />
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                  {editingId === observation.id ? (
                    <div className={styles.observationEdit}>
                      <textarea
                        className={styles.composerTextarea}
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        autoFocus
                      />
                      <div className={styles.composerRow}>
                        <Button type="button" variant="ghost" size="icon" onClick={cancelEditing} aria-label="Cancelar edición">
                          <CloseIcon size={14} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          loading={editSubmitting}
                          loadingText="Guardando…"
                          disabled={!editValue.trim()}
                          onClick={() => void saveEditing(observation.id)}
                        >
                          Guardar cambios
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.observationMessage}>{observation.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
