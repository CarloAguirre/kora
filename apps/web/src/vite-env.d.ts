/// <reference types="vite/client" />

/**
 * Tipado de los CSS Modules.
 *
 * Sin esto, `import styles from './X.module.css'` sería un error de
 * compilación. Se declara como registro de strings: `styles.noExiste` compila,
 * pero devuelve `undefined` en tiempo de ejecución. Un tipado exacto por
 * archivo requeriría un generador; para este tamaño de proyecto no compensa.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
