import { findDeckBySlug, listDecks } from '../repositories/decks';
import { findTopic, listTopicLevelCounts } from '../repositories/topics';
import { listWordRowsByTopic } from '../repositories/words';

export type DeckDto = {
  slug: string;
  sourceLang: string;
  targetLang: string;
  title: string;
};
export type TopicDto = {
  id: number;
  slug: string;
  title: string;
  titleUk: string;
  wordCounts: Record<string, number>;
  counts: { new: number; learning: number; learned: number };
};
export type WordDto = {
  id: number;
  lemma: string;
  pos: string;
  level: string;
  translation: string;
  grammar: unknown;
  forms: unknown;
  sentences: { textWithGap: string; answer: string; hint: string }[];
};

export async function getDecks(db: D1Database): Promise<DeckDto[]> {
  const decks = await listDecks(db);
  return decks.map((d) => ({
    slug: d.slug,
    sourceLang: d.source_lang,
    targetLang: d.target_lang,
    title: d.title,
  }));
}

export async function getTopics(
  db: D1Database,
  deckSlug: string,
  userId: number,
): Promise<TopicDto[] | null> {
  const deck = await findDeckBySlug(db, deckSlug);
  if (!deck) return null;

  const topics = new Map<number, TopicDto>();
  for (const row of await listTopicLevelCounts(db, {
    userId,
    deckId: deck.id,
    sourceLang: deck.source_lang,
    targetLang: deck.target_lang,
  })) {
    let topic = topics.get(row.id);
    if (!topic) {
      topic = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        titleUk: row.title_uk,
        wordCounts: {},
        counts: { new: 0, learning: 0, learned: 0 },
      };
      topics.set(row.id, topic);
    }
    topic.wordCounts[row.level] = row.word_count;
    topic.counts.learned += row.learned_count;
    topic.counts.learning += row.learning_count;
    topic.counts.new += row.word_count - row.learned_count - row.learning_count;
  }
  return [...topics.values()];
}

export async function getTopicWords(
  db: D1Database,
  deckSlug: string,
  topicId: number,
): Promise<WordDto[] | null> {
  const deck = await findDeckBySlug(db, deckSlug);
  if (!deck) return null;
  if (!(await findTopic(db, deck.source_lang, topicId))) return null;

  const words = new Map<number, WordDto>();
  for (const row of await listWordRowsByTopic(db, topicId, deck.target_lang)) {
    let word = words.get(row.id);
    if (!word) {
      word = {
        id: row.id,
        lemma: row.lemma,
        pos: row.pos,
        level: row.level,
        translation: row.translation,
        grammar: row.grammar_json ? JSON.parse(row.grammar_json) : null,
        forms: row.forms_json ? JSON.parse(row.forms_json) : null,
        sentences: [],
      };
      words.set(row.id, word);
    }
    if (row.sentence_id !== null) {
      word.sentences.push({
        textWithGap: row.text_with_gap!,
        answer: row.answer!,
        hint: row.hint!,
      });
    }
  }
  return [...words.values()];
}
