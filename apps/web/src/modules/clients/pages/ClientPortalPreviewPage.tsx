import { useParams } from 'react-router-dom';
import { ClientPortalPage } from '@/modules/client-portal/pages/ClientPortalPage';

/**
 * "Ver como cliente" desde `ClientDetailPage` — no es la ruta real del portal
 * (`/portal/proyectos`, que exige el permiso `projects:read_own_client` que
 * admin/pmo NO tienen a propósito, ver `roles.ts`). Reutiliza la misma lista
 * de proyectos/soporte, con rutas propias bajo `/clientes/:clientId/vista-cliente/...`
 * para que el botón "Volver" y el click en un proyecto se queden dentro de
 * esta vista previa en vez de mandar al admin a una ruta del portal a la que
 * no tiene acceso.
 */
export function ClientPortalPreviewPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const base = `/clientes/${clientId}/vista-cliente`;

  return (
    <ClientPortalPage
      clientId={clientId}
      projectsPath={base}
      supportPath={`${base}/soporte`}
      getProjectPath={(project) => `${base}/${project.slug || project.id}`}
      getContractPath={(contract) => `${base}/soporte/${contract.slug || contract.id}`}
      backTo={`/clientes/${clientId}`}
      backLabel="Volver al cliente"
    />
  );
}
