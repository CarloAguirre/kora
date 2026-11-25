import { useEffect, useState } from 'react';
import type { ClientDetail, ProjectSummary, SupportPlanListItem, ClientPortalGrantInput } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { usePortalAccess, useSetPortalAccess } from '@/modules/client-portal/api/client-portal.api';

/**
 * Gestión interna por contacto, separada de /clientes/:id/vista-cliente.
 * No concede visibilidad implícita a todos los proyectos de la compañía.
 */
export function ClientPortalAccessManager({ client, projects, supportPlans }: {
  client: ClientDetail;
  projects: readonly ProjectSummary[];
  supportPlans: readonly SupportPlanListItem[];
}) {
  const { data: access, isLoading, isError } = usePortalAccess(client.id);
  const save = useSetPortalAccess(client.id);
  const toast = useToast();
  const [contactId, setContactId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [supportPlanIds, setSupportPlanIds] = useState<string[]>([]);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const contact = client.contacts.find((entry) => entry.id === contactId);
  const record = access?.find((entry) => entry.contactId === contactId);
  useEffect(() => {
    if (!contactId) return;
    const selected = access?.find((entry) => entry.contactId === contactId);
    setEnabled(selected?.enabled ?? false);
    setProjectIds(selected?.projectIds ?? []);
    setSupportPlanIds(selected?.supportPlanIds ?? []);
    setConfirmDisable(false);
  }, [contactId, access]);

  const toggle = (id: string, ids: string[], setter: (ids: string[]) => void) =>
    setter(ids.includes(id) ? ids.filter((old) => old !== id) : [...ids, id]);

  async function submit() {
    if (!contact) return;
    if (!enabled && !record) {
      setContactId(null);
      return;
    }
    if (!enabled && record && !confirmDisable) {
      setConfirmDisable(true);
      return;
    }
    const grant: ClientPortalGrantInput = {
      enabled, projectIds: enabled ? projectIds : [], supportPlanIds: enabled ? supportPlanIds : [],
    };
    try {
      const result = await save.mutateAsync({ contactId: contact.id, grant });
      if (result.invitationAttempted && !result.invitationSent) {
        toast.show('Acceso guardado, pero no se pudo enviar la invitación. Revisa el correo y vuelve a guardar para reintentar.', 'error');
      } else {
        toast.show(result.invitationSent
          ? 'Se invitó al contacto para definir su contraseña y se configuraron sus accesos.'
          : enabled ? 'Accesos actualizados.' : 'Acceso al portal revocado.',
        'success');
      }
      setContactId(null);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'No se pudo modificar el acceso.', 'error');
    }
  }

  return (
    <Card>
      <h3>Acceso al portal de clientes</h3>
      <p>Habilita contactos externos y define exactamente qué proyectos y contratos pueden consultar.
        Esta configuración no cambia la «Vista cliente» de PMO.</p>
      {isLoading && <p>Cargando autorizaciones…</p>}
      {isError && <p role="alert">No fue posible consultar las autorizaciones de los contactos.</p>}
      {!isLoading && !isError && client.contacts.length === 0 && <p>Primero registra un contacto con correo.</p>}
      {!isLoading && !isError && client.contacts.map((entry) => {
        const grant = access?.find((row) => row.contactId === entry.id);
        return (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <strong>{entry.name}</strong>
              <div>{entry.email ?? 'Sin correo'}</div>
              <small>{grant?.enabled ? `Habilitado · ${grant.projectIds.length} proyectos · ${grant.supportPlanIds.length} contratos`
                : 'Sin acceso al portal'}</small>
            </div>
            <Button variant="outline" size="sm" disabled={!entry.email}
              onClick={() => setContactId(entry.id)}>
              {grant ? 'Configurar acceso' : 'Habilitar acceso'}
            </Button>
          </div>
        );
      })}
      <Modal open={!!contact} title="Acceso de contacto al portal"
        description={contact ? `${contact.name} · ${contact.email}` : ''}
        onClose={() => setContactId(null)} dismissible={!save.isPending}
        footer={<>
          <Button variant="outline" disabled={save.isPending} onClick={() => setContactId(null)}>Cancelar</Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {confirmDisable ? 'Confirmar revocación' : 'Guardar acceso'}
          </Button>
        </>}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 12 }}>
          <input type="checkbox" checked={enabled} onChange={(event) => {
            setEnabled(event.target.checked); setConfirmDisable(false);
          }}/>
          <strong>Permitir acceso al portal</strong>
        </label>
        {enabled && <>
          <h4>Proyectos de desarrollo autorizados</h4>
          {projects.filter((project) => project.type === 'development').map((project) => (
            <label key={project.id} style={{ display: 'flex', gap: 8, padding: 6 }}>
              <input type="checkbox" checked={projectIds.includes(project.id)}
                onChange={() => toggle(project.id, projectIds, setProjectIds)}/>
              {project.name}
            </label>
          ))}
          <h4>Contratos de soporte autorizados</h4>
          {supportPlans.map((plan) => (
            <label key={plan.id} style={{ display: 'flex', gap: 8, padding: 6 }}>
              <input type="checkbox" checked={supportPlanIds.includes(plan.id)}
                onChange={() => toggle(plan.id, supportPlanIds, setSupportPlanIds)}/>
              {plan.name}
            </label>
          ))}
          <p><small>Solo los elementos seleccionados serán visibles. El backend valida su pertenencia a la empresa.</small></p>
        </>}
        {confirmDisable && <p role="alert">
          Se revocará inmediatamente el acceso a todos los proyectos y contratos de este contacto. Confirma para continuar.
        </p>}
      </Modal>
    </Card>
  );
}
