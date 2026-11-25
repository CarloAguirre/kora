-- Facturación parcial de un período de soporte: las facturas de un mes se
-- pueden emitir en distintos momentos. Mientras la suma sea menor que el total
-- esperado (target_amount_uf), el saldo sigue por facturar. NULL = período
-- cerrado por la suma de sus facturas (todas las filas existentes).
ALTER TABLE "support_invoices" ADD COLUMN IF NOT EXISTS "target_amount_uf" numeric(12,2);
