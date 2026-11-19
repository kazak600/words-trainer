import { api } from './client';

export type Deck = {
  slug: string;
  sourceLang: string;
  targetLang: string;
  title: string;
};

const LANGUAGE_NAMES: Record<string, string> = {
  lv: 'Latvian',
  uk: 'Ukrainian',
  en: 'English',
};

export const fetchDecks = () => api<Deck[]>('/api/decks');

export const languageName = (code: string): string =>
  LANGUAGE_NAMES[code] ?? code;
