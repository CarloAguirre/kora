import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSupportSummary } from '@kora/contracts';
import styles from './DashboardSupportTab.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { KoraLogo } from '@/shared/components/layout/KoraLogo';
import { DownloadIcon, PlusIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { SupportTrendChart } from '../components/SupportTrendChart';
import { SupportClientBreakdown } from '../components/SupportClientBreakdown';
import { exportSupportReport } from '../lib/dashboard-support-export';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

interface DashboardSupportTabProps {
  support: DashboardSupportSummary | null;
  loading: boolean;
}

/** Tab "Soporte" del Dashboard — igual disposición que la tab Soporte del `Dashboard` admin en la v1. */
export function DashboardSupportTab({ support, loading }: DashboardSupportTabProps) {
  const { can } = usePermissions();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!support) return;
    setExporting(true);
    try {
      // Delay artificial para que se alcance a ver el estado "Generando…"
      // antes de que el navegador dispare la descarga.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      exportSupportReport(support);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.tab}>
      <div className={styles.header}>
        <span className={styles.title}>Reporte de Soporte</span>
        <div className={styles.headerActions}>
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={16} />}
            disabled={!support}
            loading={exporting}
            loadingText="Generando…"
            onClick={() => void handleExport()}
          >
            Descargar Reporte
          </Button>
          {can('projects:manage') && (
            <Link to="/proyectos/nuevo">
              <Button iconLeft={<PlusIcon size={16} />}>Crear Soporte</Button>
            </Link>
          )}
        </div>
      </div>

      <div className={styles.kpis}>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Proyectos con soporte</span>
          <span className={styles.kpiValue}>{loading ? '…' : (support?.projectsWithSupportCount ?? 0)}</span>
          <span className={styles.kpiSub}>activos</span>
        </Card>

        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Horas Vendidas</span>
          <span className={styles.kpiValue}>{loading ? '…' : `${formatHours(support?.soldHours ?? 0)} hrs`}</span>
          <span className={styles.kpiSub}>Capacidad contratada</span>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>Total Horas Utilizadas</span>
            <span className={styles.kpiPercent}>{support?.usedPercent ?? 0}%</span>
          </div>
          <span className={styles.kpiValue}>{loading ? '…' : `${formatHours(support?.usedHours ?? 0)} hrs`}</span>
          <span className={styles.kpiSub}>Alta demanda este mes</span>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>Horas Desviadas</span>
            <span className={styles.kpiPercentDanger}>{support?.deviationPercent ?? 0}%</span>
          </div>
          <span className={styles.kpiValue}>{loading ? '…' : `${formatHours(support?.deviationHours ?? 0)} hrs`}</span>
          <span className={styles.kpiSub}>Horas fuera de contrato</span>
        </Card>
      </div>

      <div className={styles.chartRow}>
        <Card className={styles.chartCard}>
          <SupportTrendChart trend={support?.trend ?? []} />
          <div className={styles.deviationTag}>
            <span>Desviación:</span>
            <span className={styles.deviationValue}>+{formatHours(support?.deviationHours ?? 0)} horas</span>
          </div>
        </Card>

        <Card className={styles.clientCard}>
          <SupportClientBreakdown clients={support?.topClients ?? []} />
        </Card>
      </div>

      <div className={styles.footer}>
        <span>Diseñado y desarrollado por</span>
        <KoraLogo variant="dark" />
      </div>
    </div>
  );
}
