import { useAuth } from "@/modules/auth/hooks/useAuth";
import { usePermissions } from "@/modules/auth/hooks/usePermissions";
import {
  useHourEntriesList,
  useProjectPendingApprovals,
} from "@/modules/hours/api/hours.queries";
import {
  useTeamMemberOptions,
  useTeamsList,
} from "@/modules/teams/api/teams.queries";
import { CalendarIcon, ClockIcon, TrashIcon, TrendingUpIcon } from "@/shared/components/icons/Icons";
import { Button } from "@/shared/components/ui/Button";
import { Card } from "@/shared/components/ui/Card";
import { Combobox } from "@/shared/components/ui/Combobox";
import { TextField } from "@/shared/components/ui/TextField";
import { useToast } from "@/shared/components/ui/Toast";
import { ApiRequestError } from "@/shared/lib/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  assignProjectTeamMemberSchema,
  type AssignProjectTeamMemberInput,
  type ProjectDetail,
  type ProjectTeamMember,
} from "@kora/contracts";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  useAssignProjectMember,
  useResolveProjectManagementApproval,
  useUnassignProjectMember,
} from "../api/projects.queries";
import { BitacoraCard } from "../components/BitacoraCard";
import { BitacoraMiniCard } from "../components/BitacoraMiniCard";
import { ProjectExtrasTab } from "../components/ProjectExtrasTab";
import {
  ProjectInfoBar,
  type ProjectDocument,
} from "../components/ProjectInfoBar";
import { ProjectModulesCard } from "../components/ProjectModulesCard";
import { ProjectTimeline } from "../components/ProjectTimeline";
import { TeamHoursSummaryChart } from "../components/TeamHoursSummaryChart";
import { TeamTasksCard } from "../components/TeamTasksCard";
import { TeamDeliveriesCard } from "../components/TeamDeliveriesCard";
import { getTeamStyle } from "../utils/team-style";
import styles from "./ProjectDetailPage.module.css";
import { projectTeamPath } from "@/app/router/paths";

const formatDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("es-CL") : "—";
const formatHours = (value: number) =>
  value.toLocaleString("es-CL", { maximumFractionDigits: 2 });

/**
 * Ficha de proyecto de desarrollo — réplica de `LiderProyectoFicha` (v1, la
 * variante realmente usada en `/proyectos/:id/ficha`): datos generales,
 * KPIs, línea de tiempo por etapa, equipos asignados y bitácora. Sin
 * adjuntos en las observaciones — pendiente de Storage (ver
 * docs/PLAN-MODULOS.md). La ficha de soporte es una pantalla distinta —
 * ver `SupportProjectDetailView`.
 */
type DetailTab = "resumen" | "roadmap" | "bitacora" | "extras";

