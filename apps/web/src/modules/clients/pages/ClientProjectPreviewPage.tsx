import { useParams } from 'react-router-dom';
import { ClientProjectDetailPage } from '@/modules/client-portal/pages/ClientProjectDetailPage';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { projectPath } from '@/app/router/paths';

/** Ficha de un proyecto dentro de "Ver como cliente" — llegada desde
 *  `ClientPortalPreviewPage` al hacer click en un proyecto de la lista, o
 *  desde la pestaña "Vista Cliente" de la ficha interna. Ver el comentario de
 *  esa página para por qué existe una ruta propia en vez de reusar
 *  `/portal/proyectos/:projectId`. */
export function ClientProjectPreviewPage() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId: string }>();
  const { can } = usePermissions();
  const canSeeInternalView = can('projects:read') || can('projects:read_assigned');

  return (
    <ClientProjectDetailPage
      backTo={`/clientes/${clientId}/vista-cliente`}
      backLabel="Volver a proyectos del cliente"
      internalViewTo={canSeeInternalView && projectId ? projectPath({ id: projectId }) : undefined}
    />
  );
}
