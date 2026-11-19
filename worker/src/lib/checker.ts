export type DiffItem =
  | { kind: 'match'; expected: string; typed: string }
  | { kind: 'diacritic'; expected: string; typed: string }
  | { kind: 'wrong'; expected: string; typed: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; typed: string };

export type Verdict = 'exact' | 'typo' | 'wrong';
export type CheckResult = { verdict: Verdict; diff: DiffItem[] };

type Rules = { locale: string; requireDiacritics: boolean };

// One entry per language; adding a language is adding a row.
const RULES: Record<string, Rules> = {
  lv: { locale: 'lv', requireDiacritics: true },
  en: { locale: 'en', requireDiacritics: false },
};

const MARKS = /\p{M}/gu;
const DIACRITIC_COST = 0.5;

// Words of 1-3 letters have no edit tolerance: one edit changes them into other words.
function allowedEdits(letters: number): number {
  if (letters <= 3) return 0;
  return letters <= 8 ? 1 : 2;
}

function levenshtein(a: string[], b: string[]): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return row[b.length]!;
}

// `strict` drops the edit tolerance (cloze trains exact endings); missing marks still pass as typos.
function verdictFor(
  typedText: string,
  expectedText: string,
  rules: Rules,
  strict: boolean,
): Verdict {
  const typed = clean(typedText);
  const expected = clean(expectedText);
  if (typed === '') return 'wrong';
  if (fold(typed, rules) === fold(expected, rules)) return 'exact';
  const lower = (t: string) => t.toLocaleLowerCase(rules.locale);
  if (lower(stripMarks(typed)) === lower(stripMarks(expected))) return 'typo';
  if (strict) return 'wrong';
  const letters = [...expected];
  const distance = levenshtein([...lower(typed)], [...lower(expected)]);
  return distance <= allowedEdits(letters.length) ? 'typo' : 'wrong';
}

function clean(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function stripMarks(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').normalize('NFC');
}

function fold(text: string, rules: Rules): string {
  const base = rules.requireDiacritics ? text : stripMarks(text);
  return base.toLocaleLowerCase(rules.locale);
}

function compare(
  expected: string,
  typed: string,
  rules: Rules,
): 'match' | 'diacritic' | 'wrong' {
  if (fold(expected, rules) === fold(typed, rules)) return 'match';
  const sameBase =
    stripMarks(expected).toLocaleLowerCase(rules.locale) ===
    stripMarks(typed).toLocaleLowerCase(rules.locale);
  return sameBase ? 'diacritic' : 'wrong';
}

const substitutionCost = { match: 0, diacritic: DIACRITIC_COST, wrong: 1 };

export function checkAnswer(
  typedText: string,
  expectedText: string,
  lang: string,
  options: { strict?: boolean } = {},
): CheckResult {
  const rules = RULES[lang];
  if (!rules) throw new Error(`no checker rules for language "${lang}"`);

  const expected = [...clean(expectedText)];
  const typed = [...clean(typedText)];

  // Edit-distance alignment, so the diff stays readable when letters are added or dropped.
  const cost: number[][] = Array.from({ length: expected.length + 1 }, () =>
    new Array<number>(typed.length + 1).fill(0),
  );
  for (let i = 1; i <= expected.length; i++) cost[i]![0] = i;
  for (let j = 1; j <= typed.length; j++) cost[0]![j] = j;
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= typed.length; j++) {
      const sub =
        substitutionCost[compare(expected[i - 1]!, typed[j - 1]!, rules)];
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + sub,
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1,
      );
    }
  }

  const diff: DiffItem[] = [];
  let i = expected.length;
  let j = typed.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const kind = compare(expected[i - 1]!, typed[j - 1]!, rules);
      if (cost[i]![j] === cost[i - 1]![j - 1]! + substitutionCost[kind]) {
        diff.push({ kind, expected: expected[i - 1]!, typed: typed[j - 1]! });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && cost[i]![j] === cost[i - 1]![j]! + 1) {
      diff.push({ kind: 'missing', expected: expected[i - 1]! });
      i--;
    } else {
      diff.push({ kind: 'extra', typed: typed[j - 1]! });
      j--;
    }
  }
  diff.reverse();

  return {
    verdict: verdictFor(
      typedText,
      expectedText,
      rules,
      options.strict === true,
    ),
    diff,
  };
}
