/**
 * Palabras que el diccionario es-CL no trae pero que en Kabeli son de uso
 * diario: jerga de desarrollo y gestión en inglés y nombres propios de la
 * casa. Se agregan al diccionario al cargarlo.
 *
 * Basta la forma en minúscula: Hunspell acepta además la versión con
 * mayúscula inicial (`Dashboard` a comienzo de oración). Las siglas en
 * mayúsculas (`QA`, `API`) no hace falta listarlas: el tokenizador no las
 * revisa.
 *
 * No se carga el diccionario de inglés completo a propósito: aceptaría como
 * correctas palabras españolas sin tilde que existen en inglés (`reunion`,
 * `area`, `final`…) y el corrector dejaría pasar justo el error más común.
 */
export const GLOSSARY: readonly string[] = [
  // Kabeli
  'kabeli',
  'kora',
  // Desarrollo
  'backend',
  'backlog',
  'backoffice',
  'bug',
  'bugs',
  'build',
  'checklist',
  'commit',
  'commits',
  'dashboard',
  'dashboards',
  'deploy',
  'deployment',
  'deploys',
  'endpoint',
  'endpoints',
  'framework',
  'frameworks',
  'frontend',
  'hotfix',
  'hotfixes',
  'input',
  'inputs',
  'layout',
  'layouts',
  'login',
  'logout',
  'merge',
  'mockup',
  'mockups',
  'onboarding',
  'output',
  'outputs',
  'pipeline',
  'pipelines',
  'query',
  'queries',
  'refactor',
  'release',
  'releases',
  'responsive',
  'rollback',
  'script',
  'scripts',
  'setup',
  'staging',
  'testing',
  'tests',
  'ticket',
  'tickets',
  'token',
  'tokens',
  'wireframe',
  'wireframes',
  // Gestión
  'daily',
  'dailies',
  'feedback',
  'kanban',
  'kickoff',
  'roadmap',
  'scrum',
  'sprint',
  'sprints',
  'stakeholder',
  'stakeholders',
  'weekly',
  // Herramientas
  'excel',
  'figma',
  'jira',
  'sharepoint',
  'slack',
];
