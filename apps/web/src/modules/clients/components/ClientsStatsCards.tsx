import type { ClientsStats } from '@kora/contracts';
import styles from './ClientsStatsCards.module.css';
import { Card } from '@/shared/components/ui/Card';
import { ClientsStatusDonut } from './ClientsStatusDonut';
import { ClientsCountryBreakdown } from './ClientsCountryBreakdown';

interface ClientsStatsCardsProps {
  stats: ClientsStats | undefined;
  loading: boolean;
}

export function ClientsStatsCards({ stats, loading }: ClientsStatsCardsProps) {
  return (
    <div className={styles.row}>
      <Card className={styles.donutCard}>
        <ClientsStatusDonut
          activeCount={stats?.activeCount ?? 0}
          inactiveCount={stats?.inactiveCount ?? 0}
          loading={loading}
        />
      </Card>

      <Card className={styles.breakdownCard}>
        <ClientsCountryBreakdown items={stats?.byCountry ?? []} loading={loading} />
      </Card>
    </div>
  );
}
