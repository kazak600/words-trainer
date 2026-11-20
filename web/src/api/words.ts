import { api } from './client';

export type TopicWord = {
  id: number;
  lemma: string;
  pos: string;
  level: string;
  translation: string;
  sentences: { textWithGap: string; answer: string; hint: string }[];
};

export const fetchTopicWords = (deck: string, topicId: number) =>
  api<TopicWord[]>(`/api/decks/${deck}/topics/${topicId}/words`);
