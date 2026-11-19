import { api } from './client';

export type LeechItem = {
  cardId: number;
  wordId: number;
  kind: 'recognition' | 'production' | 'cloze';
  lapses: number;
  lemma: string;
  pos: string;
  translation: string;
  textWithGap: string | null;
  hint: string | null;
  mnemonic: string;
  similarWord: string;
};

export type Notes = { mnemonic: string; similarWord: string };
export type SentenceInput = {
  textWithGap: string;
  answer: string;
  hint: string;
};

export const fetchLeeches = (deck: string) =>
  api<LeechItem[]>(`/api/decks/${deck}/leeches`);
export const saveNotes = (
  deck: string,
  wordId: number,
  notes: Partial<Notes>,
) =>
  api<Notes>(`/api/decks/${deck}/words/${wordId}/notes`, {
    method: 'PUT',
    body: notes,
  });
export const addSentence = (
  deck: string,
  wordId: number,
  sentence: SentenceInput,
) =>
  api<{ sentenceId: number }>(`/api/decks/${deck}/words/${wordId}/sentences`, {
    method: 'POST',
    body: sentence,
  });
export const unsuspend = (deck: string, cardId: number) =>
  api<{ cardId: number }>(`/api/decks/${deck}/cards/${cardId}/unsuspend`, {
    method: 'POST',
  });