export function DevelopmentProjectDetailView({
  project,
  projectId,
  leaderTeamId,
}: {
  project: ProjectDetail;
  projectId: string;
  /** Presente cuando quien ve esta ficha (líder de proyecto o `projects:manage`) también lidera uno de los equipos asignados — habilita "Tareas del equipo" para ESE equipo, sin perder la vista completa. */
  leaderTeamId?: string;
}) {
  const { can, canAny } = usePermissions();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>("resumen");
  const assignMember = useAssignProjectMember();
  const unassignMember = useUnassignProjectMember();
  const resolveManagementApproval = useResolveProjectManagementApproval();
  const { data: projectHourEntries } = useHourEntriesList({
    projectId,
    page: 1,
    pageSize: 20,
    sortField: "date",
    sortDirection: "desc",
  });
  const { data: teamMemberOptions } = useTeamMemberOptions();
  const { data: teamsCatalog } = useTeamsList({
    page: 1,
    pageSize: 50,
    sortField: "name",
  });

  const [memberError, setMemberError] = useState<string | null>(null);

  const memberForm = useForm<
    z.input<typeof assignProjectTeamMemberSchema>,
    unknown,
    AssignProjectTeamMemberInput
  >({
    resolver: zodResolver(assignProjectTeamMemberSchema),
    defaultValues: { teamMemberId: "", activity: "", assignedHours: 0 },
  });
  const teamMemberId = memberForm.watch("teamMemberId");

  /**
   * `project.teams` (v1: `equipo_proyecto`) trae el líder y las HH
   * presupuestadas por equipo — dato real que hasta ahora la ficha ignoraba
   * por completo, recalculando "Asignadas" desde `project.members`
   * (individual, `proyecto_colaborador`) en su lugar. `consumedHours` sigue
   * viniendo de los miembros, porque `project_teams` no lo guarda. Un
   * proyecto sin fila en `project_teams` (no todos la tienen) cae al cálculo
   * derivado de siempre, para no perder el equipo de vista.
   *
   * `leaderName` puede venir vacío de `project_teams` (nunca se eligió un
   * líder específico para ESTE proyecto): en ese caso se usa el líder del
   * equipo en general (catálogo de equipos), para no mostrar "Sin líder
   * asignado" cuando el equipo sí tiene uno.
   */
  const teamLeaderCatalog = useMemo(() => {
    const map = new Map<string, { id: string; fullName: string }>();
    for (const team of teamsCatalog?.items ?? []) {
      if (team.leader) map.set(team.id, team.leader);
    }
    return map;
  }, [teamsCatalog]);

  const teamSummaries = useMemo(() => {
    const summaries = new Map<
      string,
      {
        teamId: string;
        teamName: string;
        leaderId: string | null;
        leaderName: string | null;
        memberCount: number;
        assignedHours: number;
        consumedHours: number;
      }
    >();
    const hasRealTeamRow = new Set(project.teams.map((team) => team.teamId));

    for (const team of project.teams) {
      const leader = team.leader ?? teamLeaderCatalog.get(team.teamId) ?? null;
      summaries.set(team.teamId, {
        teamId: team.teamId,
        teamName: team.teamName,
        leaderId: leader?.id ?? null,
        leaderName: leader?.fullName ?? null,
        memberCount: team.memberCount,
        assignedHours: team.assignedHours ?? 0,
        consumedHours: 0,
      });
    }

    for (const member of project.members) {
      const existing = summaries.get(member.teamId);
      if (existing) {
        existing.consumedHours += member.consumedHours;
        if (!hasRealTeamRow.has(member.teamId)) {
          existing.memberCount += 1;
          existing.assignedHours += member.assignedHours;
        }
      } else {
        const leader = teamLeaderCatalog.get(member.teamId) ?? null;
        summaries.set(member.teamId, {
          teamId: member.teamId,
          teamName: member.teamName,
          leaderId: leader?.id ?? null,
          leaderName: leader?.fullName ?? null,
          memberCount: 1,
          assignedHours: member.assignedHours,
          consumedHours: member.consumedHours,
        });
      }
    }

    return [...summaries.values()];
  }, [project, teamLeaderCatalog]);

  const remainingHours = project.soldHours - project.usedHours;

  const projectDocuments: ProjectDocument[] = [
    project.quotationLink
      ? { label: "Cotización", url: project.quotationLink }
      : null,
    project.contractLink
      ? { label: "Contrato", url: project.contractLink }
      : null,
    project.additionalLinks
      ? { label: "Adicionales", url: project.additionalLinks }
      : null,
  ].filter((doc): doc is ProjectDocument => doc !== null);

  /**
   * Espejo exacto de la regla del backend (`AddProjectObservationUseCase`):
   * con `projects:manage` no hace falta más; sin él, `projects:read_assigned`
   * solo habilita el formulario si el actor participa en ESTE proyecto
   * (líder, desarrollador, responsable comercial o miembro asignado) — igual
   * que la v1 restringía la bitácora a "administradores, PMO y líderes con
   * acceso al proyecto".
   */
  const canAddObservation =
    can("projects:manage") ||
    (canAny("projects:read_assigned") &&
      user !== null &&
      (project.leader?.id === user.id ||
        project.developer?.id === user.id ||
        project.commercialManager?.id === user.id ||
        project.members.some((member) => member.userId === user.id)));

  /**
   * Espejo de `isProjectLeaderOrTeamLeaderOfMember` (backend, usado por
   * `UpdateProjectExtrasUseCase`): además de `projects:manage`, el líder del
   * proyecto o el líder de cualquiera de los equipos asignados puede editar
   * la pestaña "Extras" — es contenido de bajo riesgo, no administración del
   * proyecto (eso sigue siendo `Editar proyecto`, exclusivo de `projects:manage`).
   */
  const canManageExtras =
    can("projects:manage") ||
    (user !== null &&
      (project.leader?.id === user.id || project.teams.some((team) => team.leader?.id === user.id)));

  /**
   * Gestión operativa completa del proyecto (editar fases/módulos, entregas,
   * tramos de pago, asignar/quitar equipo) sin `projects:manage`: solo el
   * líder DE ESTE PROYECTO, no un líder de equipo cualquiera — mismo criterio
   * que el backend en `UpdateProjectUseCase` y afines.
   */
  const canManageProject =
    can("projects:manage") || (user !== null && project.leader?.id === user.id);

  /**
   * Mismo criterio que `GetProjectPendingApprovalsUseCase` en el backend: el
   * líder de proyecto (o admin/pmo) es quien necesita este aviso, porque ya
   * no puede aprobar directamente las horas que le tocan a un líder de
   * equipo — ver docs/DECISION-M4-HORAS.md.
   */
  const canSeePendingApprovals =
    user !== null &&
    (user.role === "admin" ||
      user.role === "pmo" ||
      project.leader?.id === user.id);

  // Misma consulta que `PendingApprovalsCard` (mismo query key) — React Query
  // la comparte, no duplica la llamada de red.
  const { data: pendingApprovals } = useProjectPendingApprovals(
    projectId,
    canSeePendingApprovals,
  );

  /** Horas pendientes de ESE colaborador puntual, para pintarlas junto a su fila en "Equipo asignado". */
  const pendingHoursByUserId = useMemo(() => {
    const map = new Map<string, { entryCount: number; totalHours: number }>();
    for (const group of pendingApprovals?.groups ?? []) {
      for (const collaborator of group.collaborators) {
        map.set(collaborator.userId, {
          entryCount: collaborator.entryCount,
          totalHours: collaborator.totalHours,
        });
      }
    }
    return map;
  }, [pendingApprovals]);

  /** Total pendiente con el líder de ESE equipo, para pintarlo en el encabezado del grupo. */
  const pendingHoursByApproverId = useMemo(() => {
    const map = new Map<string, { entryCount: number; totalHours: number }>();
    for (const group of pendingApprovals?.groups ?? []) {
      map.set(group.approverUserId, {
        entryCount: group.entryCount,
        totalHours: group.totalHours,
      });
    }
    return map;
  }, [pendingApprovals]);

  /** Total pendiente de aprobación del proyecto completo, para la nota bajo "HH consumidas" en la tarjeta de Línea de tiempo. */
  const totalPendingHours = (pendingApprovals?.groups ?? []).reduce((sum, group) => sum + group.totalHours, 0);

  const onAssignMember = memberForm.handleSubmit(async (values) => {
    setMemberError(null);
    try {
      await assignMember.mutateAsync({ projectId, input: values });
      toast.success("Se asignó a la persona al proyecto.");
      memberForm.reset({ teamMemberId: "", activity: "", assignedHours: 0 });
    } catch (error) {
      setMemberError(
        error instanceof ApiRequestError
          ? error.message
          : "No se pudo asignar.",
      );
    }
  });

  const onUnassign = async (assignmentId: string) => {
    await unassignMember.mutateAsync({ projectId, assignmentId });
    toast.success("Se retiró a la persona del proyecto.");
  };

  const onResolveManagementApproval = async () => {
    try {
      await resolveManagementApproval.mutateAsync(projectId);
      toast.success("Se activó el proyecto.");
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError ? error.message : "No se pudo activar el proyecto.",
      );
    }
  };

  const membersByTeam = useMemo(() => {
    const map = new Map<string, ProjectTeamMember[]>();
    for (const member of project.members) {
      const list = map.get(member.teamId);
      if (list) list.push(member);
      else map.set(member.teamId, [member]);
    }
    return map;
  }, [project.members]);

  return (
    <div className={styles.page}>
      {project.pendingManagementApproval && can("projects:manage") && (
        <div className={styles.hito0Banner}>
          <span>Hito 0 pendiente de aprobación de Gerencia.</span>
          <Button
            size="sm"
            loading={resolveManagementApproval.isPending}
            onClick={() => void onResolveManagementApproval()}
          >
            Activar proyecto
          </Button>
        </div>
      )}

      {/* Datos del proyecto y Timeline: siempre visibles, fuera de las tabs (igual que en el mockup del líder de proyecto). */}
      <Card>
        <ProjectInfoBar
          clientName={project.client?.companyName ?? "Sin cliente"}
          leaderName={project.leader?.fullName ?? "—"}
          dateRange={`${formatDate(project.startDate)} - ${formatDate(project.endDate)}`}
          salesStage={project.salesStage}
          status={project.status}
          phase={project.phase}
          documents={projectDocuments}
        />
      </Card>

      <Card>
        <p className={styles.sectionTitle}>Línea de tiempo</p>
        <div style={{ marginTop: "var(--kora-space-4)" }}>
          <ProjectTimeline
            phase={project.phase}
            startDate={project.startDate}
            endDate={project.estimatedDeliveryDate ?? project.endDate}
          />
        </div>

        <div className={styles.metricsDivider} />
        <div className={styles.metricsStrip}>
          <div className={styles.metricItem}>
            <span className={styles.kpiLabel}>
              <CalendarIcon size={12} className={styles.iconBlue} /> Inicio
            </span>
            <span className={styles.kpiValue} style={{ fontSize: "var(--kora-text-lg)" }}>
              {formatDate(project.startDate)}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.kpiLabel}>
              <CalendarIcon size={12} className={styles.iconBlue} /> Entrega estimada
            </span>
            <span className={styles.kpiValue} style={{ fontSize: "var(--kora-text-lg)" }}>
              {formatDate(project.estimatedDeliveryDate)}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.kpiLabel}>
              <ClockIcon size={12} className={styles.iconMuted} /> HH vendidas
            </span>
            <span className={styles.kpiValue}>{formatHours(project.soldHours)}</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.kpiLabel}>
              <TrendingUpIcon size={12} className={styles.iconBlue} /> HH consumidas
            </span>
            <span className={styles.kpiValue}>{formatHours(project.usedHours)}</span>
            {totalPendingHours > 0 && (
              <span className={styles.metricSub}>{formatHours(totalPendingHours)} pendientes de aprobación</span>
            )}
          </div>
          <div className={styles.metricItem}>
            <span className={styles.kpiLabel}>
              <ClockIcon size={12} className={styles.iconAmber} /> HH restantes
            </span>
            <span className={[styles.kpiValue, remainingHours < 0 ? styles.kpiValueDanger : styles.kpiValueSuccess].join(' ')}>
              {formatHours(remainingHours)}
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.tabsShell}>
        <div className={styles.tabsShellBar}>
          {DETAIL_TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              type="button"
              className={[
                styles.tabsShellButton,
                tab === tabDef.id ? styles.tabsShellButtonActive : "",
              ].join(" ")}
              onClick={() => setTab(tabDef.id)}
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        <div className={styles.tabsShellBody}>
          {tab === "resumen" && (
            <div className={styles.layout}>
              <div className={styles.colLeft}>
                <TeamHoursSummaryChart teams={teamSummaries} />

                {leaderTeamId && (
                  <>
                    <TeamTasksCard project={project} projectId={projectId} teamId={leaderTeamId} />
                    <TeamDeliveriesCard project={project} projectId={projectId} teamId={leaderTeamId} />
                  </>
                )}

                <Card>
                  <div className={styles.sectionHeader}>
                    <p className={styles.sectionTitle}>
                      Equipo asignado ({project.members.length})
                    </p>
                  </div>

                  {teamSummaries.length > 0 ? (
                    <div className={styles.groupedTableWrap}>
                      <table className={styles.groupedTable}>
                        <caption className="srOnly">
                          Personas asignadas, agrupadas por equipo
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Persona</th>
                            <th scope="col">Actividad</th>
                            <th scope="col">HH asignadas</th>
                            <th scope="col">HH consumidas</th>
                            {canSeePendingApprovals && (
                              <th scope="col">Pendiente aprob.</th>
                            )}
                            <th scope="col" aria-label="Acciones" />
                          </tr>
                        </thead>
                        {teamSummaries.map((team) => {
                          const style = getTeamStyle(team.teamName);
                          const deviatedHours = Math.max(
                            0,
                            team.consumedHours - team.assignedHours,
                          );
                          const members = membersByTeam.get(team.teamId) ?? [];
                          const columnCount = canSeePendingApprovals ? 6 : 5;
                          const pendingWithLeader = team.leaderId
                            ? pendingHoursByApproverId.get(team.leaderId)
                            : undefined;
                          return (
                            <tbody key={team.teamId}>
                              <tr
                                className={styles.groupRow}
                                style={{ background: style.bg }}
                              >
                                <td colSpan={columnCount}>
                                  <div className={styles.groupRowContent}>
                                    <span
                                      className={styles.groupAvatar}
                                      style={{ background: style.color }}
                                    >
                                      {style.sigla}
                                    </span>
                                    <span className={styles.groupName}>
                                      {team.teamName}
                                    </span>
                                    <span className={styles.groupLeader}>
                                      {team.leaderName ? (
                                        <>
                                          Líder: <b>{team.leaderName}</b>
                                        </>
                                      ) : (
                                        "Sin líder asignado"
                                      )}
                                    </span>
                                    <span className={styles.groupStats}>
                                      {team.memberCount} persona
                                      {team.memberCount === 1 ? "" : "s"} ·{" "}
                                      {formatHours(team.assignedHours)}h asig. ·{" "}
                                      {formatHours(team.consumedHours)}h cons. ·{" "}
                                      <span
                                        className={
                                          deviatedHours > 0
                                            ? styles.teamHealthDanger
                                            : styles.teamHealthOk
                                        }
                                      >
                                        {deviatedHours > 0
                                          ? `${formatHours(deviatedHours)}h desv.`
                                          : "en rango"}
                                      </span>
                                      {pendingWithLeader && (
                                        <>
                                          {" · "}
                                          <span className={styles.pendingBadge}>
                                            {formatHours(
                                              pendingWithLeader.totalHours,
                                            )}
                                            h pendientes de aprobar (
                                            {pendingWithLeader.entryCount})
                                          </span>
                                        </>
                                      )}
                                    </span>
                                    <Link
                                      to={projectTeamPath(project, { id: team.teamId })}
                                      className={styles.groupLeader}
                                    >
                                      Ver equipo
                                    </Link>
                                  </div>
                                </td>
                              </tr>

                              {members.length > 0 ? (
                                members.map((m) => {
                                  const pending = pendingHoursByUserId.get(
                                    m.userId,
                                  );
                                  return (
                                    <tr key={m.id} className={styles.memberRow}>
                                      <td>{m.fullName}</td>
                                      <td className={styles.memberCellMuted}>
                                        {m.activity ?? "—"}
                                      </td>
                                      <td>{formatHours(m.assignedHours)}</td>
                                      <td>{formatHours(m.consumedHours)}</td>
                                      {canSeePendingApprovals && (
                                        <td
                                          className={
                                            pending
                                              ? styles.pendingCell
                                              : styles.memberCellMuted
                                          }
                                        >
                                          {pending
                                            ? `${formatHours(pending.totalHours)}h (${pending.entryCount})`
                                            : "—"}
                                        </td>
                                      )}
                                      <td className={styles.memberCellActions}>
                                        {canManageProject && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              void onUnassign(m.id)
                                            }
                                            aria-label={`Quitar a ${m.fullName}`}
                                          >
                                            <TrashIcon size={16} />
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td
                                    colSpan={columnCount}
                                    className={styles.emptyGroupCell}
                                  >
                                    Sin colaboradores asignados en este equipo.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          );
                        })}
                      </table>
                    </div>
                  ) : (
                    <p className={styles.empty}>
                      Nadie está asignado a este proyecto todavía.
                    </p>
                  )}

                  {canManageProject && (
                    <form
                      className={styles.inlineForm}
                      onSubmit={onAssignMember}
                    >
                      {memberError && (
                        <p className={styles.error}>{memberError}</p>
                      )}
                      <div className={styles.inlineFormRow}>
                        <div>
                          <Combobox
                            label="Persona"
                            placeholder="Buscar por nombre…"
                            options={(teamMemberOptions?.items ?? []).map(
                              (member) => ({
                                value: member.id,
                                label: `${member.fullName} — ${member.teamName}`,
                              }),
                            )}
                            value={teamMemberId}
                            onChange={(value) =>
                              memberForm.setValue("teamMemberId", value, {
                                shouldValidate: true,
                              })
                            }
                            emptyMessage="No se encontraron personas."
                          />
                          {memberForm.formState.errors.teamMemberId && (
                            <p className={styles.error}>
                              {memberForm.formState.errors.teamMemberId.message}
                            </p>
                          )}
                        </div>
                        <TextField
                          label="Actividad"
                          {...memberForm.register("activity")}
                        />
                        <TextField
                          label="HH asignadas"
                          type="number"
                          {...memberForm.register("assignedHours")}
                        />
                        <Button
                          type="submit"
                          loading={memberForm.formState.isSubmitting}
                          loadingText="Asignando…"
                        >
                          Asignar
                        </Button>
                      </div>
                    </form>
                  )}
                </Card>
              </div>

              <div className={styles.colRight}>
                <BitacoraMiniCard
                  projectId={projectId}
                  events={projectHourEntries?.items ?? []}
                  observations={project.observations}
                  modules={project.modules}
                  canManage={canAddObservation}
                  onViewMore={() => setTab("bitacora")}
                />
              </div>
            </div>
          )}

          {tab === "roadmap" &&
            (project.salesStage === "approved" ||
            project.status === "finished" ? (
              <ProjectModulesCard
                projectId={projectId}
                modules={project.modules}
                hourEntries={projectHourEntries?.items ?? []}
                observations={project.observations}
                canManage={canManageProject}
              />
            ) : (
              <Card>
                <p className={styles.empty}>
                  El Roadmap está disponible para proyectos aprobados o
                  finalizados.
                </p>
              </Card>
            ))}

          {tab === "bitacora" && (
            <BitacoraCard
              projectId={projectId}
              events={projectHourEntries?.items ?? []}
              observations={project.observations}
              modules={project.modules}
              teams={project.teams}
              canManage={canAddObservation}
            />
          )}

          {tab === "extras" && (
            <ProjectExtrasTab project={project} canManage={canManageExtras} />
          )}
        </div>
      </div>
    </div>
  );
}

const DETAIL_TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "roadmap", label: "Roadmap" },
  { id: "bitacora", label: "Bitácora" },
  { id: "extras", label: "Extras" },
];
