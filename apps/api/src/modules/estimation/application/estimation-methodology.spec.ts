import { describe, expect, it } from 'vitest';
import {
  ESTIMATION_METHODOLOGY_VERSION,
  isTechLeadRole,
  estimatedWeeksFromRoles,
  addMandatoryTechLeadSupervision,
  validateStageCapacity,
} from './estimation-methodology';

const base = (weeks: number) => ({
  stages: [{ code: 'T01', name: 'Construcción', startWeek: 1, durationWeeks: weeks }],
  activities: [{
    wbs: 'T01.01',
    stageCode: 'T01',
    module: 'Portal',
    submodule: 'Flujo de solicitudes',
    name: 'Implementar funcionalidad end-to-end',
    description: 'UI, API, persistencia y tests de una misma feature.',
    references: 'HU-01',
    classification: 'confirmado',
  }],
  roleHours: [{ wbs: 'T01.01', role: 'Desarrollo Fullstack', hours: 80 }],
});

describe('política de estimación profesional', () => {
  it('identifica el rol líder sin confundirlo con Desarrollo u otros equipos', () => {
    expect(isTechLeadRole('Líder Técnico')).toBe(true);
    expect(isTechLeadRole('Tech Lead')).toBe(true);
    expect(isTechLeadRole('Lider de Desarrollo')).toBe(true);
    expect(isTechLeadRole('Desarrollo Fullstack')).toBe(false);
    expect(ESTIMATION_METHODOLOGY_VERSION).toMatch(/ai-e2e/);
  });

  it('convierte duraciones preliminares a semanas sin reducir el calendario a HH/desarrollador', () => {
    expect(estimatedWeeksFromRoles([
      { duration: 4, unit: 'week' }, { duration: 10, unit: 'day' },
    ])).toBe(4);
    expect(estimatedWeeksFromRoles([{ duration: 11, unit: 'day' }])).toBe(3);
  });

  it('4 semanas generan exactamente 20 HH de supervisión semanal sin alterar HH de feature', () => {
    const result = addMandatoryTechLeadSupervision(base(4), 'Líder Técnico');
    expect(result.roleHours.find((row) => row.wbs === 'TL-GOV.01'))
      .toMatchObject({
        role: 'Líder Técnico', hours: 20,
        taskName: expect.stringContaining('Supervisar'),
        taskDescription: expect.stringContaining('Revisar avances'),
      });
    expect(result.roleHours.find((row) => row.wbs === 'T01.01')?.hours).toBe(80);
    expect(result.stages.find((stage) => stage.code === 'TL-GOV')).toMatchObject({
      startWeek: 1, durationWeeks: 4,
    });
    expect(result.activities).toHaveLength(2);
  });

  it('no calcula supervisión sobre tramos huérfanos sin WBS', () => {
    const data = base(4);
    data.stages.push({
      code: 'T02', name: 'Tramo sugerido, sin trabajo asignado',
      startWeek: 30, durationWeeks: 3,
    });
    const result = addMandatoryTechLeadSupervision(data, 'Líder Técnico');
    expect(result.stages.find((stage) => stage.code === 'TL-GOV'))
      .toMatchObject({ startWeek: 1, durationWeeks: 4 });
    expect(result.roleHours.find((row) => row.wbs === 'TL-GOV.01')?.hours).toBe(20);
    expect(result.roleHours.find((row) => row.wbs === 'T01.01')?.hours).toBe(80);
  });

  it('al comprimir 6 a 4 semanas reduce solo supervisión de 30 a 20 HH', () => {
    const six = addMandatoryTechLeadSupervision(base(6), 'Tech Lead');
    const four = addMandatoryTechLeadSupervision(base(4), 'Tech Lead');
    expect(six.roleHours.find((row) => row.wbs === 'TL-GOV.01')?.hours).toBe(30);
    expect(four.roleHours.find((row) => row.wbs === 'TL-GOV.01')?.hours).toBe(20);
    expect(six.roleHours.find((row) => row.wbs === 'T01.01')).toEqual(
      four.roleHours.find((row) => row.wbs === 'T01.01'),
    );
  });

  it('rechaza que Gemini duplique la supervisión del Tech Lead', () => {
    const data = base(4);
    data.activities[0]!.name = 'Supervisión técnica semanal';
    data.roleHours.push({ wbs: 'T01.01', role: 'Tech Lead', hours: 20 });
    expect(() => addMandatoryTechLeadSupervision(data, 'Tech Lead'))
      .toThrow(/Supervisión técnica duplicada/);
  });

  it('permite trabajo de arquitectura hands-on adicional pero conserva la base aparte', () => {
    const data = base(4);
    data.roleHours.push({ wbs: 'T01.01', role: 'Líder Técnico', hours: 8 });
    const result = addMandatoryTechLeadSupervision(data, 'Líder Técnico');
    expect(result.roleHours.filter((x) => x.role === 'Líder Técnico')
      .reduce((sum, x) => sum + x.hours, 0)).toBe(28);
  });

  it('detecta un tramo imposible de ejecutar según la capacidad humana declarada', () => {
    const data = base(1);
    data.roleHours[0]!.hours = 200;
    expect(() => validateStageCapacity(data, [
      { role: 'Desarrollo Fullstack', people: 1 },
    ])).toThrow(/excediendo el máximo físico/);
  });
});
