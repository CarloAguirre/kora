import { sql } from 'drizzle-orm';
import { createDatabaseConnection } from './client';

/**
 * Enlaza a sus facturas los tickets de contratos `monthly`/`bundle` que se
 * facturaron antes de que `MarkSupportInvoiceIssuedUseCase` empezara a
 * enlazarlos (antes solo lo hacía `on_demand`), para que dejen de verse
 * "Por facturar".
 *
 * Misma regla que `findUnbilledIdsWithHoursBefore`: un ticket del contrato
 * (proyecto contenedor o cubierto) sin factura, con horas aprobadas antes del
 * fin del período facturado (`monthly`) o del día siguiente a la emisión
 * (`bundle`); los legados sin solicitudes de HH cuentan si tienen
 * `used_hours` y se crearon antes. Recorre las facturas de la más antigua a
 * la más nueva, así cada ticket queda en la primera que lo cubrió.
 *
 * Idempotente: solo toca tickets que siguen sin `invoice_id`. Corre una sola
 * vez, manualmente, después de desplegar ese cambio.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const { db, close } = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    const invoices = (await db.execute(sql`
      select i.id, i.plan_id, i.period_key,
        case
          when p.plan_type = 'monthly' then coalesce(mp.end_date, (to_date(i.period_key, 'YYYY-MM') + interval '1 month')::date)
          else (i.invoiced_at + 1)
        end as covered_until
      from support_invoices i
      join support_plans p on p.id = i.plan_id
      left join support_monthly_periods mp on mp.id = i.monthly_period_id
      where p.plan_type in ('monthly', 'bundle') and i.position = 0
      order by i.period_key, i.invoiced_at
    `)) as unknown as { id: string; plan_id: string; period_key: string; covered_until: string | Date }[];

    let linked = 0;
    for (const invoice of invoices) {
      const result = (await db.execute(sql`
        update tickets t set invoice_id = ${invoice.id}, updated_at = now()
        from support_plans p
        where p.id = ${invoice.plan_id}
          and t.invoice_id is null
          and t.deleted_at is null
          and (
            t.project_id = p.project_id or t.development_project_id = p.project_id
            or t.project_id in (select development_project_id from support_plan_projects where plan_id = p.id)
            or t.development_project_id in (select development_project_id from support_plan_projects where plan_id = p.id)
          )
          and (
            exists (select 1 from ticket_hh_requests r where r.ticket_id = t.id and r.status = 'approved' and r.date < ${invoice.covered_until}::date)
            or (not exists (select 1 from ticket_hh_requests r where r.ticket_id = t.id) and t.used_hours > 0 and t.created_at < ${invoice.covered_until}::date)
          )
        returning t.id
      `)) as unknown as unknown[];
      if (result.length > 0) console.log(`Factura ${invoice.id} (${invoice.period_key}): ${result.length} tickets enlazados.`);
      linked += result.length;
    }

    console.log(`Listo: ${linked} tickets enlazados en ${invoices.length} facturas revisadas.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
