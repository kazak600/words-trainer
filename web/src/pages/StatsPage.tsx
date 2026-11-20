import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStats, type Stats } from '../api/stats';
import { fetchReview } from '../api/study';
import { useDeck } from '../decks/DeckContext';

const WEEKS = 12;
const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

const STATES = [
  ['new', 'New'],
  ['learning', 'Learning'],
  ['review', 'Review'],
  ['learned', 'Learned'],
] as const;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Mon-Sun rows for the last WEEKS weeks; days after today stay empty.
function calendarDays(todayMs: number): (string | null)[] {
  const weekday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const start = todayMs - weekday * DAY_MS - (WEEKS - 1) * 7 * DAY_MS;
  return Array.from({ length: WEEKS * 7 }, (_, i) => {
    const ms = start + i * DAY_MS;
    return ms > todayMs ? null : isoDay(ms);
  });
}

// The last RECENT_DAYS calendar days, newest first, with 0 for days without reviews.
function lastDays(days: Stats['days']): Stats['days'] {
  if (days.length === 0) return [];
  const offsetMs = -new Date().getTimezoneOffset() * 60_000;
  const counts = new Map(days.map((d) => [d.day, d.reviews]));
  return Array.from({ length: RECENT_DAYS }, (_, i) => {
    const day = isoDay(Date.now() + offsetMs - i * DAY_MS);
    return { day, reviews: counts.get(day) ?? 0 };
  });
}

function Calendar({ days }: { days: Stats['days'] }) {
  const offsetMs = -new Date().getTimezoneOffset() * 60_000;
  const counts = new Map(days.map((d) => [d.day, d.reviews]));
  return (
    <div role="grid" aria-label="Study days" className="calendar">
      {calendarDays(Date.now() + offsetMs).map((day, i) => {
        if (day === null) return <span key={i} aria-hidden="true" />;
        const reviews = counts.get(day) ?? 0;
        return (
          <span
            key={day}
            role="gridcell"
            aria-label={`${day}: ${reviews === 0 ? 'no reviews' : `${reviews} reviews`}`}
            className={`day${reviews > 0 ? ' studied' : ''}`}
          />
        );
      })}
    </div>
  );
}

export function StatsPage() {
  const { deck } = useDeck();
  const [leeches, setLeeches] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setFailed(false);
    setStats(null);
    fetchReview(deck.slug)
      .then((review) => current && setLeeches(review.leeches))
      .catch(() => current && setLeeches(0));
    fetchStats(deck.slug)
      .then((loaded) => current && setStats(loaded))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [deck.slug]);

  const recent = stats ? lastDays(stats.days) : [];

  return (
    <section>
      <h1>Stats</h1>
      <Link to="/stats/leeches" className="continue">
        Leech Workshop{leeches > 0 ? ` · ${leeches}` : ''}
      </Link>
      {failed && (
        <p role="alert" className="error">
          Could not load the stats.
        </p>
      )}
      {stats && (
        <>
          <ul className="state-bar" aria-label="Words by state">
            {STATES.map(([key, label]) => (
              <li key={key} className={`state ${key}`}>
                <span>{label}</span>
                <strong>{stats.states[key]}</strong>
              </li>
            ))}
          </ul>

          <h2>By level</h2>
          <table aria-label="By level" className="stat-table">
            <tbody>
              {stats.levels.map((l) => (
                <tr key={l.level}>
                  <th scope="row">{l.level}</th>
                  <td>
                    {l.learned} / {l.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>By topic</h2>
          <table aria-label="By topic" className="stat-table">
            <tbody>
              {stats.topics.map((t) => (
                <tr key={t.topicId}>
                  <th scope="row">
                    {t.title} <span className="muted">{t.titleUk}</span>
                  </th>
                  <td>
                    {t.learned} / {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Study days</h2>
          <Calendar days={stats.days} />

          <h2>Reviews per day</h2>
          {recent.length === 0 ? (
            <p className="muted">No reviews yet.</p>
          ) : (
            <table aria-label="Reviews per day" className="stat-table">
              <tbody>
                {recent.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{d.day}</th>
                    <td>{d.reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
