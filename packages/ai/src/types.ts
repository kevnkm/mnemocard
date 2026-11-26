import type { FieldConfig, MnemonicPayload } from '@mnemocard/core';

export const HybridInferenceMode = {
  ONLY_ON_DEVICE: 'only_on_device',
  PREFER_ON_DEVICE: 'prefer_on_device',
  PREFER_IN_CLOUD: 'prefer_in_cloud',
  ONLY_IN_CLOUD: 'only_in_cloud',
} as const;
export type HybridInferenceMode =
  (typeof HybridInferenceMode)[keyof typeof HybridInferenceMode];

export const HybridInferenceSource = {
  ON_DEVICE: 'on_device',
  IN_CLOUD: 'in_cloud',
} as const;
export type HybridInferenceSource =
  (typeof HybridInferenceSource)[keyof typeof HybridInferenceSource];

export type ThinkingLevelOption = 'minimal' | 'low' | 'medium' | 'high';

export interface GenerateStreamHandlers {
  onThought?: (thoughtSummary: string, delta: string) => void;
  onResponseChunk?: (finalResponse: string, delta: string) => void;
  thinkingLevel?: ThinkingLevelOption;
}

export interface HybridTelemetry {
  inferenceSource: HybridInferenceSource;
  inferenceMode: HybridInferenceMode;
  latencyMs: number;
  runtimeLabel: string;
  appCheckEnabled: boolean;
  thoughtsTokenCount?: number;
  outputTokenCount?: number;
}

export interface HybridResult<T> {
  data: T;
  telemetry: HybridTelemetry;
}

export interface GenerateDeckInput {
  topicOrNotes: string;
  cardCount: number;
  language?: string;
  category?: string;
  subject?: string;
  interests?: string[];
  fieldConfigs?: FieldConfig[];
}

export interface GeneratedCardDraft {
  content: string[];
  mnemonic?: MnemonicPayload;
}

export interface GeneratedDeckOutput {
  title: string;
  description: string;
  category: string;
  subject: string;
  cards: GeneratedCardDraft[];
}

export interface EvaluateRecallInput {
  term: string;
  expectedDefinition: string;
  userAnswer: string;
  language?: string;
}

export interface EvaluateRecallOutput {
  score: number;
  isCorrect: boolean;
  feedback: string;
  memoryTip: string;
}

export interface FillCardInput {
  id: string;
  content: string[];
}

export interface FillDeckFieldsInput {
  fieldConfigs: FieldConfig[];
  cards: FillCardInput[];
  deckTitle?: string;
  deckDescription?: string;
  category?: string;
  interests?: string[];
}

export interface FilledCardOutput {
  id: string;
  content: string[];
}

export interface FillDeckFieldsOutput {
  cards: FilledCardOutput[];
}

export interface HybridAIClient {
  getMode(): HybridInferenceMode;
  setMode(mode: HybridInferenceMode): void;
  generateDeck(
    input: GenerateDeckInput,
    options?: GenerateStreamHandlers
  ): Promise<HybridResult<GeneratedDeckOutput>>;
  fillDeckFields(
    input: FillDeckFieldsInput,
    options?: GenerateStreamHandlers
  ): Promise<HybridResult<FillDeckFieldsOutput>>;
  evaluateRecall(
    input: EvaluateRecallInput,
    options?: GenerateStreamHandlers
  ): Promise<HybridResult<EvaluateRecallOutput>>;
}
