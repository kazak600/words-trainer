export type DiffItem =
  | { kind: 'match'; expected: string; typed: string }
  | { kind: 'diacritic'; expected: string; typed: string }
  | { kind: 'wrong'; expected: string; typed: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; typed: string };

export type CheckResult = { correct: boolean; diff: DiffItem[] };

type Rules = { locale: string; requireDiacritics: boolean };

// One entry per language; adding a language is adding a row.
const RULES: Record<string, Rules> = {
  lv: { locale: 'lv', requireDiacritics: true },
  en: { locale: 'en', requireDiacritics: false },
};

const MARKS = /\p{M}/gu;
const DIACRITIC_COST = 0.5;

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
    correct: fold(clean(typedText), rules) === fold(clean(expectedText), rules),
    diff,
  };
}
