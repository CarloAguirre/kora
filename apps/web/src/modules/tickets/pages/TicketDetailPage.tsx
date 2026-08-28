import { Navigate, useParams } from 'react-router-dom';

/**
 * `/tickets/:ticketId` — en la v1 la ficha de ticket es un modal sobre el
 * tablero (`Soporte/index.tsx`), no una ruta propia; se llega a ella
 * navegando a `/tickets` con `location.state.openTicketId`. Esta ruta existe
 * sólo como enlace directo (p.ej. tras crear un ticket) y redirige al
 * tablero con ese estado.
 */
export function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  return <Navigate to="/tickets" replace state={{ openTicketId: ticketId }} />;
}
