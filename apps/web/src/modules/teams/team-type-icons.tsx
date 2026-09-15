/**
 * Set de íconos para el catálogo de "tipo de equipo" (UX-UI, Desarrollo, QA...).
 *
 * Vive aparte de `shared/components/icons/Icons.tsx` porque ese set es para la
 * navegación y los íconos de acción de toda la app — este es un catálogo
 * cerrado de opciones para un selector puntual, que no debería crecer el set
 * compartido cada vez que se agregue una opción nueva. Mismo trazo (Lucide,
 * `currentColor`, stroke 2) que el resto de los íconos de Kora.
 */
import type { SVGProps } from 'react';

export interface TeamTypeIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
}

function Icon({ size = 20, children, ...rest }: TeamTypeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const TEAM_TYPE_ICON_RENDERERS = {
  layers: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  ),
  palette: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16c-1 0-1.6-.5-1.6-1.3 0-.5.2-.8.5-1.1.3-.3.5-.6.5-1.1 0-.8-.7-1.5-1.6-1.5H8.5A2.5 2.5 0 0 1 6 10.5 8 8 0 0 1 12 4" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="9.5" cy="7" r="1" />
      <circle cx="14.5" cy="7" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </Icon>
  ),
  code: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <polyline points="8 6 3 12 8 18" />
      <polyline points="16 6 21 12 16 18" />
    </Icon>
  ),
  shield: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" />
      <polyline points="9 12 11 14 15 10" />
    </Icon>
  ),
  bot: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <rect x="4" y="9" width="16" height="10" rx="2" />
      <circle cx="9" cy="14" r="1.2" />
      <circle cx="15" cy="14" r="1.2" />
      <line x1="12" y1="9" x2="12" y2="5" />
      <circle cx="12" cy="4" r="1.2" />
      <line x1="2" y1="13" x2="4" y2="13" />
      <line x1="20" y1="13" x2="22" y2="13" />
    </Icon>
  ),
  brain: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M9.5 3.5a2.5 2.5 0 0 0-2.5 2.5v.6A3 3 0 0 0 5 9.4v1.2A3 3 0 0 0 4 13v.5A3 3 0 0 0 6 16v.5A3.5 3.5 0 0 0 9.5 20 2.5 2.5 0 0 0 12 17.5v-11A2.5 2.5 0 0 0 9.5 3.5z" />
      <path d="M14.5 3.5A2.5 2.5 0 0 1 17 6v.6a3 3 0 0 1 2 2.8v1.2A3 3 0 0 1 20 13v.5a3 3 0 0 1-2 2.5v.5a3.5 3.5 0 0 1-3.5 3.5A2.5 2.5 0 0 1 12 17.5v-11A2.5 2.5 0 0 1 14.5 3.5z" />
    </Icon>
  ),
  star: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />
    </Icon>
  ),
  flag: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <line x1="4" y1="22" x2="4" y2="3" />
      <path d="M4 4h14l-3 4 3 4H4" />
    </Icon>
  ),
  briefcase: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </Icon>
  ),
  headset: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2" y="14" width="5" height="7" rx="2" />
      <rect x="17" y="14" width="5" height="7" rx="2" />
    </Icon>
  ),
  chart: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="4" />
      <line x1="16" y1="20" x2="16" y2="14" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </Icon>
  ),
  users: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.3 14.2c2.3.5 4.2 2.5 4.2 5.8" />
    </Icon>
  ),
  rocket: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M12 15l-3-3c.5-2.2 1.4-4.2 2.6-5.9C13.4 3.4 16.4 2 19 2c0 2.6-1.4 5.6-4.1 7.4A15.6 15.6 0 0 1 9 12" />
      <path d="M9 12H4s.6-2.7 2-3.6c1.5-1 3.5-.4 5 .6" />
      <path d="M12 15v5s2.7-.6 3.6-2c1-1.5.4-3.5-.6-5" />
      <path d="M4.7 16.5c-1.3 1.2-1.7 4.3-1.7 4.3s3.1-.4 4.3-1.7c.7-.7.7-1.9-.1-2.6-.7-.8-1.9-.8-2.5 0z" />
    </Icon>
  ),
  wrench: (props: TeamTypeIconProps) => (
    <Icon {...props}>
      <path d="M14.7 6.3a4 4 0 1 1-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 1 5.4-5.4l-2.8 2.8-2.7-2.7z" />
    </Icon>
  ),
} as const;

export type TeamTypeIconKey = keyof typeof TEAM_TYPE_ICON_RENDERERS;

export const TEAM_TYPE_ICON_OPTIONS = Object.keys(TEAM_TYPE_ICON_RENDERERS) as TeamTypeIconKey[];

const DEFAULT_ICON: TeamTypeIconKey = 'layers';

/** Ícono de un tipo de equipo, con fallback a un ícono neutro para claves desconocidas (tipos creados por versiones futuras del set). */
export function TeamTypeIcon({ icon, ...rest }: TeamTypeIconProps & { icon: string }) {
  const Renderer = TEAM_TYPE_ICON_RENDERERS[icon as TeamTypeIconKey] ?? TEAM_TYPE_ICON_RENDERERS[DEFAULT_ICON];
  return <Renderer {...rest} />;
}

/** Paleta fija de colores para elegir al crear un tipo de equipo nuevo (par color + fondo suave). */
export const TEAM_TYPE_COLOR_CHOICES: ReadonlyArray<{ color: string; bg: string }> = [
  { color: '#2563EB', bg: '#EFF6FF' },
  { color: '#16A34A', bg: '#EAF7EE' },
  { color: '#7C3AED', bg: '#F3EEFE' },
  { color: '#EA580C', bg: '#FFF1E7' },
  { color: '#DB2777', bg: '#FDF0F7' },
  { color: '#0EA5E9', bg: '#E6F6FE' },
  { color: '#65A30D', bg: '#F1F8E3' },
  { color: '#DC2626', bg: '#FDEAEA' },
  { color: '#0D9488', bg: '#E6F7F5' },
  { color: '#CA8A04', bg: '#FEF9E7' },
];

export function teamTypeBackground(color: string): string {
  return `color-mix(in srgb, ${color} 14%, white)`;
}
