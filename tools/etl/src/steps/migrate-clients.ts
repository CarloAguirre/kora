import {
  businessSectors,
  clientContacts,
  clients,
  comunas,
  countries,
  eq,
  industries,
  slugify,
  users,
  withUniqueSuffix,
} from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Migra clientes y sus contactos: `cliente` + `contacto_cliente` → `clients` + `client_contacts`.
 *
 * El contacto se migra en el mismo recorrido que el cliente que lo usa, porque
 * en origen el enlace va al revés (`cliente.id_contacto` apunta al contacto, no
 * al contrario). `contacto_cliente` tiene 41 filas pero `cliente` solo enlaza
 * 39: las otras 2 las referencia `proyecto` directamente y quedan pendientes
 * hasta que M3 (Proyectos) las resuelva — se informan, no se pierden en silencio.
 *
 * El responsable comercial se resuelve en dos saltos —`cliente.id_res_comercial`
 * → `responsable_comercial.legacy_usuario_id` → `users.legacy_id`— porque la
 * tabla intermedia de la v1 existía solo para desacoplar nombre y usuario, algo
 * que `users.is_commercial_manager` ya cubre. El eslabón roto real: 1 de 49
 * clientes tiene un responsable sin usuario resoluble, y se informa.
 */

export interface LegacyContactRow {
  id_contacto: number;
  nombre_contacto: string;
  cargo_contacto: string | null;
  correo_contacto: string | null;
  telefono_contacto: string | null;
}

interface LegacyClientRow {
  id_cliente: number;
  empresa: string;
  razon_social: string;
  rut_empresa: string;
  sitio_web: string | null;
  direccion: string | null;
  estado_cliente: string;
  id_pais: number | null;
  id_comuna: number | null;
  id_giro: number | null;
  id_contacto: number | null;
  id_res_comercial: number | null;
  inicio_servicio_cliente: Date | null;
  termino_servicio_cliente: Date | null;
}

export async function migrateClients(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('clientes');
  const contactTracker = new StepTracker('contactos de cliente');

  const rows = (await context.legacyReader.getRows<LegacyClientRow>('cliente')).sort((a, b) => a.id_cliente - b.id_cliente);
  tracker.read = rows.length;

  const contactRows = await context.legacyReader.getRows<LegacyContactRow>('contacto_cliente');
  const contactsById = new Map(contactRows.map((row) => [row.id_contacto, row]));

  const [countryIds, comunaIds, industryIds, managerUserIds] = await Promise.all([
    loadCatalogIds(context, countries),
    loadCatalogIds(context, comunas),
    loadCatalogIds(context, industries),
    loadCommercialManagerUserIds(context),
  ]);

  for (const row of rows) {
    const taxId = row.rut_empresa?.trim();
    if (!taxId) {
      tracker.warn(`cliente ${row.id_cliente} sin RUT; se omite`);
      tracker.skipped += 1;
      continue;
    }

    const status = row.estado_cliente?.trim().toLowerCase() === 'inactivo' ? 'inactive' : 'active';

    const commercialManagerUserId = row.id_res_comercial
      ? (managerUserIds.get(row.id_res_comercial) ?? null)
      : null;
    if (row.id_res_comercial && !commercialManagerUserId) {
      tracker.warn(
        `cliente ${row.id_cliente}: el responsable comercial ${row.id_res_comercial} no resuelve a un usuario`,
      );
    }

    const values = {
      companyName: row.empresa.trim(),
      legalName: row.razon_social?.trim() || row.empresa.trim(),
      taxId,
      website: row.sitio_web?.trim() || null,
      address: row.direccion?.trim() || null,
      countryId: row.id_pais ? (countryIds.get(row.id_pais) ?? null) : null,
      comunaId: row.id_comuna ? (comunaIds.get(row.id_comuna) ?? null) : null,
      industryId: row.id_giro ? (industryIds.get(row.id_giro) ?? null) : null,
      commercialManagerUserId,
      status: status as 'active' | 'inactive',
      serviceStartDate: row.inicio_servicio_cliente,
      serviceEndDate: status === 'inactive' ? row.termino_servicio_cliente : null,
    };

    const existing = await context.target
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.legacyId, row.id_cliente))
      .limit(1);

    let clientId: string;

    if (existing[0]) {
      clientId = existing[0].id;
      await context.target.update(clients).set({ ...values, updatedAt: new Date() }).where(eq(clients.id, clientId));
      tracker.updated += 1;
    } else {
      const slug = await withUniqueSuffix(slugify(values.companyName), async (candidate) => {
        const taken = await context.target.select({ id: clients.id }).from(clients).where(eq(clients.slug, candidate)).limit(1);
        return taken.length > 0;
      });
      const inserted = await context.target
        .insert(clients)
        .values({ legacyId: row.id_cliente, slug, ...values })
        .returning({ id: clients.id });
      const createdId = inserted[0]?.id;
      if (!createdId) {
        tracker.warn(`cliente ${row.id_cliente}: la inserción no devolvió identificador`);
        tracker.skipped += 1;
        continue;
      }
      clientId = createdId;
      tracker.created += 1;
    }

    // El contacto principal del cliente, si lo tenía en origen.
    if (row.id_contacto) {
      const legacyContact = contactsById.get(row.id_contacto);
      if (legacyContact) {
        const { id: contactId, created } = await upsertContact(context, clientId, legacyContact);
        contactTracker.read += 1;
        created ? (contactTracker.created += 1) : (contactTracker.updated += 1);
        await context.target.update(clients).set({ primaryContactId: contactId }).where(eq(clients.id, clientId));
      } else {
        tracker.warn(`cliente ${row.id_cliente}: el contacto ${row.id_contacto} no existe en origen`);
      }
    }
  }

  context.report.add(tracker.toResult());

  // Los contactos que la v1 solo enlaza desde `proyecto` (no desde `cliente`)
  // los resuelve `migrateProjectPrimaryContacts` en `migrate-projects.ts` —
  // este contador solo refleja lo que quedó pendiente en ESTA pasada.
  contactTracker.skipped = contactRows.length - contactTracker.read;
  context.report.add(contactTracker.toResult());
}

