import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TEAM_REPORT_MISSING_FIELD_LABELS, type Notification } from '@kora/contracts';
import styles from './NotificationBell.module.css';
import { BellIcon } from '@/shared/components/icons/Icons';
import { projectPath } from '@/app/router/paths';
import { useMarkNotificationsRead, useNotifications } from '../api/notifications.queries';

/** Cuántos proyectos se listan por notificación antes de "Ver los N restantes". */
const ITEMS_SHOWN = 4;

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
 * Campanita de la barra superior: contador de no leídas y panel con las
 * notificaciones recientes. Mismo patrón de apertura/cierre (clic afuera,
 * Escape) que el selector de equipo de `TeamContextBar`.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

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
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon size={20} />
        {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
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

          {items.length === 0 ? (
            <p className={styles.empty}>No tienes notificaciones.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onOpen={() => openItem(notification)}
                  onNavigate={() => {
                    openItem(notification);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
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
  const [expanded, setExpanded] = useState(false);
  const { data } = notification;
  const shown = expanded ? data.items : data.items.slice(0, ITEMS_SHOWN);
  const hidden = data.items.length - ITEMS_SHOWN;

  return (
    <li className={[styles.item, notification.readAt ? '' : styles.itemUnread].filter(Boolean).join(' ')} onClick={onOpen}>
      <div className={styles.itemHeader}>
        {!notification.readAt && <span className={styles.unreadDot} aria-label="Sin leer" />}
        <span className={styles.itemTitle}>{notification.title}</span>
      </div>
      <span className={styles.itemTime}>{timeAgo(notification.createdAt)}</span>
      <ul className={styles.projects}>
        {shown.map((item) => (
          <li key={item.projectId}>
            <Link to={projectPath({ id: item.projectId, slug: item.projectSlug })} className={styles.projectLink} onClick={onNavigate}>
              {item.clientName ? `${item.clientName} — ${item.projectName}` : item.projectName}
            </Link>
            : <span className={styles.missing}>{item.missing.map((field) => TEAM_REPORT_MISSING_FIELD_LABELS[field]).join(' y ')}</span>
          </li>
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
      {data.note && <p className={styles.note}>“{data.note}”</p>}
    </li>
  );
}
