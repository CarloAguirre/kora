import { AggregateRoot, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { RoleCode, UserStatus } from '@kora/contracts';
import { Email } from '../value-objects/email.vo';
import { PersonName } from '../value-objects/person-name.vo';
import {
  InvalidStatusTransitionError,
  SelfAuthorizationChangeError,
  UserAlreadyDeletedError,
} from '../errors/user.errors';

/** Estado interno de la entidad. Nadie fuera del dominio lo toca directamente. */
export interface UserProps {
  email: Email;
  name: PersonName;
  role: RoleCode;
  teamId: string | null;
  status: UserStatus;
  isCommercialManager: boolean;
  legacyId: number | null;
  legacyAuthUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateUserProps {
  readonly id: string;
  readonly email: Email;
  readonly name: PersonName;
  readonly role: RoleCode;
  readonly teamId?: string | null;
  readonly isCommercialManager?: boolean;
  readonly now: Date;
}

export interface RestoreUserProps extends UserProps {
  readonly id: string;
}

/**
 * Usuario: raíz del agregado de identidad de negocio.
 *
 * Concentra las reglas que la v1 tenía repartidas entre triggers de Postgres,
 * funciones PL/pgSQL, políticas RLS, la Edge Function de aprovisionamiento y
 * comprobaciones sueltas en los componentes de React. Aquí hay un único lugar
 * donde leerlas y un único lugar donde probarlas.
 *
 * Todos los cambios de estado pasan por métodos con nombre de negocio
 * (`changeRole`, `block`, `assignToTeam`) en vez de setters: la entidad nunca
 * puede quedar en un estado inválido porque no se puede llegar a él.
 */
export class User extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: UserProps,
  ) {
    super(id);
  }

  // ─────────────────────────────── Construcción ───────────────────────────────

  static create(props: CreateUserProps): User {
    const user = new User(props.id, {
      email: props.email,
      name: props.name,
      role: props.role,
      teamId: props.teamId ?? null,
      status: 'active',
      isCommercialManager: props.isCommercialManager ?? false,
      legacyId: null,
      legacyAuthUserId: null,
      createdAt: props.now,
      updatedAt: props.now,
      deletedAt: null,
    });

    user.addDomainEvent(
      createDomainEvent(
        'user.created',
        props.id,
        { email: props.email.value, role: props.role },
        props.now,
      ),
    );

    return user;
  }

  /** Reconstruye la entidad desde la persistencia sin disparar eventos. */
  static restore(props: RestoreUserProps): User {
    const { id, ...rest } = props;
    return new User(id, { ...rest });
  }

  // ──────────────────────────────── Consultas ─────────────────────────────────

  get email(): Email {
    return this.props.email;
  }

  get name(): PersonName {
    return this.props.name;
  }

  get role(): RoleCode {
    return this.props.role;
  }

  get teamId(): string | null {
    return this.props.teamId;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get isCommercialManager(): boolean {
    return this.props.isCommercialManager;
  }

  get legacyId(): number | null {
    return this.props.legacyId;
  }

  get legacyAuthUserId(): string | null {
    return this.props.legacyAuthUserId;
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

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  /** Solo un usuario activo y no eliminado puede iniciar sesión. */
  get canSignIn(): boolean {
    return this.props.status === 'active' && !this.isDeleted;
  }

  // ──────────────────────────────── Comandos ──────────────────────────────────

  rename(name: PersonName, now: Date): void {
    if (this.props.name.equals(name)) return;
    this.props.name = name;
    this.touch(now);
  }

  changeEmail(email: Email, now: Date): void {
    if (this.props.email.equals(email)) return;
    const previous = this.props.email.value;
    this.props.email = email;
    this.touch(now);
    this.addDomainEvent(
      createDomainEvent('user.email_changed', this.id, { from: previous, to: email.value }, now),
    );
  }

  /**
   * Cambia el rol. `actorUserId` es obligatorio precisamente para poder
   * rechazar el autocambio: la regla necesita saber quién ejecuta la acción,
   * así que se exige en la firma en vez de confiar en que el llamador la
   * compruebe antes.
   */
  changeRole(
    role: RoleCode,
    actorUserId: string,
    now: Date,
  ): Result<void, SelfAuthorizationChangeError> {
    if (actorUserId === this.id) {
      return err(new SelfAuthorizationChangeError('rol'));
    }
    if (this.props.role === role) return ok(undefined);

    const previous = this.props.role;
    this.props.role = role;
    this.touch(now);
    this.addDomainEvent(
      createDomainEvent('user.role_changed', this.id, { from: previous, to: role }, now),
    );
    return ok(undefined);
  }

  assignToTeam(teamId: string | null, now: Date): void {
    if (this.props.teamId === teamId) return;
    this.props.teamId = teamId;
    this.touch(now);
  }

  setCommercialManager(value: boolean, now: Date): void {
    if (this.props.isCommercialManager === value) return;
    this.props.isCommercialManager = value;
    this.touch(now);
  }

  /**
   * Transición de estado.
   *
   * `blocked` es un estado que impone el sistema tras demasiados intentos
   * fallidos; `disabled` es una baja administrativa. Distinguirlos permite
   * desbloquear a alguien sin reactivar por error a quien fue dado de baja, y
   * es la razón de que no baste con un booleano.
   */
  changeStatus(
    status: UserStatus,
    actorUserId: string,
    now: Date,
  ): Result<void, SelfAuthorizationChangeError | InvalidStatusTransitionError> {
    if (actorUserId === this.id) {
      return err(new SelfAuthorizationChangeError('estado'));
    }
    if (this.isDeleted) {
      return err(
        new InvalidStatusTransitionError(
          this.props.status,
          status,
          'No se puede cambiar el estado de un usuario eliminado.',
        ),
      );
    }
    if (this.props.status === status) return ok(undefined);

    const previous = this.props.status;
    this.props.status = status;
    this.touch(now);
    this.addDomainEvent(
      createDomainEvent('user.status_changed', this.id, { from: previous, to: status }, now),
    );
    return ok(undefined);
  }

  /** Bloqueo automático por seguridad: no lo ejecuta una persona, así que no
   *  pasa por la regla del autocambio. */
  blockBySystem(now: Date): void {
    if (this.props.status === 'blocked') return;
    const previous = this.props.status;
    this.props.status = 'blocked';
    this.touch(now);
    this.addDomainEvent(
      createDomainEvent(
        'user.status_changed',
        this.id,
        { from: previous, to: 'blocked', bySystem: true },
        now,
      ),
    );
  }

  /**
   * Borrado lógico. Nada se elimina físicamente: las horas registradas, los
   * tickets y los proyectos históricos siguen apuntando a este usuario, y
   * borrarlo de verdad rompería años de datos.
   */
  softDelete(
    actorUserId: string,
    now: Date,
  ): Result<void, SelfAuthorizationChangeError | UserAlreadyDeletedError> {
    if (actorUserId === this.id) {
      return err(new SelfAuthorizationChangeError('cuenta'));
    }
    if (this.isDeleted) {
      return err(new UserAlreadyDeletedError());
    }

    this.props.deletedAt = now;
    this.props.status = 'disabled';
    this.touch(now);
    this.addDomainEvent(createDomainEvent('user.deleted', this.id, {}, now));
    return ok(undefined);
  }

  restoreFromDeletion(now: Date): void {
    if (!this.isDeleted) return;
    this.props.deletedAt = null;
    this.props.status = 'active';
    this.touch(now);
    this.addDomainEvent(createDomainEvent('user.restored', this.id, {}, now));
  }

  /** Enlaza el registro con su origen en el sistema anterior. Solo lo usa el ETL. */
  linkLegacyIdentity(legacyId: number | null, legacyAuthUserId: string | null): void {
    this.props.legacyId = legacyId;
    this.props.legacyAuthUserId = legacyAuthUserId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  /** Instantánea plana para auditoría y para los mapeadores de persistencia. */
  toSnapshot(): {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: RoleCode;
    teamId: string | null;
    status: UserStatus;
    isCommercialManager: boolean;
    legacyId: number | null;
    legacyAuthUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      id: this.id,
      email: this.props.email.value,
      firstName: this.props.name.firstName,
      lastName: this.props.name.lastName,
      role: this.props.role,
      teamId: this.props.teamId,
      status: this.props.status,
      isCommercialManager: this.props.isCommercialManager,
      legacyId: this.props.legacyId,
      legacyAuthUserId: this.props.legacyAuthUserId,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
      deletedAt: this.props.deletedAt,
    };
  }
}
