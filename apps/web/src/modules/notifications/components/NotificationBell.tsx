import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TEAM_REPORT_MISSING_FIELD_LABELS, type LeaderReminders, type Notification } from '@kora/contracts';
import styles from './NotificationBell.module.css';
import { BellIcon, CircleCheckIcon, ClockIcon, FolderOpenIcon } from '@/shared/components/icons/Icons';
import { projectPath } from '@/app/router/paths';
import { useLeaderReminders, useMarkNotificationsRead, useNotifications } from '../api/notifications.queries';

/** Cuántos proyectos se listan por notificación antes de "Ver los N restantes". */
const ITEMS_SHOWN = 4;
/** Cuántos días sin completar se nombran antes de resumir el resto. */
const DAYS_SHOWN = 5;

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** `2026-10-14` → "mié 14-10". */
function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(year, month - 1, day).getDay()]} ${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
}

function projectMissingLabel(project: LeaderReminders['projectsMissingData'][number]): string {
  const teams = project.teamsWithoutAssignedHours;
  return [
    teams.length > 0 ? `${TEAM_REPORT_MISSING_FIELD_LABELS.assigned_hours} (${teams.join(', ')})` : null,
    project.missingDates ? TEAM_REPORT_MISSING_FIELD_LABELS.dates : null,
  ]
    .filter(Boolean)
    .join(' y ');
}

function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/**
 * Campanita de la barra superior. Arriba, los pendientes del líder calculados
 * en vivo (horas por aprobar, horas por registrar, datos de proyecto por
 * completar): no se marcan como leídos, desaparecen al resolverse. Debajo, las
 * notificaciones guardadas (p.ej. "te pide completar datos"). Mismo patrón de
 * apertura/cierre (clic afuera, Escape) que el selector de equipo de `TeamContextBar`.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const { data: reminders } = useLeaderReminders();
  const markRead = useMarkNotificationsRead();
  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const approvals = reminders?.pendingApprovals ?? { entries: 0, hours: 0 };
  const missingDays = reminders?.missingHourDays ?? [];
  const projectsMissingData = reminders?.projectsMissingData ?? [];
  const pendingCount = [approvals.entries > 0, missingDays.length > 0, projectsMissingData.length > 0].filter(Boolean).length;
  // Cada pendiente cuenta como un aviso mientras siga sin resolverse.
  const badgeCount = unread + pendingCount;
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const openItem = (notification: Notification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={badgeCount > 0 ? `Notificaciones (${badgeCount} pendientes)` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon size={20} />
        {badgeCount > 0 && <span className={styles.badge}>{badgeCount > 9 ? '9+' : badgeCount}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notificaciones">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notificaciones</span>
            {unread > 0 && (
              <button type="button" className={styles.linkButton} onClick={() => markRead.mutate(undefined)}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className={styles.body}>
            {pendingCount > 0 && (
              <ul className={styles.list} aria-label="Pendientes">
                {approvals.entries > 0 && (
                  <ReminderItem
                    icon={<CircleCheckIcon size={16} />}
                    title={`${plural(approvals.entries, 'registro', 'registros')} (${formatHours(approvals.hours)} h) por aprobar`}
                    action={{ to: '/horas/aprobaciones', label: 'Ir a Aprobación de HH' }}
                    onNavigate={close}
                  />
                )}
                {missingDays.length > 0 && (
                  <ReminderItem
                    icon={<ClockIcon size={16} />}
                    title={`Te faltan horas en ${plural(missingDays.length, 'día hábil', 'días hábiles')}`}
                    action={{ to: '/horas', label: 'Registrar horas' }}
                    onNavigate={close}
                  >
                    <p className={styles.days}>
                      {missingDays
                        .slice(0, DAYS_SHOWN)
                        .map((day) => (day.hoursRegistered > 0 ? `${formatDay(day.date)} (${formatHours(day.hoursRegistered)} h)` : formatDay(day.date)))
                        .join(' · ')}
                      {missingDays.length > DAYS_SHOWN && ` y ${missingDays.length - DAYS_SHOWN} más`}
                    </p>
                  </ReminderItem>
                )}
                {projectsMissingData.length > 0 && (
                  <ReminderItem
                    icon={<FolderOpenIcon size={16} />}
                    title={`${plural(projectsMissingData.length, 'proyecto', 'proyectos')} con datos por completar`}
                  >
                    <ExpandableList
                      items={projectsMissingData.map((project) => ({
                        key: project.projectId,
                        content: (
                          <>
                            <Link
                              to={projectPath({ id: project.projectId, slug: project.projectSlug })}
                              className={styles.projectLink}
                              onClick={close}
                            >
                              {project.clientName ? `${project.clientName} — ${project.projectName}` : project.projectName}
                            </Link>
                            : <span className={styles.missing}>{projectMissingLabel(project)}</span>
                          </>
                        ),
                      }))}
                    />
                  </ReminderItem>
                )}
              </ul>
            )}

            {items.length > 0 && (
              <ul className={styles.list}>
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={() => openItem(notification)}
                    onNavigate={() => {
                      openItem(notification);
                      close();
                    }}
                  />
                ))}
              </ul>
            )}

            {pendingCount === 0 && items.length === 0 && <p className={styles.empty}>No tienes notificaciones.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onOpen,
  onNavigate,
}: {
  notification: Notification;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const { data } = notification;

  return (
    <li className={[styles.item, notification.readAt ? '' : styles.itemUnread].filter(Boolean).join(' ')} onClick={onOpen}>
      <div className={styles.itemHeader}>
        {!notification.readAt && <span className={styles.unreadDot} aria-label="Sin leer" />}
        <span className={styles.itemTitle}>{notification.title}</span>
      </div>
      <span className={styles.itemTime}>{timeAgo(notification.createdAt)}</span>
      <ExpandableList
        items={data.items.map((item) => ({
          key: item.projectId,
          content: (
            <>
              <Link to={projectPath({ id: item.projectId, slug: item.projectSlug })} className={styles.projectLink} onClick={onNavigate}>
                {item.clientName ? `${item.clientName} — ${item.projectName}` : item.projectName}
              </Link>
              : <span className={styles.missing}>{item.missing.map((field) => TEAM_REPORT_MISSING_FIELD_LABELS[field]).join(' y ')}</span>
            </>
          ),
        }))}
      />
      {data.note && <p className={styles.note}>“{data.note}”</p>}
    </li>
  );
}

/** Pendiente en vivo: no tiene "sin leer" ni fecha — sigue ahí hasta que se resuelve. */
function ReminderItem({
  icon,
  title,
  action,
  onNavigate,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: { to: string; label: string };
  onNavigate?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className={[styles.item, styles.reminder].join(' ')}>
      <span className={styles.reminderIcon}>{icon}</span>
      <div className={styles.reminderBody}>
        <span className={styles.itemTitle}>{title}</span>
        {children}
        {action && (
          <Link to={action.to} className={styles.reminderAction} onClick={onNavigate}>
            {action.label}
          </Link>
        )}
      </div>
    </li>
  );
}

/** Muestra los primeros `ITEMS_SHOWN` proyectos y despliega el resto con "Ver los N restantes". */
function ExpandableList({ items }: { items: ReadonlyArray<{ key: string; content: ReactNode }> }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = items.length - ITEMS_SHOWN;

  return (
    <>
      <ul className={styles.projects}>
        {(expanded ? items : items.slice(0, ITEMS_SHOWN)).map((item) => (
          <li key={item.key}>{item.content}</li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className={styles.linkButton}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? 'Ocultar' : `Ver los ${hidden} restantes`}
        </button>
      )}
    </>
  );
}
