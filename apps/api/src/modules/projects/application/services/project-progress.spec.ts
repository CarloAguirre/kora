import { describe, expect, it } from 'vitest';
import {
  calculateModuleProgress,
  calculateProjectProgress,
  progressToday,
  type ProgressDeliveryInput,
  type ProgressModuleInput,
  type ProgressProjectInput,
  type ProgressTaskInput,
} from './project-progress';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = '2026-10-01';

const task = (overrides: Partial<ProgressTaskInput> = {}): ProgressTaskInput => ({
  estimatedHours: 10,
  status: 'todo',
  date: d('2026-10-15'),
  scope: 'desarrollo',
  ...overrides,
});

const delivery = (overrides: Partial<ProgressDeliveryInput> = {}): ProgressDeliveryInput => ({
  status: 'planned',
  estimatedDate: d('2026-10-15'),
  ...overrides,
});

const module = (overrides: Partial<ProgressModuleInput> = {}): ProgressModuleInput => ({
  estimatedHours: null,
  currentStage: 'development',
  tasks: [],
  deliveries: [],
  ...overrides,
});

const project = (overrides: Partial<ProgressProjectInput> = {}): ProgressProjectInput => ({
  soldHours: 0,
  usedHours: 0,
  status: 'active',
  stopsClock: false,
  modules: [],
  ...overrides,
});

