import { describe, expect, it } from 'vitest';
import { nextForwardTicketStatus } from './ticket.contract';

describe('nextForwardTicketStatus', () => {
  it('un incidente salta "En Pruebas" — igual que nextStageIncidente en la v1', () => {
    expect(nextForwardTicketStatus('pending', 'incident')).toBe('in_progress');
    expect(nextForwardTicketStatus('in_progress', 'incident')).toBe('done');
    expect(nextForwardTicketStatus('done', 'incident')).toBe('closed');
  });

  it('sin serviceType sigue el mismo camino que un incidente', () => {
    expect(nextForwardTicketStatus('in_progress', null)).toBe('done');
  });

  it('una mejora sí pasa por "En Pruebas" — igual que nextStageMejora en la v1', () => {
    expect(nextForwardTicketStatus('pending', 'improvement')).toBe('in_progress');
    expect(nextForwardTicketStatus('in_progress', 'improvement')).toBe('in_testing');
    expect(nextForwardTicketStatus('in_testing', 'improvement')).toBe('done');
    expect(nextForwardTicketStatus('done', 'improvement')).toBe('closed');
  });

  it('closed es terminal, no tiene siguiente paso', () => {
    expect(nextForwardTicketStatus('closed', 'incident')).toBeNull();
    expect(nextForwardTicketStatus('closed', 'improvement')).toBeNull();
  });
});
