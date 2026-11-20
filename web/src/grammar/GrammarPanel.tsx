import { LvPanel } from './lv';

export type GrammarPanelProps = {
  lang: string;
  pos: string;
  grammar: Record<string, unknown> | null | undefined;
  forms: unknown;
  showLine?: boolean;
};

const PANELS: Record<
  string,
  (props: Omit<GrammarPanelProps, 'lang'>) => React.ReactNode
> = {
  lv: LvPanel,
};

// Picks the panel for the deck's source language; nothing renders when the word has no forms.
export function GrammarPanel({ lang, ...word }: GrammarPanelProps) {
  const panel = PANELS[lang]?.(word);
  if (!panel) return null;
  return (
    <details className="grammar">
      <summary>Forms</summary>
      {panel}
    </details>
  );
}