describe('calculateProjectProgress', () => {
  it('pondera por HH: solo las tareas Aprobadas suman al real', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            tasks: [
              task({ estimatedHours: 30, status: 'done' }),
              task({ estimatedHours: 50, status: 'in_review' }),
              task({ estimatedHours: 20, status: 'in_progress' }),
            ],
          }),
        ],
      }),
      TODAY,
    );

    expect(progress.actual).toBe(30);
  });

  it('las HH de fases sin tareas cuentan en la base: un plan a medias no marca 100%', () => {
    const done = task({ estimatedHours: 100, status: 'done' });
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({ estimatedHours: 100, tasks: [done] }),
          module({ estimatedHours: 100 }),
          module({ estimatedHours: 100 }),
          module({ estimatedHours: 100 }),
        ],
      }),
      TODAY,
    );

    expect(progress.actual).toBe(25);
    expect(progress.planCoverage).toBe(25);
  });

  it('el esperado cuenta las tareas con fecha límite hasta hoy inclusive', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            tasks: [
              task({ date: d('2026-09-20') }),
              task({ date: d(TODAY) }),
              task({ date: d('2026-10-02') }),
              task({ date: d('2026-11-01') }),
            ],
          }),
        ],
      }),
      TODAY,
    );

    expect(progress.expected).toBe(50);
    expect(progress.delay).toBe(50);
  });

  it('sin tareas en ninguna fase no hay avance, nunca 0%', () => {
    const progress = calculateProjectProgress(project({ modules: [module({ estimatedHours: 80 })] }), TODAY);

    expect(progress.actual).toBeNull();
    expect(progress.expected).toBeNull();
    expect(progress.delay).toBeNull();
    expect(progress.planCoverage).toBe(0);
  });

  it('una fase cerrada a mano cuenta 100% aunque tenga tareas pendientes', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({ currentStage: 'closed', estimatedHours: 40, tasks: [task({ estimatedHours: 10 })] }),
          module({ estimatedHours: 40, tasks: [task({ estimatedHours: 40 })] }),
        ],
      }),
      TODAY,
    );

    expect(progress.actual).toBe(50);
  });

  it('las tareas antiguas sin HH pesan el promedio de las que sí tienen en su fase', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            tasks: [
              task({ estimatedHours: 10, status: 'done' }),
              task({ estimatedHours: 30 }),
              task({ estimatedHours: null, status: 'done' }),
            ],
          }),
        ],
      }),
      TODAY,
    );

    // Pesos 10 + 30 + 20 (promedio) = 60; aprobadas 10 + 20 = 30.
    expect(progress.actual).toBe(50);
    expect(progress.estimatedByCount).toBe(false);
  });

  it('una fase sin HH en ninguna tarea se calcula por cantidad y lo avisa', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            tasks: [task({ estimatedHours: null, status: 'done' }), task({ estimatedHours: null }), task({ estimatedHours: 0 })],
          }),
        ],
      }),
      TODAY,
    );

    expect(progress.actual).toBe(33);
    expect(progress.estimatedByCount).toBe(true);
  });

  it('por cantidad de tareas, reparte las HH de la fase entre sus tareas', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            estimatedHours: 120,
            tasks: [task({ estimatedHours: null, status: 'done' }), task({ estimatedHours: null }), task({ estimatedHours: null })],
          }),
          module({ estimatedHours: 120, tasks: [task({ estimatedHours: 120 })] }),
        ],
      }),
      TODAY,
    );

    // Fase 1: 3 tareas de 40 HH, una aprobada = 40 de una base total de 240.
    expect(progress.actual).toBe(17);
    expect(progress.planCoverage).toBe(100);
  });

  it('una fase con HH y solo entregas no reparte sus HH: aprobar la única entrega no la marca al 100%', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [module({ estimatedHours: 1260, deliveries: [delivery({ status: 'approved' })] })],
      }),
      TODAY,
    );

    // La entrega pesa 1 sobre una base de 1260 HH: la fase todavía no tiene plan de tareas.
    expect(progress.actual).toBe(0);
    expect(progress.expected).toBe(0);
    expect(progress.planCoverage).toBe(0);
    expect(progress.estimatedByCount).toBe(false);
  });

  it('una fase sin HH y solo con entregas se calcula por cantidad de entregas', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            deliveries: [
              delivery({ status: 'approved', estimatedDate: d('2026-09-20') }),
              delivery({ status: 'delivered', estimatedDate: d('2026-09-25') }),
              delivery({ estimatedDate: d('2026-10-20') }),
              delivery({ estimatedDate: d('2026-11-01') }),
            ],
          }),
        ],
      }),
      TODAY,
    );

    // Una aprobada (la terminada sin aprobar no suma), dos con fecha ya pasada.
    expect(progress.actual).toBe(25);
    expect(progress.expected).toBe(50);
    expect(progress.estimatedByCount).toBe(true);
  });

  it('con tareas con HH, cada entrega pesa el promedio de las tareas de su fase', () => {
    const progress = calculateProjectProgress(
      project({
        modules: [
          module({
            tasks: [task({ estimatedHours: 10, status: 'done' }), task({ estimatedHours: 30 })],
            deliveries: [delivery({ status: 'approved' })],
          }),
        ],
      }),
      TODAY,
    );

    // Pesos 10 + 30 + 20 (entrega) = 60; aprobadas 10 + 20 = 30.
    expect(progress.actual).toBe(50);
    expect(progress.estimatedByCount).toBe(false);
  });

  it('el consumo de HH se calcula aparte y puede superar 100%', () => {
    const progress = calculateProjectProgress(project({ soldHours: 100, usedHours: 120 }), TODAY);

    expect(progress.consumption).toBe(120);
    expect(progress.actual).toBeNull();
  });

  it('no evalúa el Retraso con el proyecto detenido y el reloj pausado', () => {
    const modules = [module({ tasks: [task({ date: d('2026-09-01') })] })];

    expect(calculateProjectProgress(project({ status: 'on_hold', stopsClock: true, modules }), TODAY).delay).toBeNull();
    expect(calculateProjectProgress(project({ status: 'on_hold', stopsClock: false, modules }), TODAY).delay).toBe(100);
  });
});

describe('calculateModuleProgress', () => {
  it('calcula el avance por ámbito y deja en null los ámbitos sin tareas', () => {
    const progress = calculateModuleProgress(
      module({
        tasks: [
          task({ scope: 'diseno', estimatedHours: 10, status: 'done' }),
          task({ scope: 'desarrollo', estimatedHours: 30, status: 'done' }),
          task({ scope: 'desarrollo', estimatedHours: 10 }),
        ],
      }),
      TODAY,
    );

    expect(progress.scopes).toEqual({ diseno: 100, desarrollo: 75, qa: null, revision_cliente: null });
  });

  it('una fase sin tareas no tiene avance', () => {
    const progress = calculateModuleProgress(module({ estimatedHours: 40 }), TODAY);

    expect(progress.actual).toBeNull();
    expect(progress.expected).toBeNull();
  });
});

describe('progressToday', () => {
  it('toma el día calendario de Chile, no el de UTC', () => {
    // 01-10-2026 02:00 UTC = 30-09-2026 23:00 en Chile (UTC-3).
    expect(progressToday(new Date('2026-10-01T02:00:00.000Z'))).toBe('2026-09-30');
  });
});
