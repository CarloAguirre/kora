/**
 * Punto de entrada para consumir el ETL como librería (usado por el
 * importador por archivo en `apps/api/src/modules/admin`). Los scripts CLI
 * (`run-*.ts`) siguen importando directo de `./lib` y `./steps` — este barrel
 * solo expone lo que un consumidor externo necesita: construir un
 * `EtlContext` a mano (con `JsonLegacyReader`), correrlo con `runMigration`, y
 * las 6 funciones de migración en alcance (ver docs del importador).
 */
export { runMigration, EtlReport, DryRunRollback, StepTracker } from './lib/context';
export type { EtlContext, StepResult } from './lib/context';
export { JsonLegacyReader, PostgresLegacyReader } from './lib/legacy-reader';
export type { LegacyReader } from './lib/legacy-reader';
export { pruneStaleLegacyRows } from './lib/prune';

export { migrateCatalogs } from './steps/migrate-catalogs';
export { migrateClients } from './steps/migrate-clients';
export { migrateProjects } from './steps/migrate-projects';
export { migrateHourEntries } from './steps/migrate-hours';
export { migrateTickets } from './steps/migrate-tickets';
export { migrateForecast } from './steps/migrate-forecast';
export { backfillProjectTeamMembersFromHours } from './steps/backfill-project-team-members-from-hours';
export { backfillProjectTeamsFromMembers } from './steps/backfill-project-teams-from-members';