/** Exportado: `migrate-projects.ts` la reutiliza para los 2 contactos que la v1 solo enlaza desde `proyecto`. */
export async function upsertContact(
  context: EtlContext,
  clientId: string,
  legacy: LegacyContactRow,
): Promise<{ id: string; created: boolean }> {
  const existing = await context.target
    .select({ id: clientContacts.id })
    .from(clientContacts)
    .where(eq(clientContacts.legacyId, legacy.id_contacto))
    .limit(1);

  const values = {
    clientId,
    name: legacy.nombre_contacto.trim(),
    position: legacy.cargo_contacto?.trim() || null,
    email: legacy.correo_contacto?.trim() || null,
    phone: legacy.telefono_contacto?.trim() || null,
  };

  if (existing[0]) {
    await context.target.update(clientContacts).set({ ...values, updatedAt: new Date() }).where(eq(clientContacts.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }

  const inserted = await context.target
    .insert(clientContacts)
    .values({ legacyId: legacy.id_contacto, ...values })
    .returning({ id: clientContacts.id });

  const id = inserted[0]?.id;
  if (!id) throw new Error(`No se pudo crear el contacto ${legacy.id_contacto}`);
  return { id, created: true };
}

async function loadCatalogIds(
  context: EtlContext,
  table: typeof countries | typeof comunas | typeof industries | typeof businessSectors,
): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: table.id, legacyId: table.legacyId }).from(table);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

/** `responsable_comercial.id_responsable_comercial` → `users.id`, pasando por `legacy_usuario_id`. */
async function loadCommercialManagerUserIds(context: EtlContext): Promise<Map<number, string>> {
  const legacyRows = await context.legacyReader.getRows<{ id_responsable_comercial: number; legacy_usuario_id: number | null }>(
    'responsable_comercial',
  );

  const userRows = await context.target.select({ id: users.id, legacyId: users.legacyId }).from(users);
  const userIdByLegacyId = new Map<number, string>();
  for (const row of userRows) if (row.legacyId !== null) userIdByLegacyId.set(row.legacyId, row.id);

  const map = new Map<number, string>();
  for (const row of legacyRows) {
    if (!row.legacy_usuario_id) continue;
    const userId = userIdByLegacyId.get(row.legacy_usuario_id);
    if (userId) map.set(row.id_responsable_comercial, userId);
  }
  return map;
}
