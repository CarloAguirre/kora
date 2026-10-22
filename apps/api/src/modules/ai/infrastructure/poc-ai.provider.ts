import { Injectable } from '@nestjs/common';
import type { AiProvider, AiStructuredRequest } from '../application/ports/ai-provider.port';

interface EstimationPocContext {
  projectName?: string;
  clientName?: string | null;
  answers?: readonly unknown[];
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
  readonly name = 'poc-ai';

  async generateStructured(input: AiStructuredRequest): Promise<unknown> {
    const context = (input.context ?? {}) as EstimationPocContext;

    if (input.task === 'estimation.poc.analysis') {
      return {
        summary:
          `Análisis preliminar PoC de ${context.projectName ?? 'el proyecto'}. ` +
          'En el flujo real esta etapa leerá los antecedentes de Drive, consolidará el contexto y formulará solo las aclaraciones que cambien materialmente la estimación.',
        detectedDocuments: [],
        dynamicQuestions: [
          {
            id: 'D01',
            kind: 'dynamic',
            category: 'Integraciones',
            question: '¿Las integraciones principales ya cuentan con API documentada y ambiente de prueba?',
            reason: 'La ausencia de una API disponible puede agregar una capa de integración y aumentar el esfuerzo.',
            impact: 'high',
            answerType: 'single_choice',
            options: [
              { value: 'yes', label: 'Sí, están disponibles' },
              { value: 'partial', label: 'Solo algunas' },
              { value: 'no', label: 'No / aún no se confirma' },
            ],
            required: true,
            canPrefill: false,
            confidence: 'low',
            priorityScore: 3,
            sourceRefs: [],
            dependsOn: [],
          },
          {
            id: 'D02',
            kind: 'dynamic',
            category: 'Datos',
            question: '¿Se requiere migrar o normalizar información histórica?',
            reason: 'Una carga histórica puede agregar ETL, homologación y pruebas de conciliación.',
            impact: 'medium',
            answerType: 'single_choice',
            options: [
              { value: 'no', label: 'No' },
              { value: 'yes_clean', label: 'Sí, datos ya preparados' },
              { value: 'yes_dirty', label: 'Sí, requieren limpieza/homologación' },
            ],
            required: true,
            canPrefill: false,
            confidence: 'low',
            priorityScore: 2,
            sourceRefs: [],
            dependsOn: [],
          },
        ],
      };
    }

    if (input.task !== 'estimation.poc.proposal') {
      throw new Error(`PoC AI provider does not support task: ${input.task}`);
    }

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
      summary:
        `Propuesta PoC para ${context.projectName ?? 'el proyecto'}${context.clientName ? ` de ${context.clientName}` : ''}. ` +
        `Se recibieron ${context.answers?.length ?? 0} respuestas de aclaración antes de estimar.`,
      roles,
      assumptions: [
        'Se reutilizan autenticación, proyectos, permisos, layout y componentes existentes de Kora.',
        'El proveedor simulado no interpreta documentos; configura GEMINI_API_KEY para la prueba real.',
        'Los cálculos de HH se realizan fuera del proveedor IA.',
      ],
      clarifyingQuestions: [],
    };
  }
}
