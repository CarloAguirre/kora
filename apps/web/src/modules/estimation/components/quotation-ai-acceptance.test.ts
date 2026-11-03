import { describe, expect, it } from 'vitest';
import type { QuotationVersion } from '@kora/contracts';
import { quotationAiAcceptanceBlockReason } from './quotation-ai-acceptance';

const teamId = '0777e456-fd76-445e-83f1-afc25061c105';
const pending = {
  origin: 'ai', aiReviewStatus: 'pending', status: 'draft', totalHours: 40,
  draft: {
    teams: [],
    aiPoc: {
      roleTeamIds: {},
      edt: {
        schemaVersion: 'kora.quotation.reference-edt.v1',
        source: 'kdm_demo', provider: 'gemini', totalHours: 40,
        modules: [{ name: 'Arquitectura', totalHours: 40, tasks: [{
          wbs: '1.1', name: 'Diseño', description: 'Arquitectura',
          role: 'Tech Lead / Arquitecto de Software', hours: 40,
        }] }],
      },
      proposal: { roles: [{ role: 'Tech Lead / Arquitecto de Software' }] },
    },
  },
} as unknown as QuotationVersion;
const state = { editable: true, dirty: false, isLatest: true };

describe('Aceptar propuesta IA · motivos de bloqueo', () => {
  it('explica tanto los cambios sin guardar como el mapeo incompleto', () => {
    const reason = quotationAiAcceptanceBlockReason(pending, { ...state, dirty: true });
    expect(reason).toContain('guarda los cambios del borrador');
    expect(reason).toContain('asigna todos los perfiles');
  });

  it('guardar no basta si el perfil sigue sin equipo Kora', () => {
    expect(quotationAiAcceptanceBlockReason(pending, state))
      .toContain('asigna todos los perfiles');
  });

  it('habilita aceptar cuando la versión está guardada y todos los perfiles tienen equipo', () => {
    const mapped = {
      ...pending,
      draft: {
        ...pending.draft,
        teams: [{ teamId, collaborators: 1, unit: 'week' as const,
          duration: 1, hoursPerWeek: 40, dedicationPercent: 100 }],
        aiPoc: {
          ...pending.draft.aiPoc!,
          roleTeamIds: { 'Tech Lead / Arquitecto de Software': teamId },
        },
      },
    } as QuotationVersion;
    expect(quotationAiAcceptanceBlockReason(mapped, state)).toBeNull();
    expect(quotationAiAcceptanceBlockReason(mapped, { ...state, dirty: true }))
      .toContain('guarda los cambios');
    expect(quotationAiAcceptanceBlockReason(mapped, { ...state, isLatest: false }))
      .toBeNull();
    expect(quotationAiAcceptanceBlockReason({ ...mapped, totalHours: 39 }, state))
      .toContain('concilia las HH comerciales');
    const addedTask = {
      ...mapped, totalHours: 52,
      draft: { ...mapped.draft, edtCommercialTasks: [{
        wbs: 'KT-0777e456-fd76-445e-83f1-afc25061c105',
        stageCode: 'module:Arquitectura', name: 'Cierre',
        teamId, hours: 12, fixed: false,
      }] },
    } as QuotationVersion;
    expect(quotationAiAcceptanceBlockReason(addedTask, state)).toBeNull();
  });
});
