import { useNavigate } from 'react-router-dom';
import styles from './ForbiddenPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';

/** Ruta inexistente. */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout title="Página no encontrada">
      <div className={styles.wrapper}>
        <p className={styles.code}>404</p>
        <h2 className={styles.title}>Esta página no existe</h2>
        <p className={styles.message}>
          Puede que el enlace esté mal escrito o que la sección se haya movido.
        </p>
        <Button variant="outlineDark" onClick={() => void navigate('/dashboard')}>
          Ir al inicio
        </Button>
      </div>
    </DashboardLayout>
  );
}
