import { useEffect, useId, useMemo, useState } from 'react';
import styles from './RequestReportDataDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { BellIcon } from '@/shared/components/icons/Icons';
import { useRequestTeamReportData } from '../api/teams.queries';
import type { TeamReportRow } from '../lib/team-report';

/** Cuántos proyectos se listan por Líder PM antes de "Ver los N restantes". */
const ITEMS_SHOWN = 4;

interface LeaderGroup {
  readonly leaderId: string;
  readonly leaderName: string;
  readonly items: ReadonlyArray<{ readonly row: TeamReportRow; readonly missing: string }>;
}

function missingLabel(row: TeamReportRow): string {
  return [row.missingAssigned ? 'sin HH asignadas' : null, row.missingDates ? 'sin fechas' : null].filter(Boolean).join(' y ');
}

/** Proyectos con datos faltantes y todavía sin solicitar, agrupados por su Líder PM. */
function groupPending(rows: readonly TeamReportRow[]): { groups: LeaderGroup[]; withoutLeader: number } {
  const groups = new Map<string, { leaderName: string; items: { row: TeamReportRow; missing: string }[] }>();
  let withoutLeader = 0;
  for (const row of rows) {
    if (row.project.dataRequestedAt || !(row.missingAssigned || row.missingDates)) continue;
    const leader = row.project.projectLeader;
    if (!leader) {
      withoutLeader++;
      continue;
    }
    const group = groups.get(leader.id) ?? { leaderName: leader.fullName, items: [] };
    group.items.push({ row, missing: missingLabel(row) });
    groups.set(leader.id, group);
  }
  return {
    groups: [...groups].map(([leaderId, group]) => ({ leaderId, ...group })).sort((a, b) => b.items.length - a.items.length),
    withoutLeader,
  };
}

export interface RequestReportDataDialogProps {
  readonly open: boolean;
  readonly teamId: string;
  readonly rows: readonly TeamReportRow[];
  readonly onClose: () => void;
}

/**
 * "Pedir datos faltantes a los Líderes PM" — portado del prototipo del Reporte de
 * equipo. Cada Líder PM elegido recibe UNA notificación en Kora con sus proyectos;
 * si no la abre en 48 h le llega un correo. Al completar el dato, la marca
 * "Solicitada" desaparece sola (el aviso ya no aplica).
 */
export function RequestReportDataDialog({ open, teamId, rows, onClose }: RequestReportDataDialogProps) {
  const toast = useToast();
  const requestData = useRequestTeamReportData(teamId);
  const noteId = useId();
  const { groups, withoutLeader } = useMemo(() => groupPending(rows), [rows]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');

  // Cada apertura parte con todos los Líderes PM marcados y sin nota, como el prototipo.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(groups.map((group) => group.leaderId)));
    setExpanded(new Set());
    setNote('');
    // `groups` solo importa al abrir: recalcularlo mientras está abierto no debe pisar lo que se marcó.
  }, [open]);

  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const send = () => {
    const chosen = groups.filter((group) => selected.has(group.leaderId));
    if (chosen.length === 0) {
      toast.show('No seleccionaste ningún Líder PM', 'info');
      return;
    }
    requestData.mutate(
      { projectIds: chosen.flatMap((group) => group.items.map(({ row }) => row.project.projectId)), note: note.trim() || undefined },
      {
        onSuccess: ({ notifiedLeaders }) => {
          toast.success(`Notificación enviada a ${notifiedLeaders} Líder${notifiedLeaders === 1 ? '' : 'es'} PM`);
          onClose();
        },
        onError: () => toast.error('No se pudo enviar la solicitud.'),
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Pedir datos faltantes a los Líderes PM"
      description="HH Asignadas y fechas las carga el Líder PM de cada proyecto. Elige a quién avisar."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={send} loading={requestData.isPending} loadingText="Enviando…" disabled={groups.length === 0}>
            Enviar solicitud
          </Button>
        </>
      }
    >
      <div className={styles.channel}>
        <BellIcon size={16} className={styles.channelIcon} />
        <p>
          <b>Cómo se envía:</b> cada Líder PM recibe <b>una sola notificación en Kora</b> con la lista de sus proyectos y un enlace
          directo a cada dato por completar. Si no la abre en 48 h, recibe un correo. Cuando completa el dato, la marca «Solicitada»
          desaparece sola.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className={styles.lead}>Todos los datos pendientes ya fueron solicitados. Se actualizan solos cuando el Líder PM los completa.</p>
      ) : (
        <div className={styles.leaders}>
          {groups.map((group) => {
            const isExpanded = expanded.has(group.leaderId);
            const shown = isExpanded ? group.items : group.items.slice(0, ITEMS_SHOWN);
            const hidden = group.items.length - ITEMS_SHOWN;
            return (
              <label key={group.leaderId} className={styles.leader}>
                <input
                  type="checkbox"
                  checked={selected.has(group.leaderId)}
                  onChange={() => setSelected((current) => toggle(current, group.leaderId))}
                />
                <div className={styles.leaderBody}>
                  <b>{group.leaderName}</b>{' '}
                  <span className={styles.count}>
                    · {group.items.length} proyecto{group.items.length === 1 ? '' : 's'}
                  </span>
                  <ul className={styles.items}>
                    {shown.map(({ row, missing }) => (
                      <li key={row.project.projectId}>
                        {row.project.client ? `${row.project.client.companyName} — ` : ''}
                        {row.project.name}: <span className={styles.missing}>{missing}</span>
                      </li>
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={(event) => {
                        event.preventDefault();
                        setExpanded((current) => toggle(current, group.leaderId));
                      }}
                    >
                      {isExpanded ? 'Ocultar' : `Ver los ${hidden} restantes`}
                    </button>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      {withoutLeader > 0 && (
        <p className={styles.lead}>
          {withoutLeader} proyecto{withoutLeader === 1 ? ' no tiene' : 's no tienen'} Líder PM asignado: no hay a quién pedirle el dato.
        </p>
      )}

      <div className={styles.noteField}>
        <label htmlFor={noteId} className={styles.noteLabel}>
          Nota adicional (opcional)
        </label>
        <textarea
          id={noteId}
          className={styles.textarea}
          placeholder="Ej: lo necesito antes de la reunión de líderes del jueves"
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}
