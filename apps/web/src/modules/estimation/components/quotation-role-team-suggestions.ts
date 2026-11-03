/** Sugerencias locales y conservadoras; NUNCA se guardan sin confirmación humana.
 * Los nombres de perfiles de Gemini no son identidades de equipos Kora. */
export type CatalogTeam = { id: string; name: string };
const normalized = (value: string) => value.toLocaleLowerCase('es-CL')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

type Category = 'dev' | 'pmo' | 'qa' | 'ux' | 'rpa' | 'ia';
function roleCategory(role: string): Category | null {
  const name = normalized(role);
  if (/\b(ux|ui|ux ui|disenador|disenadora|diseno|product designer|user experience|user interface)\b/.test(name))
    return 'ux';
  if (/\b(rpa|robotic process|automatizacion robotica)\b/.test(name)) return 'rpa';
  if (/\b(inteligencia artificial|machine learning|data scientist|ai engineer|ml engineer|ia)\b/.test(name))
    return 'ia';
  if (/\b(qa|tester|testing|test engineer|quality assurance|control de calidad|pruebas)\b/.test(name))
    return 'qa';
  if (/\b(pmo|project manager|project management|jefe de proyecto|gestor de proyecto|scrum master)\b/.test(name))
    return 'pmo';
  if (/\b(tech lead|technical lead|arquitecto|architect|desarrollador|desarrolladora|desarrollo|developer|frontend|backend|fullstack|full stack|programador|ingeniero de software)\b/.test(name))
    return 'dev';
  return null;
}
function teamCategory(team: string): Category | null {
  const name = normalized(team);
  if (['desarrollo', 'equipo desarrollo', 'desarrollo software', 'software development'].includes(name))
    return 'dev';
  if (['pmo', 'oficina de proyectos', 'gestion de proyectos'].includes(name)) return 'pmo';
  if (['qa', 'quality assurance', 'aseguramiento de calidad'].includes(name)) return 'qa';
  if (['ux ui', 'ux', 'ui', 'diseno ux ui', 'diseno'].includes(name)) return 'ux';
  if (['rpa', 'automatizacion rpa'].includes(name)) return 'rpa';
  if (['ia', 'inteligencia artificial', 'equipo ia'].includes(name)) return 'ia';
  return null;
}
export function suggestedKoraTeamForRole(
  role: string, teams: readonly CatalogTeam[],
): CatalogTeam | null {
  const exact = teams.filter((team) => normalized(team.name) === normalized(role));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const category = roleCategory(role);
  if (!category) return null;
  const matches = teams.filter((team) => teamCategory(team.name) === category);
  return matches.length === 1 ? matches[0]! : null;
}
