import { describe, expect, it, vi } from 'vitest';
import { GetClientUseCase } from './get-client.use-case';
import type { ClientRepository } from '../../domain/repositories/client.repository';
import type { ClientContactRepository } from '../../domain/repositories/client-contact.repository';
import type { CatalogReader } from '../ports/catalog-reader.port';
import type { CommercialManagerReader } from '../ports/commercial-manager-reader.port';

class FakeClientRepository implements Partial<ClientRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findBySlug = vi.fn().mockResolvedValue(null);
}

const NEVER_USED_CONTACTS = { listForClient: vi.fn() } as unknown as ClientContactRepository;
const NEVER_USED_CATALOGS = {} as unknown as CatalogReader;
const NEVER_USED_MANAGERS = {} as unknown as CommercialManagerReader;

/**
 * `GET /clients/:id` acepta UUID o slug (URLs amigables). Un test que solo
 * revisara "devuelve NotFound si no existe" hubiera seguido pasando aunque
 * la rama `findBySlug` desapareciera por completo — este test fija que se
 * llama al método correcto según la forma del valor recibido.
 */
describe('GetClientUseCase — resolución por id o slug', () => {
  it('con un UUID, busca por id y no por slug', async () => {
    const clients = new FakeClientRepository();
    const useCase = new GetClientUseCase(
      clients as unknown as ClientRepository,
      NEVER_USED_CONTACTS,
      NEVER_USED_CATALOGS,
      NEVER_USED_MANAGERS,
    );

    await useCase.execute({ clientId: '11111111-1111-4111-8111-111111111111' });

    expect(clients.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(clients.findBySlug).not.toHaveBeenCalled();
  });

  it('con un slug, busca por slug y no por id', async () => {
    const clients = new FakeClientRepository();
    const useCase = new GetClientUseCase(
      clients as unknown as ClientRepository,
      NEVER_USED_CONTACTS,
      NEVER_USED_CATALOGS,
      NEVER_USED_MANAGERS,
    );

    await useCase.execute({ clientId: 'amicar' });

    expect(clients.findBySlug).toHaveBeenCalledWith('amicar');
    expect(clients.findById).not.toHaveBeenCalled();
  });
});
