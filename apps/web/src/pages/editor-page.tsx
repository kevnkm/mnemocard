import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  disambiguateFieldNames,
  effectiveFieldLang,
  fieldLangOptions,
  fieldLanguage,
  fieldTypeForLabel,
  findFieldLanguageWarnings,
  isFieldLangConfigurable,
  isOwnedDeck,
  langForNewField,
  normalizeFieldLangs,
  relabelField,
  toFieldLabelId,
  DECK_THEME_COLORS,
  type FieldConfig,
  type MnemonicPayload,
  type StudyDeck,
} from '@mnemocard/core';

import { DeckAppearance } from '@/components/deck-appearance';
import { Footer } from '@/components/footer';
import { SortableItem } from '@/components/sortable-item';
import { SubjectDropdown } from '@/components/subject-dropdown';
import { FieldLabelDropdown } from '@/components/field-label-dropdown';
import { FieldLangPicker } from '@/components/field-lang-picker';
import { Navbar } from '@/components/navbar';
import { fieldLabel, useI18n } from '@/i18n';
import { getHybridAIClient, isFirebaseConfigured } from '@/lib/firebase';
import { saveWebDeck, signInWithGoogle, useWebStore } from '@/lib/local-store';

interface DraftCard {
  id: string;
  content: string[];
}

const DEFAULT_FIELDS: FieldConfig[] = [
  { label: 'term', type: 'text', lang: 'en', role: 'subject' },
  { label: 'definition', type: 'text', lang: 'en', role: 'target' },
];

const MNEMONIC_LABELS: ReadonlySet<string> = new Set(['mnemonics', 'story', 'acronym', 'analogy']);
const FILL_BATCH_SIZE = 5;

function cardNeedsFill(card: DraftCard, configs: readonly FieldConfig[]): boolean {
  let hasContent = false;
  let hasEmptyText = false;
  for (let i = 0; i < configs.length; i += 1) {
    if (configs[i]!.type !== 'text') continue;
    if ((card.content[i] ?? '').trim().length > 0) hasContent = true;
    else hasEmptyText = true;
  }
  return hasContent && hasEmptyText;
}

function formatMnemonicPayload(mnemonic?: MnemonicPayload): string {
  if (!mnemonic) return '';
  switch (mnemonic.kind) {
    case 'story':
      return mnemonic.text;
    case 'acronym':
      return `${mnemonic.word}: ${mnemonic.items.join(', ')}`;
    case 'analogy':
      return `${mnemonic.comparison} — ${mnemonic.explanation}`;
    case 'root':
      return `${mnemonic.root} (${mnemonic.origin}): ${mnemonic.meaning}`;
    case 'formula':
      return `${mnemonic.formula} — ${mnemonic.explanation}`;
  }
}

const AGENT_SPINNER_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽'] as const;

function AgentThinkingText({
  text,
  onPrimary = false,
}: {
  text: string;
  onPrimary?: boolean;
}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % AGENT_SPINNER_FRAMES.length);
    }, 140);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block w-3 text-center font-mono text-xs leading-none">
        {AGENT_SPINNER_FRAMES[frame]}
      </span>
      <span className={`ai-shimmer-text ${onPrimary ? 'ai-shimmer-text-on-primary' : ''}`}>
        {text}
      </span>
    </span>
  );
}

const newFieldId = () => `field-${Math.random().toString(36).slice(2, 8)}`;

function createEmptyCard(len: number): DraftCard {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: Array.from({ length: len }, () => ''),
  };
}

