-- Catálogo único para el editor comercial y las listas desplegables XLSX.
-- No altera la EDT de Gemini ni las cotizaciones/versiones existentes.
CREATE TABLE IF NOT EXISTS "quotation_task_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(40) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotation_task_types_name_key"
  ON "quotation_task_types" (lower(btrim("name")));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_task_types_active_sort_idx"
  ON "quotation_task_types" ("is_active", "sort_order");
--> statement-breakpoint
-- Valores originales del catálogo del prototipo v5, administrables desde BD.
INSERT INTO "quotation_task_types" ("name", "sort_order") VALUES
  ('Sin tipo', 0),
  ('Diseño de flujo y maquetas', 1),
  ('Login y registro', 2),
  ('CRUD / mantenedor', 3),
  ('Pantalla de consulta', 4),
  ('Integración con API', 5),
  ('Notificaciones', 6),
  ('Reportería', 7),
  ('Carga masiva', 8),
  ('Bot / automatización', 9),
  ('Modelo o agente IA', 10),
  ('Pruebas funcionales', 11),
  ('UAT', 12),
  ('Gestión y seguimiento', 13),
  ('Despliegue', 14),
  ('Marcha blanca', 15)
ON CONFLICT DO NOTHING;
