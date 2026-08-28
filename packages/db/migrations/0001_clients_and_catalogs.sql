CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "business_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comunas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"client_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"position" varchar(200),
	"email" varchar(255),
	"phone" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"company_name" varchar(200) NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"tax_id" varchar(50) NOT NULL,
	"website" varchar(255),
	"address" varchar(300),
	"country_id" uuid,
	"comuna_id" uuid,
	"industry_id" uuid,
	"business_sector_id" uuid,
	"commercial_manager_user_id" uuid,
	"primary_contact_id" uuid,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"service_start_date" date,
	"service_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_comuna_id_comunas_id_fk" FOREIGN KEY ("comuna_id") REFERENCES "public"."comunas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_business_sector_id_business_sectors_id_fk" FOREIGN KEY ("business_sector_id") REFERENCES "public"."business_sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_commercial_manager_user_id_users_id_fk" FOREIGN KEY ("commercial_manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_sectors_name_key" ON "business_sectors" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "business_sectors_legacy_id_key" ON "business_sectors" USING btree ("legacy_id") WHERE "business_sectors"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "comunas_name_key" ON "comunas" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "comunas_legacy_id_key" ON "comunas" USING btree ("legacy_id") WHERE "comunas"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "countries_name_key" ON "countries" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "countries_legacy_id_key" ON "countries" USING btree ("legacy_id") WHERE "countries"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "industries_name_key" ON "industries" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "industries_legacy_id_key" ON "industries" USING btree ("legacy_id") WHERE "industries"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_legacy_id_key" ON "client_contacts" USING btree ("legacy_id") WHERE "client_contacts"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tax_id_key" ON "clients" USING btree ("tax_id") WHERE "clients"."deleted_at" is null and "clients"."tax_id" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "clients_legacy_id_key" ON "clients" USING btree ("legacy_id") WHERE "clients"."legacy_id" is not null;