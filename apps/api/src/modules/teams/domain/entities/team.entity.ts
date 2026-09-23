import { AggregateRoot, assignDefined, createDomainEvent } from '@kora/core';

export interface TeamProps {
  name: string;
  slug: string;
  description: string | null;
  leaderUserId: string | null;
  teamTypeId: string | null;
  isActive: boolean;
  legacyId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateTeamProps {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | null;
  readonly leaderUserId?: string | null;
  readonly teamTypeId?: string | null;
  readonly now: Date;
}

export interface RestoreTeamProps extends TeamProps {
  readonly id: string;
}

/** Equipo: raíz del agregado de organización. La pertenencia vive en `TeamMember`, aparte. */
export class Team extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: TeamProps,
  ) {
    super(id);
  }

  static create(props: CreateTeamProps): Team {
    const team = new Team(props.id, {
      name: props.name.trim(),
      slug: props.slug,
      description: props.description?.trim() || null,
      leaderUserId: props.leaderUserId ?? null,
      teamTypeId: props.teamTypeId ?? null,
      isActive: true,
      legacyId: null,
      createdAt: props.now,
      updatedAt: props.now,
      deletedAt: null,
    });

    team.addDomainEvent(createDomainEvent('team.created', props.id, { name: props.name }, props.now));
    return team;
  }

  static restore(props: RestoreTeamProps): Team {
    const { id, ...rest } = props;
    return new Team(id, { ...rest });
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get description(): string | null {
    return this.props.description;
  }

  get leaderUserId(): string | null {
    return this.props.leaderUserId;
  }

  get teamTypeId(): string | null {
    return this.props.teamTypeId;
  }

  get isActive(): boolean {
    return this.props.isActive;
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

  updateDetails(
    data: Partial<Pick<TeamProps, 'name' | 'description' | 'leaderUserId' | 'teamTypeId' | 'isActive'>>,
    now: Date,
  ): void {
    if (data.name !== undefined) data.name = data.name.trim();
    assignDefined(this.props, data);
    this.touch(now);
  }

  softDelete(now: Date): void {
    if (this.isDeleted) return;
    this.props.deletedAt = now;
    this.props.isActive = false;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('team.deleted', this.id, {}, now));
  }

  linkLegacyId(legacyId: number | null): void {
    this.props.legacyId = legacyId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): TeamProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
