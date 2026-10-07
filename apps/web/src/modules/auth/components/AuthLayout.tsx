import type { ReactNode } from 'react';
import styles from '../pages/LoginPage.module.css';

interface AuthLayoutProps {
  title: string;
  tagline?: string;
  children: ReactNode;
}

/**
 * Marco común de las pantallas de acceso (login, recuperar y definir
 * contraseña): formulario a la izquierda e imagen de marca a la derecha.
 * Vive aparte para que las tres pantallas no puedan desalinearse cuando
 * cambie el diseño de una.
 */
export function AuthLayout({ title, tagline, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftContent}>
          <img src="/images/kora-logo-pdf.png" alt="Kora" className={styles.logo} />

          <div className={styles.welcome}>
            <div className={styles.welcomeText}>
              <h1 className={styles.title}>{title}</h1>
              {tagline && <p className={styles.tagline}>{tagline}</p>}
            </div>

            {children}
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <img src="/images/login-side.png" alt="" className={styles.rightImage} />
        <div className={styles.credit}>
          <span>Diseñado y desarrollado por</span>
          <a href="https://kabeli.cl/" className={styles.creditLink}>
            Kabeli
          </a>
        </div>
      </div>
    </div>
  );
}
