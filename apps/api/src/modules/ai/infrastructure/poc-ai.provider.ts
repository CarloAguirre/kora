import { Injectable } from '@nestjs/common';
import type { AiProvider, AiStructuredRequest } from '../application/ports/ai-provider.port';

interface EstimationPocContext {
  projectName?: string;
  clientName?: string | null;
}

/**
 * Adaptador deliberadamente simulado para la PoC.
 *
 * Demuestra la frontera Calculadora -> IA sin incorporar todavía credenciales,
 * SDKs ni lecturas falsas de Drive. Se reemplaza por el proveedor real sin
 * cambiar el caso de uso consumidor.
 */
@Injectable()
export class PocAiProvider implements AiProvider {
  async generateStructured(input: AiStructuredRequest): Promise<unknown> {
    if (input.task !== 'estimation.poc.proposal') {
      throw new Error(`PoC AI provider does not support task: ${input.task}`);
    }

    const context = (input.context ?? {}) as EstimationPocContext;
    const hayIa = /\b(ia|ai|inteligencia|llm|agente)\b/i.test(
      `${context.projectName ?? ''} ${input.instructions ?? ''}`,
    );

    const roles = [
      {
        role: 'Desarrollador Fullstack',
        unit: 'week',
        duration: 6,
        hoursPerUnit: 40,
        people: 2,
        source: 'PoC: perfil base para implementación end-to-end.',
      },
      {
        role: 'Tech Lead',
        unit: 'week',
        duration: 6,
        hoursPerUnit: 10,
        people: 1,
        source: 'PoC: acompañamiento técnico durante la ejecución.',
      },
      {
        role: 'QA',
        unit: 'week',
        duration: 2,
        hoursPerUnit: 40,
        people: 1,
        source: 'PoC: ciclo de pruebas funcionales y regresión.',
      },
      {
        role: 'UX/UI',
        unit: 'day',
        duration: 5,
        hoursPerUnit: 8,
        people: 1,
        source: 'PoC: adaptación de vistas y flujo sobre design system existente.',
      },
      ...(hayIa
        ? [
            {
              role: 'Desarrollador IA',
              unit: 'week',
              duration: 2,
              hoursPerUnit: 40,
              people: 1,
              source: 'PoC: el nombre o las instrucciones mencionan capacidades de IA.',
            },
          ]
        : []),
    ];

    return {
      summary: `Propuesta PoC para ${context.projectName ?? 'el proyecto'}${context.clientName ? ` de ${context.clientName}` : ''}. La estructura demuestra el flujo de Calculadora consumiendo un módulo IA desacoplado.`,
      roles,
      assumptions: [
        'Se reutilizan autenticación, proyectos, permisos, layout y componentes existentes de Kora.',
        'La PoC no descarga ni interpreta todavía los archivos de Drive.',
        'Los cálculos de HH se realizan fuera del proveedor IA.',
      ],
      clarifyingQuestions: [
        '¿El alcance corresponde a un MVP, una fase específica o la solución completa?',
        '¿Existe una fecha objetivo que condicione la cantidad de personas en paralelo?',
        '¿Las integraciones mencionadas disponen de APIs y ambientes de prueba?',
      ],
    };
  }
}
