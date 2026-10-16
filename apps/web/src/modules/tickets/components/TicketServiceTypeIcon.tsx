import type { TicketServiceType } from '@kora/contracts';
import { AlertIcon, SettingsIcon, SparklesIcon } from '@/shared/components/icons/Icons';

/** Mejora → sparkles, Operativo → engranaje, el resto (incidente y tipos deprecados) → alerta. */
export function TicketServiceTypeIcon({ serviceType, size = 16 }: { serviceType: TicketServiceType | null; size?: number }) {
  if (serviceType === 'improvement') return <SparklesIcon size={size} />;
  if (serviceType === 'operational') return <SettingsIcon size={size} />;
  return <AlertIcon size={size} />;
}
