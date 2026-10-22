CREATE TABLE "google_drive_connections" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "google_email" varchar(255) NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "scopes" text NOT NULL,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_drive_connections"
  ADD CONSTRAINT "google_drive_connections_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "google_drive_connections_email_idx"
  ON "google_drive_connections" USING btree ("google_email");
