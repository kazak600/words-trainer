import { api } from './client';

export type Stats = {
  states: { new: number; learning: number; review: number; learned: number };
  levels: { level: string; total: number; learned: number }[];
  topics: {
    topicId: number;
    title: string;
    titleUk: string;
    total: number;
    learned: number;
  }[];
  days: { day: string; reviews: number }[];
};

const tzOffset = () => -new Date().getTimezoneOffset();

export const fetchStats = (deck: string) =>
  api<Stats>(`/api/decks/${deck}/stats?tzOffset=${tzOffset()}`);
