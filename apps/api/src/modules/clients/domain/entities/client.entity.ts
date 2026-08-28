import { AggregateRoot, createDomainEvent } from '@kora/core';
import type { ClientStatus } from '@kora/contracts';
import { TaxId } from '../value-objects/tax-id.vo';

export interface ClientProps {
  companyName: string;
  legalName: string;
  taxId: TaxId;
  website: string | null;
  address: string | null;
  countryId: string | null;
  comunaId: string | null;
  industryId: string | null;
  businessSectorId: string | null;
  commercialManagerUserId: string | null;
  primaryContactId: string | null;
  status: ClientStatus;
  serviceStartDate: Date | null;
  serviceEndDate: Date | null;
  legacyId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateClientProps {
  readonly id: string;
  readonly companyName: string;
  readonly legalName: string;
  readonly taxId: TaxId;
  readonly website?: string | null;
  readonly address?: string | null;
  readonly countryId?: string | null;
  readonly comunaId?: string | null;
  readonly industryId?: string | null;
  readonly businessSectorId?: string | null;
  readonly commercialManagerUserId?: string | null;
  readonly serviceStartDate?: Date | null;
  readonly now: Date;
}

export interface RestoreClientProps extends ClientProps {
  readonly id: string;
}

/**
 * Cliente: raíz del agregado de cartera comercial.
 *
 * La única regla de negocio que vive aquí (y no en el caso de uso) es que
 * finalizar el servicio de un cliente cierra su ventana temporal. El resto de
 * la regla compleja de la v1 —desactivar un cliente finaliza sus proyectos—
 * NO vive en la entidad: necesita mirar fuera del agregado (cuántos proyectos
 * tiene), así que es responsabilidad del caso de uso, no de `Client`.
 */
export class Client extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: ClientProps,
  ) {
    super(id);
  }

  static create(props: CreateClientProps): Client {
    const client = new Client(props.id, {
      companyName: props.companyName.trim(),
      legalName: props.legalName.trim(),
      taxId: props.taxId,
      website: props.website?.trim() || null,
      address: props.address?.trim() || null,
      countryId: props.countryId ?? null,
      comunaId: props.comunaId ?? null,
      industryId: props.industryId ?? null,
      businessSectorId: props.businessSectorId ?? null,
      commercialManagerUserId: props.commercialManagerUserId ?? null,
      primaryContactId: null,
      status: 'active',
      serviceStartDate: props.serviceStartDate ?? null,
      serviceEndDate: null,
      legacyId: null,
      createdAt: props.now,
      updatedAt: props.now,
      deletedAt: null,
    });

    client.addDomainEvent(
      createDomainEvent('client.created', props.id, { companyName: props.companyName }, props.now),
    );

    return client;
  }

  static restore(props: RestoreClientProps): Client {
    const { id, ...rest } = props;
    return new Client(id, { ...rest });
  }

  get companyName(): string {
    return this.props.companyName;
  }

  get legalName(): string {
    return this.props.legalName;
  }

  get taxId(): TaxId {
    return this.props.taxId;
  }

  get status(): ClientStatus {
    return this.props.status;
  }

  get commercialManagerUserId(): string | null {
    return this.props.commercialManagerUserId;
  }

  get primaryContactId(): string | null {
    return this.props.primaryContactId;
  }

  get legacyId(): number | null {
    return this.props.legacyId;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  updateDetails(
    data: Partial<
      Pick<
        ClientProps,
        | 'companyName'
        | 'legalName'
        | 'taxId'
        | 'website'
        | 'address'
        | 'countryId'
        | 'comunaId'
        | 'industryId'
        | 'businessSectorId'
        | 'commercialManagerUserId'
        | 'serviceStartDate'
      >
    >,
    now: Date,
  ): void {
    Object.assign(this.props, data);
    this.touch(now);
  }

  setPrimaryContact(contactId: string | null, now: Date): void {
    if (this.props.primaryContactId === contactId) return;
    this.props.primaryContactId = contactId;
    this.touch(now);
  }

  /** Activa el cliente. No tiene efectos en cascada: solo reabre la ventana de servicio. */
  activate(now: Date): void {
    if (this.props.status === 'active') return;
    this.props.status = 'active';
    this.props.serviceEndDate = null;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('client.activated', this.id, {}, now));
  }

  /**
   * Desactiva el cliente y cierra su ventana de servicio.
   *
   * Este método NO decide si hace falta confirmación ni finaliza proyectos:
   * eso vive en `DeactivateClientUseCase`, que sí puede consultar cuántos
   * proyectos activos tiene antes de llegar aquí. La entidad solo aplica el
   * cambio una vez que esa decisión ya se tomó.
   */
  deactivate(now: Date): void {
    if (this.props.status === 'inactive') return;
    this.props.status = 'inactive';
    this.props.serviceEndDate = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('client.deactivated', this.id, {}, now));
  }

  softDelete(now: Date): void {
    if (this.isDeleted) return;
    this.props.deletedAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('client.deleted', this.id, {}, now));
  }

  linkLegacyId(legacyId: number | null): void {
    this.props.legacyId = legacyId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): ClientProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
