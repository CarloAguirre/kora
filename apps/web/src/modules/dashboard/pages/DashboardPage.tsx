import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import styles from './DashboardPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Tabs } from '@/shared/components/ui/Tabs';
import { useToast } from '@/shared/components/ui/Toast';
import { ClockIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { HourEntryFormDialog } from '@/modules/hours/components/HourEntryFormDialog';
import { useDashboardSummary } from '../api/dashboard.queries';
import { DashboardMySummary } from '../components/DashboardMySummary';
import { MyActivityPanel } from '../components/MyActivityPanel';
import { DashboardProjectsTab } from './DashboardProjectsTab';
import { DashboardSupportTab } from './DashboardSupportTab';

const ALL_TABS = [
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'soporte', label: 'Soporte' },
] as const;

/**
 * Panel principal — replica la disposición del `Dashboard` admin de la v1
 * (tabs Proyectos/Soporte) en vez del panel único genérico que reemplazaba
 * los cuatro paneles de la v1 (ver historial de `docs/DECISION-M7-DASHBOARD.md`
 * — decisión revisitada a pedido explícito, incluida la tab Soporte).
 *
 * Para `collaborator` las tabs Proyectos/Soporte —pensadas para quien
 * gestiona una cartera de proyectos— se reemplazan por "Mi Panel de
 * Actividad" (`MyActivityPanel`), el panel personal que tenía en la v1
 * (`ColaboradorDashboard`, ruta `/colaborador`); en la v1 ese rol nunca vio
 * el Dashboard de proyectos.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const isCollaborator = user?.role === 'collaborator';
  // `leader` ya no tiene `billing:read` (no debe entrar a Facturación), pero esta tab es
  // de métricas de soporte, no de facturación — se mantiene visible para ese rol aparte.
  const showSupportTab = can('billing:read') || user?.role === 'leader';
  const tabs = showSupportTab ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'soporte');
  const [tab, setTab] = useState<'proyectos' | 'soporte'>('proyectos');
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [registerHoursOpen, setRegisterHoursOpen] = useState(false);
  const { data: summary, isLoading } = useDashboardSummary(weekStart);
  const activeTab = tab === 'soporte' && !showSupportTab ? 'proyectos' : tab;

  // `cliente` no tiene ningún permiso de este dashboard interno (KPIs,
  // aprobaciones, forecast…): su "inicio" es el portal de solo-lectura de su
  // propia empresa. El chequeo va DESPUÉS de llamar todos los hooks de arriba
  // (reglas de los Hooks) — ver docs/DECISION-PORTAL-CLIENTE.md.
  if (user?.role === 'cliente') {
    return <Navigate to="/portal/proyectos" replace />;
  }
  // Mismo criterio para `finanzas`: perfil de un único propósito, su "inicio" es el libro de Facturación.
  if (user?.role === 'finanzas') {
    return <Navigate to="/facturacion" replace />;
  }

  return (
    <DashboardLayout title="Dashboard Principal">
      <div className={styles.page}>
        <div className={styles.topRow}>
          {isCollaborator ? <div /> : <Tabs tabs={tabs} activeId={activeTab} onSelect={(id) => setTab(id as 'proyectos' | 'soporte')} />}
          <div className={styles.actions}>
            {can('hours:register') && (
              <Button iconLeft={<ClockIcon size={16} />} onClick={() => setRegisterHoursOpen(true)}>
                Registrar Horas
              </Button>
            )}
          </div>
        </div>

        {isCollaborator ? (
          <>
            <DashboardMySummary hours={null} approvals={null} tickets={summary?.tickets ?? null} loading={isLoading} />
            <MyActivityPanel
              hours={summary?.hours ?? null}
              myActiveProjects={summary?.myActiveProjects ?? []}
              myTasks={summary?.myTasks ?? []}
              myDeliveries={summary?.myDeliveries ?? []}
              planning={summary?.planning ?? null}
              loading={isLoading}
              weekStart={weekStart}
              onWeekStartChange={setWeekStart}
            />
          </>
        ) : (
          <>
            {user?.role === 'leader' && (
              <DashboardMySummary
                hours={summary?.hours ?? null}
                approvals={summary?.approvals ?? null}
                tickets={summary?.tickets ?? null}
                overtime={summary?.support?.overtime ?? null}
                onOpenOvertime={() => setTab('soporte')}
                loading={isLoading}
              />
            )}

            {activeTab === 'proyectos' ? (
              <DashboardProjectsTab
                projects={summary?.projects ?? null}
                capacity={summary?.capacity ?? null}
                loading={isLoading}
                weekStart={weekStart}
                onWeekStartChange={setWeekStart}
              />
            ) : (
              <DashboardSupportTab support={summary?.support ?? null} loading={isLoading} />
            )}
          </>
        )}
      </div>

      <HourEntryFormDialog
        open={registerHoursOpen}
        entry={null}
        onClose={() => setRegisterHoursOpen(false)}
        onSuccess={(message) => {
          toast.success(message);
          setRegisterHoursOpen(false);
        }}
      />
    </DashboardLayout>
  );
}
