/**
 * Mientras el proyecto está en Prospecto/Cotización, `soldHours` se edita con
 * la etiqueta «HH estimadas»: es un estimado comercial, no una venta previa.
 * Si el proyecto aún no tiene Roadmap (módulos) ni monto de contrato, el
 * traspaso de la cotización aprobada REEMPLAZA ese estimado. Con ejecución o
 * contrato previos, las HH vendidas anteriores sí son venta real y se suman.
 */
export function soldHoursAreCommercialEstimate(project: {
  moduleCount: number;
  contractAmount: number | string | null;
}): boolean {
  return project.moduleCount === 0 && project.contractAmount === null;
}
