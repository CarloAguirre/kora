import { useNavigate } from 'react-router-dom';
import styles from './ForbiddenPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';

/** Pantalla para una ruta a la que la persona no tiene acceso. */
export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout title="Sin permiso">
      <div className={styles.wrapper}>
        <p className={styles.code}>403</p>
        <h2 className={styles.title}>No tienes acceso a esta sección</h2>
        <p className={styles.message}>
          Si crees que deberías tenerlo, pídeselo a un administrador: los permisos se asignan por
          rol desde la administración de usuarios.
        </p>
        <Button variant="outlineDark" onClick={() => void navigate(-1)}>
          Volver
        </Button>
      </div>
    </DashboardLayout>
  );
}
