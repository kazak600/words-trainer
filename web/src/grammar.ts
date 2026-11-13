const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const GENDERS: Record<string, string> = { m: 'masculine', f: 'feminine' };

type Grammar = Record<string, unknown> | null | undefined;

// Latvian only for now: nouns show gender and declension, verbs conjugation.
export function grammarLine(pos: string, grammar: Grammar): string | null {
  if (!grammar) return null;
  const parts: string[] = [];
  if (pos === 'noun') {
    const gender = GENDERS[String(grammar.gender)];
    const declension = ORDINALS[Number(grammar.declension)];
    if (gender) parts.push(gender);
    if (declension) parts.push(`${declension} declension`);
  }
  if (pos === 'verb') {
    const conjugation = ORDINALS[Number(grammar.conjugation)];
    if (conjugation) parts.push(`${conjugation} conjugation`);
    if (grammar.reflexive === true) parts.push('reflexive');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
