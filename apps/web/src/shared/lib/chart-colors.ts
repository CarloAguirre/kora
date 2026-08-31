/**
 * Paleta categórica para gráficos de identidad (equipo, cliente, etc.) sin un
 * color propio ya establecido en el resto de la app. Orden fijo, validado
 * contra separación CVD y umbral de visión normal (ver skill `dataviz`) — no
 * ciclar ni reordenar por ranking.
 */
export const CATEGORICAL_CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'] as const;
