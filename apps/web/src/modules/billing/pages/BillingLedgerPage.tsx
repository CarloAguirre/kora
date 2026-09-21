import { useState } from 'react';
import styles from './BillingLedgerPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Tabs } from '@/shared/components/ui/Tabs';
import { SupportBillingSection } from '../components/SupportBillingSection';
import { ProjectsBillingSection } from '../components/ProjectsBillingSection';

type Module = 'soporte' | 'proyectos';
const MODULE_TABS: ReadonlyArray<{ id: Module; label: string }> = [
  { id: 'soporte', label: 'Soporte' },
  { id: 'proyectos', label: 'Proyectos' },
];

/**
 * Facturación — punto de entrada único a los dos libros de cobro, cada uno
 * con sus propios KPIs/filtros/tabla: Soporte (`SupportBillingSection`) y
 * Proyectos (`ProjectsBillingSection`, tramos de pago). Reemplaza la tabla
 * combinada anterior y la página separada `/facturacion-soporte` (que ahora
 * solo redirige acá) — ver `docs/DECISION-FACTURACION-PROYECTOS.md` y la
 * referencia de diseño en Figma (`kora-facturacion-soporte.html`).
 */
export function BillingLedgerPage() {
  const [module, setModule] = useState<Module>('soporte');

  return (
    <DashboardLayout title="Facturación">
      <div className={styles.page}>
        <p className={styles.subtitle}>Registra facturas, marca su estado y deja constancia de los pagos recibidos — de Soporte y de Proyectos.</p>

        <Tabs tabs={MODULE_TABS} activeId={module} onSelect={(id) => setModule(id as Module)} />

        {module === 'soporte' ? <SupportBillingSection /> : <ProjectsBillingSection />}
      </div>
    </DashboardLayout>
  );
}
