import type { ForecastCapacityItem, ForecastCapacityMember } from '@kora/contracts';
import styles from './ForecastCapacityCard.module.css';
import { Card } from '@/shared/components/ui/Card';

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Vacaciones',
  admin_day: 'Día administrativo',
  day_off: 'Día libre',
  sick_leave: 'Licencia médica',
  training: 'Capacitación',
  other: 'Otros',
};

const TYPE_CHIP_CLASS: Record<string, string | undefined> = {
  project: styles.chipProject,
  support: styles.chipSupport,
  vacation: styles.chipVacation,
  admin_day: styles.chipNeutral,
  day_off: styles.chipNeutral,
  sick_leave: styles.chipSick,
  training: styles.chipTraining,
  other: styles.chipNeutral,
};

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const second = parts.length > 1 ? parts[1]![0]! : (parts[0]![1] ?? '');
  return (first + second).toUpperCase();
}

function itemLabel(item: ForecastCapacityItem): string {
  return item.projectName ?? TYPE_LABELS[item.type] ?? item.type;
}

export function ForecastCapacityCard({ member }: { member: ForecastCapacityMember }) {
  const remaining = Math.max(0, member.capacityHours - member.assignedHours);
  const isOverloaded = member.assignedHours > member.capacityHours;
  const percent = Math.min(100, Math.max(0, member.loadPercent));

  const barClass = isOverloaded ? styles.barDanger : member.loadPercent === 100 ? styles.barSuccess : styles.barWarning;
  const statusClass = isOverloaded ? styles.statusDanger : member.loadPercent === 100 ? styles.statusSuccess : styles.statusWarning;
  const statusLabel = isOverloaded
    ? `Sobrecargado (+${member.assignedHours - member.capacityHours}h)`
    : member.loadPercent === 100
      ? 'Completo'
      : member.assignedHours === 0
        ? 'Sin asignación'
        : `${remaining}h libres`;

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.avatar}>{initials(member.fullName)}</span>
        <div className={styles.identity}>
          <span className={styles.name} title={member.fullName}>
            {member.fullName}
          </span>
          <span className={styles.team}>{member.teamName}</span>
        </div>
      </div>

      <div className={styles.loadRow}>
        <div className={styles.barTrack}>
          <div className={[styles.barFill, barClass].join(' ')} style={{ width: `${percent}%` }} />
        </div>
        <span className={[styles.statusText, statusClass].join(' ')}>
          {member.loadPercent}% · {statusLabel}
        </span>
      </div>

      <div className={styles.chips}>
        {member.items.length === 0 && <span className={styles.chipEmpty}>Sin asignación</span>}
        {member.items.map((item, index) => (
          <span
            key={`${item.type}-${item.projectId ?? index}`}
            className={[styles.chip, TYPE_CHIP_CLASS[item.type]].filter(Boolean).join(' ')}
            title={item.comments.join(' · ')}
          >
            {itemLabel(item)} · {item.hours}h
          </span>
        ))}
      </div>
    </Card>
  );
}
