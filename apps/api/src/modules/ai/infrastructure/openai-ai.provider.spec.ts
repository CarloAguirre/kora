import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../../config/app-config.service';
import { OpenAiProvider } from './openai-ai.provider';

const provider = new OpenAiProvider({
  ai: { openaiApiKey: 'sk-test-only', openaiModel: 'gpt-6.1-sol' },
} as AppConfigService);
const request = {
  task: 'estimation.poc.reference-edt',
  context: { projectName: 'Portal de mantenciones' },
  instructions: 'Devuelve una estructura JSON basada en documentos.',
  responseJsonSchema: {
    type: 'OBJECT',
    properties: {
      totalHours: { type: 'NUMBER' },
      modules: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['totalHours', 'modules'],
  },
};
const result = {
  status: 'completed',
  output: [{ type: 'message', content: [
    { type: 'output_text', text: '{"totalHours":80,"modules":["Portal"]}' },
  ] }],
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('OpenAiProvider · estimaciones GPT-6 Responses', () => {
  it('envía solicitud JSON estructurada con esquema traducido, sin persistencia', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', mock);
    expect(await provider.generateStructured({
      ...request,
      documents: [{ name: 'Matriz.xlsx', mimeType: 'text/plain',
        text: 'HOJA Requisitos · B2=Validación del supervisor' }],
    })).toEqual({ totalHours: 80, modules: ['Portal'] });
    const [url, options] = mock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options.headers.Authorization).toBe('Bearer sk-test-only');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-6.1-sol');
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.schema.type).toBe('object');
    expect(body.text.format.schema.properties.modules.items.type).toBe('string');
    expect(JSON.stringify(body)).toContain('B2=Validación del supervisor');
  });

  it('admite PDF binario como input_file de Responses sin convertirlo a texto falso', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', mock);
    await provider.generateStructured({
      ...request,
      documents: [{ name: 'ERS.pdf', mimeType: 'application/pdf', dataBase64: 'cGRm' }],
    });
    const body = JSON.parse(mock.mock.calls[0]![1].body);
    expect(body.input[0].content).toContainEqual({
      type: 'input_file', filename: 'ERS.pdf',
      file_data: 'data:application/pdf;base64,cGRm',
    });
  });

  it('envía solo resúmenes autorizados y devuelve JSON tras response.completed', async () => {
    const frames = [
      { type: 'response.reasoning_summary_text.delta', delta: 'Analizando alcance.' },
      { type: 'response.output_text.delta', delta: '{"totalHours":80,' },
      { type: 'response.output_text.delta', delta: '"modules":["Portal"]}' },
      { type: 'response.completed', response: { status: 'completed' } },
    ];
    const sse = frames.map((frame) => 'data: ' + JSON.stringify(frame) + '\n\n').join('');
    const mock = vi.fn().mockResolvedValue(new Response(sse, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', mock);
    const onSummary = vi.fn();
    expect(await provider.generateStructured(request, onSummary)).toEqual({
      totalHours: 80, modules: ['Portal'],
    });
    expect(onSummary).toHaveBeenCalledWith('Analizando alcance.');
    const body = JSON.parse(mock.mock.calls[0]![1].body);
    expect(body.stream).toBe(true);
    expect(body.reasoning.summary).toBe('auto');
  });

  it('rechaza salida incompleta sin convertirla en cotización válida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
      { status: 200 })));
    await expect(provider.generateStructured(request)).rejects.toThrow(/no completó/);
  });

  it('429 no reintenta y 503 previo al stream tiene un solo reintento', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'insufficient_quota' } }), { status: 429 }));
    vi.stubGlobal('fetch', mock);
    await expect(provider.generateStructured(request)).rejects.toThrow(/HTTP 429/);
    expect(mock).toHaveBeenCalledTimes(1);
    const temporary = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', temporary);
    expect(await provider.generateStructured(request)).toEqual({
      totalHours: 80, modules: ['Portal'],
    });
    expect(temporary).toHaveBeenCalledTimes(2);
  });
});
