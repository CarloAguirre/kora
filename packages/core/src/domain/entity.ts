/**
 * Bloques básicos del modelo de dominio.
 *
 * Entity  → tiene identidad propia y ciclo de vida; dos entidades son la misma
 *           si comparten id, aunque todos sus atributos difieran.
 * ValueObject → no tiene identidad; dos value objects son iguales si todos sus
 *           atributos lo son. Siempre inmutables y siempre válidos por
 *           construcción (se crean vía un factory que devuelve Result).
 */

export abstract class Entity<TId> {
  protected constructor(protected readonly _id: TId) {}

  get id(): TId {
    return this._id;
  }

  equals(other?: Entity<TId> | null): boolean {
    if (other === null || other === undefined) return false;
    if (this === other) return true;
    if (!(other instanceof Entity)) return false;
    return String(this._id) === String(other._id);
  }
}

export abstract class ValueObject<TProps extends object> {
  protected constructor(protected readonly props: Readonly<TProps>) {
    Object.freeze(this.props);
  }

  equals(other?: ValueObject<TProps> | null): boolean {
    if (other === null || other === undefined) return false;
    if (this === other) return true;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}

/**
 * Raíz de agregado: la única entidad de un agregado a la que se puede
 * referenciar desde fuera, y el único punto por el que un repositorio persiste.
 * Acumula eventos de dominio que la capa de aplicación publica tras el commit.
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }
}

export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}

export function createDomainEvent(
  name: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  occurredAt: Date,
): DomainEvent {
  return Object.freeze({ name, aggregateId, payload: Object.freeze(payload), occurredAt });
}
