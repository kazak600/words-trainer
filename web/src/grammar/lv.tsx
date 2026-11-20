import { grammarLine } from './line';
import type { GrammarPanelProps } from './GrammarPanel';

const CASES = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'locative',
  'vocative',
] as const;
const NUMBERS = ['singular', 'plural'] as const;
const TENSES = ['present', 'past', 'future'] as const;
const PERSONS = ['es', 'tu', 'viņš', 'mēs', 'jūs'];
const NOUN_POS = new Set(['noun', 'propn', 'phrase']);

type Props = Omit<GrammarPanelProps, 'lang'>;
type Forms = Record<string, unknown>;

const isForms = (value: unknown): value is Forms =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const present = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value !== '-';

function nounNumbers(forms: Forms) {
  return NUMBERS.filter((n) => {
    const column = forms[n];
    return isForms(column) && CASES.some((c) => present(column[c]));
  });
}

function NounTable({
  forms,
  numbers,
}: {
  forms: Forms;
  numbers: (typeof NUMBERS)[number][];
}) {
  return (
    <table aria-label="Cases">
      <thead>
        <tr>
          <th scope="col" />
          {numbers.map((n) => (
            <th key={n} scope="col">
              {n}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CASES.map((c) => (
          <tr key={c}>
            <th scope="row">{c}</th>
            {numbers.map((n) => (
              <td key={n} lang="lv">
                {String((forms[n] as Forms)[c] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VerbTable({
  forms,
  tenses,
}: {
  forms: Forms;
  tenses: (typeof TENSES)[number][];
}) {
  return (
    <>
      {present(forms.infinitive) && (
        <p lang="lv" className="infinitive">
          {forms.infinitive}
        </p>
      )}
      <table aria-label="Tenses">
        <thead>
          <tr>
            <th scope="col" />
            {tenses.map((t) => (
              <th key={t} scope="col">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERSONS.map((person, i) => (
            <tr key={person}>
              <th scope="row">{person}</th>
              {tenses.map((t) => (
                <td key={t} lang="lv">
                  {String((forms[t] as unknown[])[i] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function LvPanel({ pos, grammar, forms, showLine = true }: Props) {
  if (!isForms(forms)) return null;
  let table = null;
  if (NOUN_POS.has(pos)) {
    const numbers = nounNumbers(forms);
    if (numbers.length > 0)
      table = <NounTable forms={forms} numbers={numbers} />;
  } else if (pos === 'verb') {
    const tenses = TENSES.filter((t) => Array.isArray(forms[t]));
    if (tenses.length > 0) table = <VerbTable forms={forms} tenses={tenses} />;
  }
  if (!table) return null;
  const line = showLine ? grammarLine(pos, grammar) : null;
  return (
    <>
      {line && <p className="muted">{line}</p>}
      {table}
    </>
  );
}
