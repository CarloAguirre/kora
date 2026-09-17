import type { SupportPlanScope } from '@kora/contracts';

/**
 * Nombre a mostrar de un contrato. Los contratos creados desde la v2 siempre
 * tienen `name` (se calcula al crear si el usuario lo deja vacío — ver
 * `CreateSupportPlanUseCase`). Los contratos migrados por el ETL antes de
 * esta columna existir tienen `name: null`: sin este resorte de lectura, la
 * ficha de cliente y la del contrato mostrarían el nombre en blanco para
 * cualquiera de los 30 contratos legados.
 */
export function resolveSupportPlanName(
  name: string | null,
  scope: SupportPlanScope,
  linkedProjectNames: readonly string[],
  clientName: string,
): string {
  if (name) return name;
  if (scope === 'single') {
    const projectName = linkedProjectNames[0] ?? clientName;
    // Los proyectos "contenedor" de soporte legados (migrados por el ETL) ya suelen llamarse "Soporte <Cliente>" — anteponer el prefijo otra vez duplicaría el nombre.
    return /^soporte\b/i.test(projectName) ? projectName : `Soporte ${projectName}`;
  }
  return `Consolidado – ${clientName}`;
}
