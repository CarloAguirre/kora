CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'restore', 'status_change', 'role_change', 'login', 'login_failed', 'logout', 'password_change', 'password_reset_requested', 'password_reset_completed', 'access_granted', 'access_revoked');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('password', 'google', 'legacy_supabase');--> statement-breakpoint
CREATE TYPE "public"."password_algorithm" AS ENUM('argon2id', 'bcrypt');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('grant', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."session_revoke_reason" AS ENUM('logout', 'rotated', 'password_changed', 'status_changed', 'admin_revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'blocked');--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" varchar(120),
	"weekly_hours" numeric(5, 2) DEFAULT '44' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"leader_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"resource" varchar(40) NOT NULL,
	"action" varchar(40) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_admin_tier" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "session_revoke_reason",
	"rotated_from_id" uuid,
	"last_used_at" timestamp with time zone,
	"user_agent" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text,
	"password_algorithm" "password_algorithm",
	"password_updated_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"email" varchar(255),
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"reason" text,
	"granted_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_overrides_user_id_permission_id_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"legacy_auth_user_id" uuid,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role_id" uuid NOT NULL,
	"team_id" uuid,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"is_commercial_manager" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" varchar(255),
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(100),
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(64),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_active_key" ON "team_members" USING btree ("team_id","user_id") WHERE "team_members"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_legacy_id_key" ON "team_members" USING btree ("legacy_id") WHERE "team_members"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_key" ON "teams" USING btree (lower(btrim("name"))) WHERE "teams"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_legacy_id_key" ON "teams" USING btree ("legacy_id") WHERE "teams"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "teams_leader_idx" ON "teams" USING btree ("leader_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_key" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_credentials_locked_until_idx" ON "user_credentials" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_account_key" ON "user_identities" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "user_identities_user_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower(btrim("email"))) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_legacy_id_key" ON "users" USING btree ("legacy_id") WHERE "users"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_legacy_auth_user_id_key" ON "users" USING btree ("legacy_auth_user_id") WHERE "users"."legacy_auth_user_id" is not null;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_team_idx" ON "users" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");