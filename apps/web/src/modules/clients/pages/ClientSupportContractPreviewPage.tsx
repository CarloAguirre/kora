import { useParams } from 'react-router-dom';
import { ClientSupportContractDetailPage } from '@/modules/client-portal/pages/ClientSupportContractDetailPage';

/** Ficha de un contrato de soporte dentro de "Ver como cliente" — llegada
 *  desde `ClientPortalPreviewPage` al hacer click en un contrato de la
 *  pestaña Soporte. Ver el comentario de esa página para por qué existe una
 *  ruta propia en vez de reusar `/portal/soporte/:contractId`. */
export function ClientSupportContractPreviewPage() {
  const { clientId } = useParams<{ clientId: string }>();

  return (
    <ClientSupportContractDetailPage
      backTo={`/clientes/${clientId}/vista-cliente/soporte`}
      backLabel="Volver a soporte"
      title="Clientes"
    />
  );
}
