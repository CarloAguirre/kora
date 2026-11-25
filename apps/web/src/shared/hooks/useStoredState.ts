import { useCallback, useEffect, useState } from 'react';

/**
 * `useState` que se recuerda en `localStorage` bajo `key` — para preferencias de
 * pantalla (qué secciones están visibles, etc.), nunca para identidad ni datos
 * que deban persistir de verdad: vive solo en este navegador. Con `key` en `null`
 * (p. ej. mientras carga lo que la arma) se comporta como un `useState` normal.
 * Cuando `key` cambia, vuelve a leer lo guardado bajo la nueva clave.
 */
export function useStoredState<T>(key: string | null, fallback: T): [T, (update: T | ((prev: T) => T)) => void] {
  const [entry, setEntry] = useState(() => ({ key, value: readStored(key, fallback) }));

  let current = entry;
  if (entry.key !== key) {
    current = { key, value: readStored(key, fallback) };
    setEntry(current);
  }

  useEffect(() => {
    if (!entry.key) return;
    try {
      localStorage.setItem(entry.key, JSON.stringify(entry.value));
    } catch {
      // Sin almacenamiento (modo privado, cuota llena): queda solo en memoria.
    }
  }, [entry]);

  const setValue = useCallback((update: T | ((prev: T) => T)) => {
    setEntry((prev) => ({
      key: prev.key,
      value: typeof update === 'function' ? (update as (prev: T) => T)(prev.value) : update,
    }));
  }, []);

  return [current.value, setValue];
}

function readStored<T>(key: string | null, fallback: T): T {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
