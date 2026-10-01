import { useAuth } from "@/modules/auth/hooks/useAuth";
import { usePermissions } from "@/modules/auth/hooks/usePermissions";
import {
  useHourEntriesList,
  useProjectPendingApprovals,
} from "@/modules/hours/api/hours.queries";
import { useTeamsList } from "@/modules/teams/api/teams.queries";
import { CalendarIcon, ClockIcon, PencilIcon, TrendingUpIcon } from "@/shared/components/icons/Icons";
import { Button } from "@/shared/components/ui/Button";
import { Card } from "@/shared/components/ui/Card";
import { useToast } from "@/shared/components/ui/Toast";
import { ApiRequestError } from "@/shared/lib/api-client";
import type { ProjectDetail } from "@kora/contracts";
import { useMemo, useState } from "react";
import { useResolveProjectManagementApproval } from "../api/projects.queries";
import { AssignedTeamsCard, type AssignedTeamSummary } from "../components/AssignedTeamsCard";
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
import styles from "./ProjectDetailPage.module.css";

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
  onEdit,
}: {
  project: ProjectDetail;
  projectId: string;
  /** Abre "Editar proyecto" — sin él (quien no puede editar) no se muestra el lápiz. */
  onEdit?: () => void;
}) {
  const { can, canAny } = usePermissions();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>("resumen");
  const resolveManagementApproval = useResolveProjectManagementApproval();
  const { data: projectHourEntries } = useHourEntriesList({
    projectId,
    page: 1,
    pageSize: 20,
    sortField: "date",
    sortDirection: "desc",
  });
  const { data: teamsCatalog } = useTeamsList({
    page: 1,
    pageSize: 50,
    sortField: "name",
  });

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
    const summaries = new Map<string, AssignedTeamSummary>();
    const hasRealTeamRow = new Set(project.teams.map((team) => team.teamId));

    for (const team of project.teams) {
      const leader = team.leader ?? teamLeaderCatalog.get(team.teamId) ?? null;
      summaries.set(team.teamId, {
        teamId: team.teamId,
        teamSlug: team.teamSlug,
        teamName: team.teamName,
        leaderName: leader?.fullName ?? null,
        assignedHours: team.assignedHours ?? 0,
        consumedHours: 0,
      });
    }

    for (const member of project.members) {
      const existing = summaries.get(member.teamId);
      if (existing) {
        existing.consumedHours += member.consumedHours;
        if (!hasRealTeamRow.has(member.teamId)) {
          existing.assignedHours += member.assignedHours;
        }
      } else {
        const leader = teamLeaderCatalog.get(member.teamId) ?? null;
        summaries.set(member.teamId, {
          teamId: member.teamId,
          teamName: member.teamName,
          leaderName: leader?.fullName ?? null,
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

  /** Total pendiente de aprobación del proyecto completo, para la nota bajo "HH consumidas" en la tarjeta de Línea de tiempo. */
  const totalPendingHours = (pendingApprovals?.groups ?? []).reduce((sum, group) => sum + group.totalHours, 0);

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
      <Card className={styles.infoCard}>
        <ProjectInfoBar
          clientName={project.client?.companyName ?? "Sin cliente"}
          leaderName={project.leader?.fullName ?? "—"}
          dateRange={`${formatDate(project.startDate)} - ${formatDate(project.endDate)}`}
          salesStage={project.salesStage}
          status={project.status}
          phase={project.phase}
          documents={projectDocuments}
        />
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className={styles.editIconButton}
            onClick={onEdit}
            aria-label="Editar proyecto"
            title="Editar proyecto"
          >
            <PencilIcon size={14} />
          </Button>
        )}
      </Card>

      <Card>
        <p className={styles.sectionTitle}>Avance del proyecto</p>
        <div style={{ marginTop: "var(--kora-space-4)" }}>
          <ProjectTimeline
            progress={project.progress}
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
            {project.prospectPhaseHours > 0 && (
              <span className={styles.metricSub}>{formatHours(project.prospectPhaseHours)} en fase Prospecto/Cotización</span>
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

                <AssignedTeamsCard
                  project={project}
                  teams={teamSummaries}
                  onViewHours={() => setTab("bitacora")}
                />
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
              members={project.members}
              canManage={canAddObservation}
              canCorrectHito0={can("projects:manage")}
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
