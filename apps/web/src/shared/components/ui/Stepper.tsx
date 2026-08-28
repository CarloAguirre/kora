import styles from './Stepper.module.css';

export interface StepperStep {
  readonly label: string;
}

export interface StepperProps {
  readonly steps: readonly StepperStep[];
  /** Índice (0-based) del paso activo. Los anteriores se marcan como completados. */
  readonly activeIndex: number;
}

/** Pasos de un flujo — misma disposición que `KoraStepper.tsx` de la v1. */
export function Stepper({ steps, activeIndex }: StepperProps) {
  return (
    <ol className={styles.stepper}>
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;

        return (
          <li key={step.label} className={styles.step}>
            <span
              className={[styles.circle, isActive ? styles.circleActive : '', isComplete ? styles.circleComplete : '']
                .filter(Boolean)
                .join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              {index + 1}
            </span>
            <span className={[styles.label, isActive ? styles.labelActive : ''].filter(Boolean).join(' ')}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
