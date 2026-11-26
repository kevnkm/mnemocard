import { useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { toFieldLabelId } from '@mnemocard/core';

function renderMath(src: string, displayMode: boolean): string {
  return katex.renderToString(src, { throwOnError: false, displayMode });
}

/**
 * Renders card text with math. A field labelled "latex" is treated as one LaTeX
 * expression; any other text only renders math inside $...$ delimiters.
 */
export function MathText({ text, label }: { text: string; label?: string }) {
  const isLatex = label !== undefined && toFieldLabelId(label) === 'latex';

  const nodes = useMemo<ReactNode[] | null>(() => {
    if (isLatex) {
      return [
        <span key="m" dangerouslySetInnerHTML={{ __html: renderMath(text, true) }} />,
      ];
    }
    if (!text.includes('$')) return null;
    const parts = text.split(/\$([^$\n]+)\$/g);
    if (parts.length === 1) return null;
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(part, false) }} />
      ) : (
        part
      )
    );
  }, [text, isLatex]);

  return <>{nodes ?? text}</>;
}
