import type { FirebaseApp } from 'firebase/app';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  ThinkingLevel,
  type GenerativeModel,
} from 'firebase/ai';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import {
  buildEvaluateRecallPrompt,
  buildFillFieldsPrompt,
  buildGenerateDeckPrompt,
  extractJsonObject,
  normalizeFilledCards,
  normalizeGeneratedDeck,
  normalizeRecallOutput,
} from './prompts';
import { fieldOutputLangs, planInference, toLangCode, type InferencePlan } from './output-languages';
import {
  HybridInferenceMode,
  HybridInferenceSource,
  type EvaluateRecallInput,
  type EvaluateRecallOutput,
  type FillDeckFieldsInput,
  type FillDeckFieldsOutput,
  type GenerateDeckInput,
  type GeneratedDeckOutput,
  type GenerateStreamHandlers,
  type HybridAIClient,
  type HybridResult,
  type HybridTelemetry,
  type ThinkingLevelOption,
} from './types';

export interface WebHybridAIConfig {
  firebaseApp: FirebaseApp;
  /** A function is read on every request, so the model can change at runtime. */
  cloudModel?: string | (() => string);
  initialMode?: HybridInferenceMode;
  thinkingLevel?: ThinkingLevelOption;
  reCaptchaEnterpriseSiteKey?: string;
  appCheckDebugToken?: string | boolean;
}

const DECK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    subject: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['content'],
      },
    },
  },
  required: ['title', 'description', 'cards'],
} as const;

const DECK_FIREBASE_SCHEMA = Schema.object({
  properties: {
    title: Schema.string(),
    description: Schema.string(),
    category: Schema.string(),
    subject: Schema.string(),
    cards: Schema.array({
      items: Schema.object({
        properties: {
          content: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
  optionalProperties: ['category', 'subject'],
});

const RECALL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    isCorrect: { type: 'boolean' },
    feedback: { type: 'string' },
    memoryTip: { type: 'string' },
  },
  required: ['score', 'isCorrect', 'feedback', 'memoryTip'],
} as const;

const RECALL_FIREBASE_SCHEMA = Schema.object({
  properties: {
    score: Schema.number(),
    isCorrect: Schema.boolean(),
    feedback: Schema.string(),
    memoryTip: Schema.string(),
  },
});

const FILL_DECK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['id', 'content'],
      },
    },
  },
  required: ['cards'],
} as const;

