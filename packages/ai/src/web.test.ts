import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';

const { mockGenerateContentStream, mockGetGenerativeModel } = vi.hoisted(() => ({
  mockGenerateContentStream: vi.fn(),
  mockGetGenerativeModel: vi.fn(),
}));

vi.mock('firebase/ai', () => ({
  getAI: vi.fn(() => ({})),
  getGenerativeModel: mockGetGenerativeModel,
  GoogleAIBackend: vi.fn(),
  InferenceMode: {
    ONLY_ON_DEVICE: 'only_on_device',
    PREFER_ON_DEVICE: 'prefer_on_device',
    PREFER_IN_CLOUD: 'prefer_in_cloud',
    ONLY_IN_CLOUD: 'only_in_cloud',
  },
  InferenceSource: {
    ON_DEVICE: 'on_device',
    IN_CLOUD: 'in_cloud',
  },
  Schema: {
    object: vi.fn((def) => def),
    string: vi.fn(() => ({ type: 'string' })),
    number: vi.fn(() => ({ type: 'number' })),
    boolean: vi.fn(() => ({ type: 'boolean' })),
    array: vi.fn((def) => ({ type: 'array', ...def })),
  },
  ThinkingLevel: {
    MINIMAL: 'MINIMAL',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
}));

import { HybridInferenceMode } from './types';
import { createWebHybridAIClient } from './web';

function createFakeStream(chunks: unknown[], aggregated: unknown) {
  return {
    stream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
    response: Promise.resolve(aggregated),
  };
}

describe('createWebHybridAIClient thought streaming', () => {
  const fakeApp = {} as FirebaseApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue({
      generateContentStream: mockGenerateContentStream,
    });
  });

  it('configures thinkingConfig with includeThoughts=true and default thinkingLevel=MEDIUM', async () => {
    const jsonPayload = JSON.stringify({
      title: 'Biology',
      description: 'Cell basics',
      category: 'science',
      subject: 'biology',
      cards: [{ content: ['ATP', 'Cellular energy currency'] }],
    });

    mockGenerateContentStream.mockResolvedValue(
      createFakeStream(
        [
          {
            candidates: [{ content: { parts: [{ thought: true, text: 'Planning biology cards...' }] } }],
          },
          {
            candidates: [{ content: { parts: [{ text: jsonPayload }] } }],
          },
        ],
        {
          text: () => jsonPayload,
          inferenceSource: 'in_cloud',
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 40,
            thoughtsTokenCount: 25,
            totalTokenCount: 115,
          },
        }
      )
    );

    const client = createWebHybridAIClient({
      firebaseApp: fakeApp,
      initialMode: HybridInferenceMode.ONLY_IN_CLOUD,
    });

    const thoughts: string[] = [];
    const responses: string[] = [];
    const result = await client.generateDeck(
      { topicOrNotes: 'Biology', cardCount: 1 },
      {
        onThought: (summary) => thoughts.push(summary),
        onResponseChunk: (text) => responses.push(text),
      }
    );

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inCloudParams: expect.objectContaining({
          generationConfig: expect.objectContaining({
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: 'MEDIUM',
            },
          }),
        }),
      })
    );

    expect(thoughts).toEqual(['Planning biology cards...']);
    expect(responses).toEqual([jsonPayload]);
    expect(result.data.title).toBe('Biology');
    expect(result.data.cards).toHaveLength(1);
    expect(result.telemetry.thoughtsTokenCount).toBe(25);
    expect(result.telemetry.outputTokenCount).toBe(40);
  });

  it('separates interleaved thought and response parts and supports custom thinkingLevel', async () => {
    const part1 = '{"title":"Spanish","description":"Verbs",';
    const part2 = '"cards":[{"content":["hablar","to speak"]}]}';

    mockGenerateContentStream.mockResolvedValue(
      createFakeStream(
        [
          {
            candidates: [{ content: { parts: [{ thought: true, text: 'Step 1. ' }] } }],
          },
          {
            candidates: [{ content: { parts: [{ thought: true, text: 'Step 2.' }] } }],
          },
          {
            candidates: [{ content: { parts: [{ text: part1 }] } }],
          },
          {
            candidates: [{ content: { parts: [{ text: part2 }] } }],
          },
        ],
        {
          text: () => part1 + part2,
          inferenceSource: 'in_cloud',
        }
      )
    );

    const client = createWebHybridAIClient({
      firebaseApp: fakeApp,
      initialMode: HybridInferenceMode.ONLY_IN_CLOUD,
    });

    const thoughtUpdates: string[] = [];
    const responseUpdates: string[] = [];

    const result = await client.generateDeck(
      { topicOrNotes: 'Spanish verbs', cardCount: 1 },
      {
        thinkingLevel: 'high',
        onThought: (summary) => thoughtUpdates.push(summary),
        onResponseChunk: (text) => responseUpdates.push(text),
      }
    );

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inCloudParams: expect.objectContaining({
          generationConfig: expect.objectContaining({
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: 'HIGH',
            },
          }),
        }),
      })
    );
    expect(thoughtUpdates).toEqual(['Step 1. ', 'Step 1. Step 2.']);
    expect(responseUpdates).toEqual([part1, part1 + part2]);
    expect(result.data.title).toBe('Spanish');
  });

  it('handles streams with no thought parts gracefully', async () => {
    const jsonPayload = JSON.stringify({
      title: 'Math',
      description: 'Algebra',
      cards: [{ content: ['x + 1 = 2', 'x = 1'] }],
    });

    mockGenerateContentStream.mockResolvedValue(
      createFakeStream(
        [
          {
            candidates: [{ content: { parts: [{ text: jsonPayload }] } }],
          },
        ],
        {
          text: () => jsonPayload,
          inferenceSource: 'on_device',
        }
      )
    );

    const client = createWebHybridAIClient({
      firebaseApp: fakeApp,
      initialMode: HybridInferenceMode.ONLY_ON_DEVICE,
    });

    const onThought = vi.fn();
    const result = await client.generateDeck(
      { topicOrNotes: 'Math', cardCount: 1 },
      { thinkingLevel: 'minimal', onThought }
    );

    expect(onThought).not.toHaveBeenCalled();
    expect(result.data.title).toBe('Math');
  });

  it('reads a cloudModel function on every request', async () => {
    const jsonPayload = JSON.stringify({
      title: 'Math',
      description: 'Algebra',
      cards: [{ content: ['x + 1 = 2', 'x = 1'] }],
    });
    mockGenerateContentStream.mockImplementation(async () =>
      createFakeStream([], { text: () => jsonPayload, inferenceSource: 'in_cloud' })
    );

    let model = 'model-a';
    const client = createWebHybridAIClient({
      firebaseApp: fakeApp,
      initialMode: HybridInferenceMode.PREFER_ON_DEVICE,
      cloudModel: () => model,
    });

    const first = await client.generateDeck({ topicOrNotes: 'Math', cardCount: 1 });
    model = 'model-b';
    const second = await client.generateDeck({ topicOrNotes: 'Math', cardCount: 1 });

    expect(mockGetGenerativeModel.mock.calls.map((call) => call[1].inCloudParams.model)).toEqual([
      'model-a',
      'model-b',
    ]);
    expect(first.telemetry.runtimeLabel).toContain('model-a');
    expect(second.telemetry.runtimeLabel).toContain('model-b');
  });

  describe('output languages', () => {
    const deckJson = JSON.stringify({ title: 'T', description: 'D', cards: [{ content: ['a', 'b'] }] });
    const field = (label: string, lang: string) => ({
      label,
      type: 'text' as const,
      lang,
      role: 'none' as const,
    });

    beforeEach(() => {
      mockGenerateContentStream.mockImplementation(async () =>
        createFakeStream([], { text: () => deckJson, inferenceSource: 'in_cloud' })
      );
    });

    async function paramsForDeck(mode: HybridInferenceMode, langs: string[]) {
      const client = createWebHybridAIClient({ firebaseApp: fakeApp, initialMode: mode });
      await client.generateDeck({
        topicOrNotes: 'Travel',
        cardCount: 1,
        fieldConfigs: langs.map((lang) => field('definition', lang)),
      });
      return mockGetGenerativeModel.mock.lastCall![1];
    }

    const declared = (languages: string[]) => ({
      createOptions: { expectedOutputs: [{ type: 'text', languages }] },
    });

    it('declares every supported language and keeps the selected mode', async () => {
      const params = await paramsForDeck(HybridInferenceMode.PREFER_ON_DEVICE, ['fr', 'ja']);
      expect(params.mode).toBe('prefer_on_device');
      expect(params.onDeviceParams).toMatchObject(declared(['en', 'fr', 'ja']));
    });

    it.each([HybridInferenceMode.PREFER_ON_DEVICE, HybridInferenceMode.PREFER_IN_CLOUD])(
      'uses only the cloud for an unsupported language in %s',
      async (mode) => {
        const params = await paramsForDeck(mode, ['en', 'ko']);
        expect(params.mode).toBe('only_in_cloud');
      }
    );

    it('never leaves the device in ONLY_ON_DEVICE', async () => {
      const params = await paramsForDeck(HybridInferenceMode.ONLY_ON_DEVICE, ['ko', 'zh-Hant']);
      expect(params.mode).toBe('only_on_device');
      expect(params.onDeviceParams).toMatchObject(declared(['en']));
    });

    it('does not change the selected mode for later requests', async () => {
      const client = createWebHybridAIClient({
        firebaseApp: fakeApp,
        initialMode: HybridInferenceMode.PREFER_ON_DEVICE,
      });
      const input = { topicOrNotes: 'Travel', cardCount: 1 };
      const korean = await client.generateDeck({ ...input, language: 'Korean' });
      await client.generateDeck(input);

      expect(mockGetGenerativeModel.mock.calls.map((call) => call[1].mode)).toEqual([
        'only_in_cloud',
        'prefer_on_device',
      ]);
      expect(korean.telemetry.inferenceMode).toBe('prefer_on_device');
      expect(client.getMode()).toBe('prefer_on_device');
    });

    it('checks the field languages when filling cards', async () => {
      const client = createWebHybridAIClient({
        firebaseApp: fakeApp,
        initialMode: HybridInferenceMode.PREFER_ON_DEVICE,
      });
      await client.fillDeckFields({
        fieldConfigs: [field('term', 'es'), field('latex', 'ko'), field('pinyin', 'en')],
        cards: [{ id: '1', content: ['hola', '', ''] }],
      });
      // LaTeX has no language, and pinyin is always Chinese.
      expect(mockGetGenerativeModel.mock.lastCall![1].mode).toBe('only_in_cloud');
    });

    it.each([
      ['fr', 'prefer_on_device'],
      ['ko', 'only_in_cloud'],
    ])('grades recall in %s with mode %s', async (language, expected) => {
      const client = createWebHybridAIClient({
        firebaseApp: fakeApp,
        initialMode: HybridInferenceMode.PREFER_ON_DEVICE,
      });
      await client.evaluateRecall({ term: 't', expectedDefinition: 'd', userAnswer: 'a', language });
      expect(mockGetGenerativeModel.mock.lastCall![1].mode).toBe(expected);
    });
  });
});
