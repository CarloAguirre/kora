import { useState, type ReactNode } from 'react';
import styles from './DashboardLayout.module.css';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * Estructura de las pantallas autenticadas.
 *
 * Su única responsabilidad es colocar sidebar, barra superior y contenido, y
 * gestionar la apertura del menú en pantallas pequeñas. Ninguna página vuelve a
 * escribir esta estructura.
 */
export interface DashboardLayoutProps {
  title: string;
  children: ReactNode;
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.layout}>
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />

      {menuOpen && (
        <div
          className={styles.overlay}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={styles.main}>
        <TopBar title={title} onMenuToggle={() => setMenuOpen((open) => !open)} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