const FILL_DECK_FIREBASE_SCHEMA = Schema.object({
  properties: {
    cards: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          content: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
});

function toSdkInferenceMode(mode: HybridInferenceMode): InferenceMode {
  switch (mode) {
    case HybridInferenceMode.ONLY_ON_DEVICE:
      return InferenceMode.ONLY_ON_DEVICE;
    case HybridInferenceMode.PREFER_IN_CLOUD:
      return InferenceMode.PREFER_IN_CLOUD;
    case HybridInferenceMode.ONLY_IN_CLOUD:
      return InferenceMode.ONLY_IN_CLOUD;
    case HybridInferenceMode.PREFER_ON_DEVICE:
    default:
      return InferenceMode.PREFER_ON_DEVICE;
  }
}

function toSdkThinkingLevel(level: ThinkingLevelOption): ThinkingLevel {
  switch (level) {
    case 'minimal':
      return ThinkingLevel.MINIMAL;
    case 'low':
      return ThinkingLevel.LOW;
    case 'high':
      return ThinkingLevel.HIGH;
    case 'medium':
    default:
      return ThinkingLevel.MEDIUM;
  }
}

function mapSource(source?: InferenceSource): HybridInferenceSource {
  return source === InferenceSource.ON_DEVICE
    ? HybridInferenceSource.ON_DEVICE
    : HybridInferenceSource.IN_CLOUD;
}

export function createWebHybridAIClient(config: WebHybridAIConfig): HybridAIClient {
  let currentMode: HybridInferenceMode =
    config.initialMode ?? HybridInferenceMode.ONLY_ON_DEVICE;
  const resolveCloudModel = (): string =>
    (typeof config.cloudModel === 'function' ? config.cloudModel() : config.cloudModel) ??
    'gemini-3-flash-preview';
  const defaultThinkingLevel: ThinkingLevelOption = config.thinkingLevel ?? 'medium';
  let appCheckInstance: AppCheck | null = null;

  if (typeof window !== 'undefined' && (config.reCaptchaEnterpriseSiteKey || config.appCheckDebugToken)) {
    if (config.appCheckDebugToken) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        config.appCheckDebugToken;
    }
    if (config.reCaptchaEnterpriseSiteKey) {
      appCheckInstance = initializeAppCheck(config.firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(config.reCaptchaEnterpriseSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }

  const ai = getAI(config.firebaseApp, { backend: new GoogleAIBackend() });

  function getModel(
    plan: InferencePlan,
    responseConstraint?: object,
    responseSchema?: ReturnType<typeof Schema.object>,
    thinkingLevel: ThinkingLevelOption = defaultThinkingLevel,
    cloudModelName: string = resolveCloudModel()
  ): GenerativeModel {
    return getGenerativeModel(ai, {
      mode: toSdkInferenceMode(plan.mode),
      onDeviceParams: {
        createOptions: { expectedOutputs: [{ type: 'text', languages: plan.onDeviceLangs }] },
        ...(responseConstraint ? { promptOptions: { responseConstraint } } : {}),
      },
      inCloudParams: {
        model: cloudModelName,
        generationConfig: {
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: toSdkThinkingLevel(thinkingLevel),
          },
        },
      },
    });
  }

  async function runStructuredPrompt<T>(
    prompt: string,
    outputLangs: readonly string[],
    responseConstraint?: object,
    responseSchema?: ReturnType<typeof Schema.object>,
    options?: GenerateStreamHandlers
  ): Promise<{ parsed: T; telemetry: HybridTelemetry }> {
    const startedAt = performance.now();
    const cloudModelName = resolveCloudModel();
    const model = getModel(
      planInference(currentMode, outputLangs),
      responseConstraint,
      responseSchema,
      options?.thinkingLevel,
      cloudModelName
    );
    const streamResult = await model.generateContentStream(prompt);

    let thoughtSummary = '';
    let finalResponse = '';

    for await (const chunk of streamResult.stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const text = 'text' in part && typeof part.text === 'string' ? part.text : '';
        if (!text) continue;
        if ('thought' in part && part.thought === true) {
          thoughtSummary += text;
          options?.onThought?.(thoughtSummary, text);
        } else {
          finalResponse += text;
          options?.onResponseChunk?.(finalResponse, text);
        }
      }
    }

    const aggregatedResponse = await streamResult.response;
    const rawText = finalResponse || aggregatedResponse.text();
    const source = mapSource(aggregatedResponse.inferenceSource);
    const usage = aggregatedResponse.usageMetadata;
    const thoughtsTokenCount = usage?.thoughtsTokenCount;
    const outputTokenCount = usage?.candidatesTokenCount;

    return {
      parsed: extractJsonObject<T>(rawText),
      telemetry: {
        inferenceSource: source,
        inferenceMode: currentMode,
        latencyMs: Math.round(performance.now() - startedAt),
        runtimeLabel:
          source === HybridInferenceSource.ON_DEVICE
            ? 'Chrome Gemini Nano (On-Device)'
            : `Firebase AI Logic (${cloudModelName})`,
        appCheckEnabled: Boolean(appCheckInstance),
        thoughtsTokenCount,
        outputTokenCount,
      },
    };
  }

  return {
    getMode: () => currentMode,
    setMode: (mode) => {
      currentMode = mode;
    },

    async generateDeck(
      input: GenerateDeckInput,
      options?: GenerateStreamHandlers
    ): Promise<HybridResult<GeneratedDeckOutput>> {
      const prompt = buildGenerateDeckPrompt(input);
      const { parsed, telemetry } = await runStructuredPrompt<Partial<GeneratedDeckOutput>>(
        prompt,
        // The title and description use `language`, and each field has its own.
        [toLangCode(input.language), ...fieldOutputLangs(input.fieldConfigs ?? [])],
        DECK_JSON_SCHEMA,
        DECK_FIREBASE_SCHEMA,
        options
      );
      return {
        data: normalizeGeneratedDeck(parsed, input),
        telemetry,
      };
    },

    async fillDeckFields(
      input: FillDeckFieldsInput,
      options?: GenerateStreamHandlers
    ): Promise<HybridResult<FillDeckFieldsOutput>> {
      const prompt = buildFillFieldsPrompt(input);
      const { parsed, telemetry } = await runStructuredPrompt<Partial<FillDeckFieldsOutput>>(
        prompt,
        // The reply repeats the filled cells too, so every field's language is output.
        fieldOutputLangs(input.fieldConfigs),
        FILL_DECK_JSON_SCHEMA,
        FILL_DECK_FIREBASE_SCHEMA,
        { thinkingLevel: 'low', ...options }
      );
      return {
        data: normalizeFilledCards(parsed, input),
        telemetry,
      };
    },

    async evaluateRecall(
      input: EvaluateRecallInput,
      options?: GenerateStreamHandlers
    ): Promise<HybridResult<EvaluateRecallOutput>> {
      const prompt = buildEvaluateRecallPrompt(input);
      const { parsed, telemetry } = await runStructuredPrompt<Partial<EvaluateRecallOutput>>(
        prompt,
        [toLangCode(input.language)],
        RECALL_JSON_SCHEMA,
        RECALL_FIREBASE_SCHEMA,
        options
      );
      return {
        data: normalizeRecallOutput(parsed),
        telemetry,
      };
    },
  };
}
