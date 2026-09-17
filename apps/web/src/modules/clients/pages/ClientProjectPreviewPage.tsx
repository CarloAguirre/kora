import { useParams } from 'react-router-dom';
import { ClientProjectDetailPage } from '@/modules/client-portal/pages/ClientProjectDetailPage';

/** Ficha de un proyecto dentro de "Ver como cliente" — llegada desde
 *  `ClientPortalPreviewPage` al hacer click en un proyecto de la lista.
 *  Ver el comentario de esa página para por qué existe una ruta propia en
 *  vez de reusar `/portal/proyectos/:projectId`. */
export function ClientProjectPreviewPage() {
  const { clientId } = useParams<{ clientId: string }>();

  return (
    <ClientProjectDetailPage
      backTo={`/clientes/${clientId}/vista-cliente`}
      backLabel="Volver a proyectos"
    />
  );
}
