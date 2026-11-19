import { api } from './client';
import type { SentenceInput } from './leeches';

export type TopicOption = {
  id: number;
  slug: string;
  title: string;
  titleUk: string;
};

export type NewWord = {
  lemma: string;
  translation: string;
  pos: string;
  topicId: number;
  level: string;
  sentence?: SentenceInput;
};

export const fetchTopicOptions = (deck: string) =>
  api<TopicOption[]>(`/api/decks/${deck}/topic-options`);
export const addWord = (deck: string, word: NewWord) =>
  api<{ wordId: number }>(`/api/decks/${deck}/words`, {
    method: 'POST',
    body: word,
  });
