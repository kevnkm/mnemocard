import { Rating } from './srs';

export type TestQuestionType =
  | 'multiple_choice'
  | 'written'
  | 'true_false'
  | 'matching';

export interface TestCard {
  id: string;
  prompt: string;
  answer: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: 'multiple_choice';
  cardId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface WrittenQuestion {
  id: string;
  type: 'written';
  cardId: string;
  prompt: string;
  answer: string;
}

export interface TrueFalseQuestion {
  id: string;
  type: 'true_false';
  cardId: string;
  prompt: string;
  proposedAnswer: string;
  isMatch: boolean;
}

export interface MatchingPair {
  cardId: string;
  text: string;
}

export interface MatchingQuestion {
  id: string;
  type: 'matching';
  cardIds: string[];
  prompts: MatchingPair[];
  answers: MatchingPair[];
}

export type TestQuestion =
  | MultipleChoiceQuestion
  | WrittenQuestion
  | TrueFalseQuestion
  | MatchingQuestion;

export interface TestOptions {
  questionCount: number;
  types: TestQuestionType[];
  matchingGroupSize?: number;
  optionCount?: number;
  rng?: () => number;
}

export type AnswerResponse =
  | { type: 'multiple_choice'; selectedIndex: number | null }
  | { type: 'written'; text: string }
  | { type: 'true_false'; saysMatch: boolean | null }
  | { type: 'matching'; assignment: Record<string, string> };

export interface CardOutcome {
  cardId: string;
  correct: boolean;
}

export interface GradedQuestion {
  questionId: string;
  correct: boolean;
  cardOutcomes: CardOutcome[];
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

const ARTICLES = new Set(['a', 'an', 'the']);

export function normalizeAnswer(input: string): string {
  const stripped = (input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped.split(' ').filter(Boolean);
  while (words.length > 1 && words[0] && ARTICLES.has(words[0])) {
    words.shift();
  }
  return words.join(' ');
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) d[i]![0] = i;
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = val;
    }
  }
  return d[a.length]![b.length]!;
}

export function isWrittenAnswerCorrect(input: string, expected: string): boolean {
  const guess = normalizeAnswer(input);
  if (!guess) return false;

  const accepted = expected
    .split(/[/,;]/)
    .map((s) => normalizeAnswer(s))
    .filter(Boolean);

  return accepted.some((target) => {
    if (guess === target) return true;
    const budget = Math.min(3, Math.max(1, Math.floor(target.length * 0.15)));
    return editDistance(guess, target) <= budget;
  });
}

export function toTestCards(
  cards: Array<{ id: string; content: (string | null)[] }>,
  fieldConfigs?: Array<{ type?: string }>
): TestCard[] {
  const textIndices: number[] = [];
  if (fieldConfigs?.length) {
    fieldConfigs.forEach((f, i) => {
      if (f?.type !== 'image' && f?.type !== 'audio') textIndices.push(i);
    });
  }
  const promptIdx = textIndices[0] ?? 0;
  const answerIdx = textIndices[1] ?? 1;

  return cards
    .map((c) => ({
      id: c.id,
      prompt: (c.content?.[promptIdx] ?? '').toString().trim(),
      answer: (c.content?.[answerIdx] ?? '').toString().trim(),
    }))
    .filter((c) => c.prompt.length > 0 && c.answer.length > 0);
}

export function generateTest(cards: TestCard[], options: TestOptions): TestQuestion[] {
  const rng = options.rng ?? Math.random;
  const groupSize = options.matchingGroupSize ?? 5;
  const optionCount = options.optionCount ?? 4;

  const valid = cards.filter((c) => c.prompt && c.answer);
  const types = options.types.filter((t) => {
    if (t === 'matching') return valid.length >= Math.max(2, groupSize);
    if (t === 'multiple_choice') return valid.length >= 2;
    return valid.length >= 1;
  });

  if (!valid.length || !types.length) return [];

  const count = Math.max(1, options.questionCount);
  const questions: TestQuestion[] = [];
  let deck = shuffle(valid, rng);

  const drawCard = (): TestCard => {
    if (!deck.length) deck = shuffle(valid, rng);
    return deck.pop() as TestCard;
  };

  let typeIdx = 0;
  let guard = 0;
  while (questions.length < count && guard < count * 8) {
    guard++;
    const type = types[typeIdx % types.length]!;
    typeIdx++;

    if (type === 'matching') {
      const group = shuffle(valid, rng).slice(0, groupSize);
      if (group.length >= 2) {
        questions.push({
          id: nextId('q'),
          type: 'matching',
          cardIds: group.map((c) => c.id),
          prompts: shuffle(group.map((c) => ({ cardId: c.id, text: c.prompt })), rng),
          answers: shuffle(group.map((c) => ({ cardId: c.id, text: c.answer })), rng),
        });
      }
      continue;
    }

    const card = drawCard();
    if (type === 'multiple_choice') {
      const distractors = shuffle(
        valid.filter(
          (c) => c.id !== card.id && normalizeAnswer(c.answer) !== normalizeAnswer(card.answer)
        ),
        rng
      )
        .slice(0, Math.max(0, optionCount - 1))
        .map((c) => c.answer);
      const opts = shuffle([card.answer, ...distractors], rng);
      questions.push({
        id: nextId('q'),
        type: 'multiple_choice',
        cardId: card.id,
        prompt: card.prompt,
        options: opts,
        correctIndex: opts.indexOf(card.answer),
      });
    } else if (type === 'written') {
      questions.push({
        id: nextId('q'),
        type: 'written',
        cardId: card.id,
        prompt: card.prompt,
        answer: card.answer,
      });
    } else {
      const showReal = rng() < 0.5;
      let proposedAnswer = card.answer;
      let isMatch = true;
      if (!showReal) {
        const decoys = valid.filter(
          (c) => c.id !== card.id && normalizeAnswer(c.answer) !== normalizeAnswer(card.answer)
        );
        const decoy = decoys[Math.floor(rng() * decoys.length)];
        if (decoy) {
          proposedAnswer = decoy.answer;
          isMatch = false;
        }
      }
      questions.push({
        id: nextId('q'),
        type: 'true_false',
        cardId: card.id,
        prompt: card.prompt,
        proposedAnswer,
        isMatch,
      });
    }
  }

  return questions;
}

export function gradeQuestion(question: TestQuestion, response: AnswerResponse): GradedQuestion {
  switch (question.type) {
    case 'multiple_choice': {
      const correct =
        response.type === 'multiple_choice' && response.selectedIndex === question.correctIndex;
      return {
        questionId: question.id,
        correct,
        cardOutcomes: [{ cardId: question.cardId, correct }],
      };
    }
    case 'written': {
      const correct =
        response.type === 'written' && isWrittenAnswerCorrect(response.text, question.answer);
      return {
        questionId: question.id,
        correct,
        cardOutcomes: [{ cardId: question.cardId, correct }],
      };
    }
    case 'true_false': {
      const correct = response.type === 'true_false' && response.saysMatch === question.isMatch;
      return {
        questionId: question.id,
        correct,
        cardOutcomes: [{ cardId: question.cardId, correct }],
      };
    }
    case 'matching': {
      const assignment = response.type === 'matching' ? response.assignment : {};
      const cardOutcomes = question.cardIds.map((cardId) => ({
        cardId,
        correct: assignment[cardId] === cardId,
      }));
      return {
        questionId: question.id,
        correct: cardOutcomes.every((o) => o.correct),
        cardOutcomes,
      };
    }
  }
}

export function outcomeToRating(correct: boolean): Rating {
  return correct ? Rating.Good : Rating.Again;
}
