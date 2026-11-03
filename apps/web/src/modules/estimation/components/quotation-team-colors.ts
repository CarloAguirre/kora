/** Paleta del HTML v5 compartida por resumen, tarjetas, equipos y roadmap.
 * Para perfiles IA no incluidos en el catálogo Kora usamos colores distintos
 * y determinísticos, nunca el mismo azul grisáceo para todos. */
const rolePalette = [
  '#f97316', '#64748b', '#3b82f6', '#16a05c', '#8b5cf6', '#14a3a6',
  '#e05272', '#2563eb', '#d97706', '#0d9488',
];
export function quotationTeamColor(name: string): string {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').trim();
  if (key === 'desarrollo' || key.includes('equipo desarrollo')) return '#f97316';
  if (key === 'pmo' || key.includes('gestion de proyectos')) return '#64748b';
  if (key === 'qa' || key.includes('calidad')) return '#3b82f6';
  if (key.includes('ux') || key.includes('diseno')) return '#16a05c';
  if (key === 'ia' || key.includes('inteligencia artificial')) return '#e05272';
  if (key.includes('rpa')) return '#15a6a5';
  if (key.includes('arquitecto')) return '#f97316';
  if (key.includes('tech lead') || key.includes('lider tecnico')) return '#64748b';
  if (key.includes('project manager') || key.includes('scrum master')) return '#16a05c';
  if (key.includes('frontend') || key.includes('backend') || key.includes('desarrollador')) return '#3b82f6';
  if (key.includes('analista')) return '#8b5cf6';
  if (key.includes('test')) return '#14a3a6';
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return rolePalette[hash % rolePalette.length]!;
}
