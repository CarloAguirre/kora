/**
 * Mientras el proyecto está en Prospecto/Cotización, `soldHours` se edita con
 * la etiqueta «HH estimadas» y el monto de contrato también puede cargarse
 * como estimado: no son una venta previa. Si el proyecto aún no tiene Roadmap
 * (módulos) ni hitos facturados o pagados, el traspaso de la cotización
 * aprobada REEMPLAZA esos estimados (HH vendidas, HH por equipo y monto).
 * Con ejecución o facturación previas son venta real y se suman.
 *
 * No usar el monto de contrato como señal: el formulario de creación lo
 * acepta en Cotización (p. ej. HH estimadas × valor HH).
 */
export function soldHoursAreCommercialEstimate(project: {
  moduleCount: number;
  paymentStatuses: readonly string[];
}): boolean {
  return project.moduleCount === 0 &&
    !project.paymentStatuses.some((status) => status === 'invoiced' || status === 'paid');
}
