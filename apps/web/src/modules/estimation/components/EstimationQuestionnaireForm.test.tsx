import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { estimationQuestionSchema } from '@kora/contracts';
import { EstimationQuestionnaireForm } from './EstimationQuestionnaireForm';

const fixed = [
  estimationQuestionSchema.parse({
    id: 'F01', kind: 'fixed', category: 'Alcance', question: '¿Nivel de entrega?',
    impact: 'high', answerType: 'single_choice', required: true,
    options: [{ value: 'mvp', label: 'MVP' }, { value: 'poc', label: 'PoC' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F02', kind: 'fixed', category: 'Plazo', question: '¿Plazo objetivo?',
    impact: 'high', answerType: 'text', required: true,
  }),
  estimationQuestionSchema.parse({
    id: 'F03', kind: 'fixed', category: 'Equipo', question: '¿Equipo?',
    impact: 'high', answerType: 'single_choice', required: true,
    options: [{ value: 'ideal', label: 'Equipo ideal' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F04', kind: 'fixed', category: 'Postproducción', question: '¿Postproducción?',
    impact: 'medium', answerType: 'multi_choice', required: true,
    options: [{ value: 'uat', label: 'UAT' }, { value: 'none', label: 'Ninguna' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F05', kind: 'fixed', category: 'Adicional', question: '¿Más condiciones?',
    impact: 'low', answerType: 'text', required: false,
  }),
];

describe('R4-a · EstimationQuestionnaireForm', () => {
  it('requiere F01 antes de avanzar y conserva F02 al retroceder', () => {
    const submit = vi.fn();
    render(<EstimationQuestionnaireForm fixedQuestions={fixed} dynamicQuestions={[]}
      onSubmit={submit} />);
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(screen.getByText('¿Nivel de entrega?')).toBeInTheDocument();
    expect(screen.queryByText('¿Plazo objetivo?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    expect(screen.getByText(/Esta respuesta es necesaria/)).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('MVP'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta breve'), {
      target: { value: '8 semanas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByPlaceholderText('Escribe una respuesta breve')).toHaveValue('8 semanas');
    expect(submit).not.toHaveBeenCalled();
  });

  it('solo envía la propuesta tras confirmar F01–F04; F05 es opcional', () => {
    const submit = vi.fn();
    render(<EstimationQuestionnaireForm fixedQuestions={fixed} dynamicQuestions={[]}
      onSubmit={submit} />);
    fireEvent.click(screen.getByLabelText('MVP'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta breve'), {
      target: { value: '8 semanas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByLabelText('Equipo ideal'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByLabelText('UAT'));
    fireEvent.click(screen.getByLabelText('Ninguna'));
    expect(screen.getByLabelText('UAT')).not.toBeChecked();
    expect(screen.getByLabelText('Ninguna')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación final' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith([
      { questionId: 'F01', value: 'mvp', usedAssumption: false },
      { questionId: 'F02', value: '8 semanas', usedAssumption: false },
      { questionId: 'F03', value: 'ideal', usedAssumption: false },
      { questionId: 'F04', value: ['none'], usedAssumption: false },
    ]);
  });

  it('no deja avanzar si existe una generación en curso', () => {
    render(<EstimationQuestionnaireForm fixedQuestions={fixed} dynamicQuestions={[]}
      submitting onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Siguiente pregunta' })).toBeDisabled();
  });
});
