/**
 * Etiqueta de la descripción según el tipo de servicio — compartida por los
 * formularios (sigue al tipo elegido), el detalle y el portal cliente. Sin
 * tipo o con un tipo deprecado cae en "incidente", igual que el ícono.
 */
export function ticketDescriptionLabel(serviceType: string | null | undefined): string {
  if (serviceType === 'improvement') return 'Descripción de las mejoras';
  if (serviceType === 'operational') return 'Descripción de la tarea operativa';
  return 'Descripción del incidente';
}