function EditorForm({ existingDeck }: { existingDeck?: StudyDeck }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { preferences } = useWebStore();

  const [title, setTitle] = useState(existingDeck?.title ?? '');
  const [description, setDescription] = useState(existingDeck?.description ?? '');
  const [category, setCategory] = useState(existingDeck?.category ?? 'other');
  const [subject, setSubject] = useState(existingDeck?.subject ?? '');
  const [icon, setIcon] = useState(existingDeck?.icon ?? '🧠');
  const [color, setColor] = useState(existingDeck?.color ?? DECK_THEME_COLORS[0]);
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>(
    existingDeck?.fieldConfigs?.length ? normalizeFieldLangs(existingDeck.fieldConfigs) : DEFAULT_FIELDS
  );
  const [fieldIds, setFieldIds] = useState<string[]>(() => fieldConfigs.map(newFieldId));
  const [genOpen, setGenOpen] = useState(false);
  const [cards, setCards] = useState<DraftCard[]>(
    existingDeck?.cards?.length
      ? existingDeck.cards.map((c) => ({ id: c.id, content: [...c.content] }))
      : [createEmptyCard(2), createEmptyCard(2)]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Hybrid AI generator state
  const [aiTopic, setAiTopic] = useState('');
  const [cardCount, setCardCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null);
  const [thoughtSummary, setThoughtSummary] = useState('');
  const [finalResponse, setFinalResponse] = useState('');
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const fillableCards = useMemo(
    () => cards.filter((c) => cardNeedsFill(c, fieldConfigs)),
    [cards, fieldConfigs]
  );
  const langWarnings = useMemo(() => findFieldLanguageWarnings(fieldConfigs), [fieldConfigs]);
  const anyAIBusy = aiBusy || fillProgress !== null;

  const handleGenerate = async () => {
    const topic = aiTopic.trim() || title.trim();
    if (!topic) {
      setAiError(t('editor.err_topic'));
      return;
    }

    setAiBusy(true);
    setAiError(null);
    setAiNotice(null);
    setThoughtSummary('');
    setFinalResponse('');
    setThoughtsExpanded(true);
    let responseStarted = false;
    try {
      const result = await getHybridAIClient().generateDeck(
        {
          topicOrNotes: topic,
          cardCount,
          category,
          interests: preferences.interests,
          fieldConfigs,
        },
        {
          onThought: (summary) => {
            setThoughtSummary(summary);
          },
          onResponseChunk: (responseText) => {
            if (!responseStarted) {
              responseStarted = true;
              setThoughtsExpanded(false);
            }
            setFinalResponse(responseText);
          },
        }
      );

      const draft = result.data;
      if (!title.trim() && draft.title) setTitle(draft.title);
      if (!description.trim() && draft.description) setDescription(draft.description);
      if (draft.category && draft.category !== category) {
        setCategory(draft.category);
        setSubject('');
      }

      // Fill the deck's own fields in order; an empty memory-aid field falls back to the card's mnemonic.
      setCards(
        draft.cards.map((c, idx) => {
          const mnemonic = formatMnemonicPayload(c.mnemonic);
          return {
            id: `draft-ai-${Date.now()}-${idx}`,
            content: fieldConfigs.map(
              (cfg, i) => c.content[i] || (MNEMONIC_LABELS.has(toFieldLabelId(cfg.label) ?? '') ? mnemonic : '')
            ),
          };
        })
      );

      setGenOpen(false);
      setAiNotice(t('editor.generated', { count: draft.cards.length }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('editor.err_generate'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleFillEmptyDeck = async () => {
    const targets = cards.filter((c) => cardNeedsFill(c, fieldConfigs));
    if (targets.length === 0) return;

    setAiError(null);
    setAiNotice(null);
    setFillProgress({ done: 0, total: targets.length });

    let totalFilledCells = 0;
    let totalFilledCards = 0;

    try {
      for (let offset = 0; offset < targets.length; offset += FILL_BATCH_SIZE) {
        const batch = targets.slice(offset, offset + FILL_BATCH_SIZE);
        const result = await getHybridAIClient().fillDeckFields({
          fieldConfigs,
          cards: batch.map((c) => ({ id: c.id, content: c.content })),
          deckTitle: title,
          deckDescription: description,
          category,
          interests: preferences.interests,
        });

        const filledById = new Map(result.data.cards.map((c) => [c.id, c.content]));
        for (const orig of batch) {
          const updated = filledById.get(orig.id);
          if (!updated) continue;
          let addedHere = 0;
          for (let i = 0; i < fieldConfigs.length; i += 1) {
            if (!(orig.content[i] ?? '').trim() && (updated[i] ?? '').trim()) {
              addedHere += 1;
            }
          }
          if (addedHere > 0) {
            totalFilledCells += addedHere;
            totalFilledCards += 1;
          }
        }

        setCards((prev) =>
          prev.map((c) => {
            const updated = filledById.get(c.id);
            return updated ? { ...c, content: updated } : c;
          })
        );
        setFillProgress({ done: Math.min(offset + batch.length, targets.length), total: targets.length });
      }

      setAiNotice(
        t('editor.filled_deck', { fields: totalFilledCells, cards: totalFilledCards })
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('editor.err_fill'));
    } finally {
      setFillProgress(null);
    }
  };

  const addField = () => {
    const label = 'other';
    setFieldConfigs((prev) => [...prev, { label, type: fieldTypeForLabel(label) ?? 'text', lang: langForNewField(prev), role: 'none' }]);
    setFieldIds((prev) => [...prev, newFieldId()]);
    setCards((prev) => prev.map((c) => ({ ...c, content: [...c.content, ''] })));
  };

  const removeField = (index: number) => {
    if (fieldConfigs.length <= 2) return;
    setFieldConfigs((prev) => prev.filter((_, i) => i !== index));
    setFieldIds((prev) => prev.filter((_, i) => i !== index));
    setCards((prev) =>
      prev.map((c) => ({ ...c, content: c.content.filter((_, i) => i !== index) }))
    );
  };

  const onFieldDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = fieldIds.indexOf(String(active.id));
    const to = fieldIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setFieldIds((prev) => arrayMove(prev, from, to));
    setFieldConfigs((prev) => arrayMove(prev, from, to));
    setCards((prev) => prev.map((c) => ({ ...c, content: arrayMove(c.content, from, to) })));
  };

  const onCardDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setCards((prev) => {
      const from = prev.findIndex((c) => c.id === active.id);
      const to = prev.findIndex((c) => c.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  // Repeated labels carry their language in placeholders ("definition (KO)").
  const fieldPlaceholderNames = disambiguateFieldNames(
    fieldConfigs.map((cfg) => fieldLabel(t, cfg.label).toLowerCase()),
    fieldConfigs
  );
  const gridCols = `1.5rem repeat(${fieldConfigs.length}, minmax(9rem, 1fr)) 1.5rem`;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setAiError(t('editor.err_title'));
      return;
    }
    const nonEmpty = cards.filter((c) => c.content.some((v) => v.trim().length > 0));
    if (nonEmpty.length === 0) {
      setAiError(t('editor.err_cards'));
      return;
    }

    const saved = saveWebDeck({
      id: existingDeck?.id,
      title: title.trim(),
      description: description.trim(),
      icon,
      color,
      category,
      subject,
      fieldConfigs,
      cards: nonEmpty,
    });
    void navigate(`/deck/${saved.id}`);
  };

  return (
    <form
      onSubmit={handleSave}
      className={`${
        fieldConfigs.length >= 5 ? 'max-w-6xl' : 'max-w-5xl'
      } w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6 transition-[max-width] duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{existingDeck ? t('editor.edit') : t('editor.new')}</h1>
        </div>

        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm cursor-pointer"
        >
          {existingDeck ? t('editor.update') : t('editor.save')}
        </button>
      </div>

      {/* Deck details */}
      <section className="flex items-start gap-4">
        <DeckAppearance icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />
        <div className="flex-1 min-w-0 space-y-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('editor.title_placeholder')}
            className="w-full text-2xl sm:text-3xl font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('editor.description_placeholder')}
            className="w-full text-sm bg-transparent outline-none text-muted-foreground placeholder:text-muted-foreground/40"
          />
          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <span>{t('editor.subject')}</span>
            <SubjectDropdown
              category={category}
              subject={subject}
              onChange={(c, s) => {
                setCategory(c);
                setSubject(s);
              }}
            />
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="space-y-3 pt-4 border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('editor.cards_heading', { count: cards.length })}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {(fillableCards.length > 0 || fillProgress !== null) && (
              <button
                type="button"
                disabled={anyAIBusy}
                onClick={() => void handleFillEmptyDeck()}
                className="h-8 px-3 rounded-md border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-muted cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {fillProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {t('editor.filling_progress', {
                        done: fillProgress.done,
                        total: fillProgress.total,
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{t('editor.fill_empty', { count: fillableCards.length })}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setGenOpen((o) => !o)}
              aria-expanded={genOpen}
              className="h-8 px-3 rounded-md border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-muted cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('editor.generate')}
            </button>
          </div>
        </div>

        {genOpen && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={t('editor.generate_placeholder')}
                className="sm:flex-1 h-9 px-3 rounded-md bg-card border border-border focus:border-foreground/30 outline-none text-sm"
              />
              <div
                role="group"
                aria-label={t('editor.count_label')}
                className="h-9 shrink-0 self-start sm:self-auto flex items-center gap-0.5 px-1 rounded-md border border-border"
              >
                {[3, 5, 8, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCardCount(n)}
                    aria-pressed={cardCount === n}
                    className={`h-7 min-w-8 px-2 rounded text-sm tabular-nums cursor-pointer transition-colors ${
                      cardCount === n
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="pl-1 pr-2 text-xs text-muted-foreground">{t('editor.count_unit')}</span>
              </div>
              <button
                type="button"
                disabled={anyAIBusy}
                onClick={() => void handleGenerate()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-90 disabled:cursor-wait"
              >
                {aiBusy ? (
                  <AgentThinkingText
                    text={finalResponse ? t('editor.generating_cards') : t('editor.thinking')}
                    onPrimary
                  />
                ) : (
                  <span>{t('editor.generate')}</span>
                )}
              </button>
            </div>

            {aiBusy && (
              <div className="rounded-md border border-border/70 bg-muted/30 text-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => setThoughtsExpanded((v) => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <span className="font-medium">
                    <AgentThinkingText
                      text={
                        finalResponse
                          ? t('editor.generating_cards')
                          : thoughtSummary
                            ? t('editor.thinking')
                            : t('editor.preparing_thoughts')
                      }
                    />
                  </span>
                  {thoughtSummary &&
                    (thoughtsExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    ))}
                </button>
                {thoughtsExpanded && thoughtSummary && (
                  <div className="px-3 pb-2.5 pt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-muted-foreground leading-relaxed border-t border-border/50">
                    {thoughtSummary}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {aiError && (
          <div className="text-xs font-semibold text-red-600 dark:text-red-400">{aiError}</div>
        )}

        {langWarnings.length > 0 && (
          <div className="space-y-1.5">
            {langWarnings.map((w) => (
              <div
                key={`${w.fieldIndex}-${w.currentLang}-${w.expectedLang}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300"
              >
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t('editor.lang_mismatch', {
                      field: fieldLabel(t, w.fieldLabel),
                      fieldLang: fieldLanguage(w.currentLang).name,
                      subject: fieldLabel(t, w.subjectLabel),
                      subjectLang: fieldLanguage(w.expectedLang).name,
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setFieldConfigs((prev) =>
                      prev.map((f, i) => (i === w.fieldIndex ? { ...f, lang: w.expectedLang } : f))
                    )
                  }
                  className="px-2 py-0.5 rounded border border-current font-medium hover:bg-amber-500/10 cursor-pointer shrink-0"
                >
                  {t('editor.lang_mismatch_fix', { lang: fieldLanguage(w.expectedLang).name })}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-fit">
            {/* Field header row: drag to reorder columns */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToHorizontalAxis]}
              onDragEnd={onFieldDragEnd}
            >
              <SortableContext items={fieldIds} strategy={horizontalListSortingStrategy}>
                <div className="grid items-center gap-2 pb-1" style={{ gridTemplateColumns: gridCols }}>
                  <span />
                  {fieldConfigs.map((cfg, idx) => (
                    <SortableItem
                      key={fieldIds[idx]}
                      id={fieldIds[idx]!}
                      handleLabel={t('editor.reorder')}
                      className="flex items-center gap-1 h-9 px-2 rounded-md bg-muted/50 min-w-0"
                    >
                      {(handle) => (
                        <>
                          {handle}
                          <div className="flex-1 min-w-0">
                            <FieldLabelDropdown
                              value={cfg.label}
                              onChange={(id) =>
                                setFieldConfigs((prev) =>
                                  prev.map((f, i) => (i === idx ? relabelField(prev, idx, id) : f))
                                )
                              }
                            />
                          </div>
                          {isFieldLangConfigurable(cfg) && (
                            <FieldLangPicker
                              value={effectiveFieldLang(cfg)!}
                              options={fieldLangOptions(cfg)}
                              onChange={(lang) =>
                                setFieldConfigs((prev) => prev.map((f, i) => (i === idx ? { ...f, lang } : f)))
                              }
                            />
                          )}
                          {fieldConfigs.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeField(idx)}
                              aria-label={t('editor.remove_field')}
                              className="text-muted-foreground hover:text-red-500 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </SortableItem>
                  ))}
                  {fieldConfigs.length < 5 ? (
                    <button
                      type="button"
                      onClick={addField}
                      aria-label={t('editor.add_field')}
                      title={t('editor.add_field')}
                      className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {/* Card rows: drag to reorder */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={onCardDragEnd}
            >
              <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {cards.map((card) => (
                  <SortableItem
                    key={card.id}
                    id={card.id}
                    handleLabel={t('editor.reorder')}
                    className="grid items-center gap-2 py-1 border-b border-border"
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    {(handle) => (
                      <>
                        {handle}
                        {fieldConfigs.map((cfg, fieldIdx) => (
                          <input
                            key={fieldIds[fieldIdx]}
                            type="text"
                            value={card.content[fieldIdx] ?? ''}
                            onChange={(e) =>
                              setCards((prev) =>
                                prev.map((c) =>
                                  c.id === card.id
                                    ? {
                                        ...c,
                                        content: c.content.map((val, i) =>
                                          i === fieldIdx ? e.target.value : val
                                        ),
                                      }
                                    : c
                                )
                              )
                            }
                            lang={effectiveFieldLang(cfg)}
                            placeholder={t('editor.enter_field', { label: fieldPlaceholderNames[fieldIdx] })}
                            className="h-10 px-2 min-w-0 rounded-md bg-transparent hover:bg-muted/40 focus:bg-muted/60 outline-none text-sm"
                          />
                        ))}
                        {cards.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
                            aria-label={t('editor.remove_card')}
                            className="text-muted-foreground hover:text-red-500 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <span />
                        )}
                      </>
                    )}
                  </SortableItem>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCards((prev) => [...prev, createEmptyCard(fieldConfigs.length)])}
          className="w-full h-10 rounded-md border border-dashed border-border text-sm text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t('editor.add_card')}
        </button>
      </section>

      {aiNotice && (
        <div
          role="status"
          className="fixed bottom-5 right-4 left-4 sm:left-auto sm:right-5 z-50 max-w-sm ml-auto rounded-lg border border-border bg-card text-card-foreground shadow-lg px-3.5 py-2.5 flex items-center gap-3 text-xs font-medium"
        >
          <span className="text-emerald-600 dark:text-emerald-400">{aiNotice}</span>
          <button
            type="button"
            onClick={() => setAiNotice(null)}
            aria-label={t('common.dismiss')}
            className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </form>
  );
}

export default function EditorPage() {
  const { id } = useParams<{ id?: string }>();
  const { t } = useI18n();
  const { decks, currentUid, authUser } = useWebStore();
  const existingDeck = id ? decks.find((d) => d.id === id) : undefined;

  if (existingDeck && !isOwnedDeck(existingDeck, currentUid)) {
    return <Navigate to={`/deck/${existingDeck.id}`} replace />;
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <Navbar />
      {isFirebaseConfigured && !authUser ? (
        <main className="flex-1 max-w-md w-full mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center text-center space-y-4">
          <h1 className="text-xl font-semibold text-balance">{t('auth.sign_in_title')}</h1>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer"
          >
            {t('auth.continue_google')}
          </button>
        </main>
      ) : (
        <EditorForm key={existingDeck?.id ?? 'new'} existingDeck={existingDeck} />
      )}
      <Footer />
    </div>
  );
}
