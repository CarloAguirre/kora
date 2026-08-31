import { useState } from "react";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { ROLE_LABELS } from "@kora/contracts";
import { BellIcon, LogoutIcon, MenuIcon } from "../icons/Icons";
import { ConfirmActionDialog } from "@/shared/components/ui/ConfirmActionDialog";
import styles from "./TopBar.module.css";

/** Barra superior: título de la sección y datos de quien está conectado. */
export interface TopBarProps {
  title: string;
  onMenuToggle: () => void;
}

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  const { user, signOut } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "";

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onMenuToggle}
        aria-label="Abrir menú de navegación"
      >
        <MenuIcon size={24} />
      </button>

      <h1 className={styles.title}>{title}</h1>

      {user && (
        <div className={styles.userSection}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Notificaciones"
          >
            <BellIcon size={20} />
          </button>
          <div className={styles.avatar} aria-hidden="true">
            {initials}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.fullName}</span>
            <span className={styles.userRole}>{ROLE_LABELS[user.role]}</span>
          </div>

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setConfirmSignOut(true)}
            aria-label="Cerrar sesión"
          >
            <LogoutIcon size={20} />
          </button>
        </div>
      )}

      <ConfirmActionDialog
        open={confirmSignOut}
        title="Cerrar sesión"
        description="¿Estás seguro de que quieres cerrar sesión?"
        confirmLabel="Cerrar sesión"
        onConfirm={async () => {
          await signOut();
        }}
        onClose={() => setConfirmSignOut(false)}
      />
    </header>
  );
}
