import { useState } from 'react';
import {
  projectPocRolesToQuotationDraft,
  type QuotationDraftData, type QuotationVersion,
} from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import styles from './AiPocRoleMappingCard.module.css';
import { suggestedKoraTeamForRole } from './quotation-role-team-suggestions';

export interface ActiveQuotationTeam { id: string; name: string; }

/** Reutiliza componentes Kora. No atribuye roles de Gemini a equipos sin
 * una confirmación explícita. La acción produce cambios locales; el editor
 * guarda la revisión real con control de concurrencia de PostgreSQL. */
export function AiPocRoleMappingCard({
  version, teams, onApply, canEdit, hasUnsavedChanges,
}: {
  version: QuotationVersion;
  teams: readonly ActiveQuotationTeam[];
  onApply: (draft: QuotationDraftData) => void;
  canEdit: boolean;
  hasUnsavedChanges: boolean;
}) {
  const evidence = version.draft.aiPoc;
  const [mapping, setMapping] = useState<Record<string, string>>(
    evidence?.roleTeamIds ?? {},
  );
  const [error, setError] = useState('');
  if (!evidence) return null;
  const { proposal } = evidence;
  const alreadyMapped = proposal.roles.every((role) =>
    Boolean(evidence.roleTeamIds[role.role]) &&
    teams.some((team) => team.id === evidence.roleTeamIds[role.role]));
  const suggestions = proposal.roles.map((role) => ({
    role: role.role,
    team: suggestedKoraTeamForRole(role.role, teams),
  }));
  const pendingSuggestions = suggestions.filter((item) =>
    item.team && !teams.some((team) => team.id === mapping[item.role]));
  const fillSuggestions = () => {
    setMapping((current) => {
      const next = { ...current };
      for (const { role, team } of pendingSuggestions) {
        if (team) next[role] = team.id;
      }
      return next;
    });
    setError('');
  };
  const allMapped = proposal.roles.every((role) =>
    Boolean(mapping[role.role]) && teams.some((team) => team.id === mapping[role.role]),
  );
  const apply = () => {
    setError('');
    try {
      const projected = projectPocRolesToQuotationDraft(version.draft, mapping);
      onApply(projected);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'No fue posible proyectar los roles.');
    }
  };
  const number = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return (
    <Card>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Agente IA · Gemini + KDM de ejemplo</span>
          <h2>Asignar perfiles a equipos Kora</h2>
          <p>{proposal.summary}</p>
        </div>
        <strong>{number(proposal.totalHours)} HH propuestas</strong>
      </div>
      <p className={styles.notice}>
        Los perfiles y HH son la propuesta de Gemini, no equipos creados en Kora.
        Selecciona un equipo real del catálogo para cada perfil y confirma la distribución.
        La documentación analizada corresponde a KDM de demostración, no a este proyecto.
      </p>
      {pendingSuggestions.length > 0 && canEdit && (
        <div className={styles.suggestionBar}>
          <span>{pendingSuggestions.length} correspondencia(s) sugerida(s) según el catálogo real.
            Revísalas antes de aplicarlas.</span>
          <button type="button" onClick={fillSuggestions}>
            Completar sugerencias
          </button>
        </div>
      )}
      <div className={styles.rows}>
        {proposal.roles.map((role) => (
          <div key={role.role} className={styles.row}>
            <div>
              <strong>{role.role}</strong>
              <small>{number(role.totalHours)} HH · {role.people} persona(s) ·
                {' '}{role.duration} {role.unit === 'week' ? 'semanas' : 'días'}</small>
              {role.source && <small>{role.source}</small>}
              {suggestions.find((item) => item.role === role.role)?.team && (
                <small className={styles.suggestion}>
                  Sugerencia: {suggestions.find((item) => item.role === role.role)!.team!.name}
                  {' '}· confirmar en el selector
                </small>
              )}
            </div>
            <Select
              label={'Equipo para ' + role.role}
              placeholder="Selecciona un equipo"
              disabled={!canEdit}
              value={mapping[role.role] ?? ''}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              onChange={(event) => {
                setMapping((current) => ({ ...current, [role.role]: event.target.value }));
                setError('');
              }}
            />
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <div>
          <span>{alreadyMapped ? 'Asignación de roles registrada' : 'Asignación pendiente'}</span>
          <p>{hasUnsavedChanges
            ? 'Hay cambios sin guardar. Guarda la versión antes de hacer otra proyección.'
            : 'Varios perfiles pueden compartir un equipo; sus HH se consolidan sin perder el detalle original.'}</p>
        </div>
        {canEdit && <Button disabled={!allMapped || hasUnsavedChanges} onClick={apply}>
          Aplicar distribución de HH
        </Button>}
      </div>
      {!allMapped && <p className={styles.pending}>
        Debes asociar todos los perfiles a equipos activos de Kora antes de aplicar la propuesta.
        Ningún perfil IA se registra como equipo nuevo.
      </p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Card>
  );
}
