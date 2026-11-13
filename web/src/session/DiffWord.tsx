import type { DiffItem } from '../api/study';

const HINTS: Record<string, string> = {
  diacritic: 'Check the accent marks.',
  wrong: 'A letter is wrong.',
  missing: 'A letter is missing.',
  extra: 'There is an extra letter.',
};

export function DiffWord({ diff }: { diff: DiffItem[] }) {
  const kinds = [
    ...new Set(diff.map((d) => d.kind).filter((k) => k !== 'match')),
  ];
  return (
    <>
      <span className="diff-word" lang="lv">
        {diff.map((item, i) =>
          item.kind === 'match' ? (
            <span key={i}>{item.expected}</span>
          ) : (
            <mark key={i} data-kind={item.kind}>
              {item.kind === 'extra' ? item.typed : item.expected}
            </mark>
          ),
        )}
      </span>
      {kinds.map((kind) => (
        <span key={kind} className="muted diff-hint">
          {HINTS[kind]}
        </span>
      ))}
    </>
  );
}
