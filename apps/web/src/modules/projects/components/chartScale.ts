export interface Scale {
  max: number;
  ticks: number[];
}

/** Máximo "redondo" (múltiplo de 1/2/2,5/5 × 10ⁿ) con ~4 marcas, para que el eje no muestre 550/1100/1650. */
export function niceScale(maxValue: number): Scale {
  if (maxValue <= 0) return { max: 10, ticks: [0, 5, 10] };
  const rough = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  return { max, ticks };
}
