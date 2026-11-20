import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStats, type Stats } from '../api/stats';
import { fetchReview } from '../api/study';
import { useDeck } from '../decks/DeckContext';

const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;
// Matches CALENDAR_DAYS in the Worker: the stats response has no study days older than this.
const CALENDAR_WINDOW_DAYS = 90;
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const SHORT_LIST = 5;

const STATES = [
  ['new', 'New'],
  ['learning', 'Learning'],
  ['review', 'Review'],
  ['learned', 'Learned'],
] as const;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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

function ToggleList({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="show-toggle" onClick={onToggle}>
      {expanded ? 'Show less' : 'Show more'}
    </button>
  );
}

function shiftMonth(view: string, by: number): string {
  const first = new Date(
    Date.UTC(Number(view.slice(0, 4)), Number(view.slice(5, 7)) - 1 + by, 1),
  );
  return first.toISOString().slice(0, 7);
}

function Calendar({ days }: { days: Stats['days'] }) {
  const offsetMs = -new Date().getTimezoneOffset() * 60_000;
  const today = isoDay(Date.now() + offsetMs);
  const windowStart = isoDay(
    Date.parse(`${today}T00:00:00Z`) - (CALENDAR_WINDOW_DAYS - 1) * DAY_MS,
  );
  const counts = new Map(days.map((d) => [d.day, d.reviews]));
  const [view, setView] = useState(today.slice(0, 7));

  const [year, month] = [Number(view.slice(0, 4)), Number(view.slice(5, 7))];
  const first = Date.UTC(year, month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const canGoBack = isoDay(Date.UTC(year, month - 1, 0)) >= windowStart;
  const canGoForward = view < today.slice(0, 7);

  let studied = 0;
  let reviewTotal = 0;
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = isoDay(first + i * DAY_MS);
    const future = day > today;
    const outside = day < windowStart;
    const reviews = counts.get(day) ?? 0;
    if (!future && !outside && reviews > 0) {
      studied += 1;
      reviewTotal += reviews;
    }
    const className = [
      'cal-day',
      reviews > 0 && !future && !outside && 'studied',
      day === today && 'today',
      (future || outside) && 'out',
    ]
      .filter(Boolean)
      .join(' ');
    const label = outside
      ? undefined
      : `${day}: ${reviews === 0 ? 'no reviews' : `${reviews} reviews`}`;
    return (
      <span key={day} role="gridcell" aria-label={label} className={className}>
        {i + 1}
      </span>
    );
  });

  return (
    <div className="calendar">
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => setView(shiftMonth(view, -1))}
        >
          ‹
        </button>
        <strong>
          {new Date(first).toLocaleString('en', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </strong>
        <button
          type="button"
          className="cal-nav"
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => setView(shiftMonth(view, 1))}
        >
          ›
        </button>
      </div>
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div role="grid" aria-label="Study days" className="cal-grid">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {cells}
      </div>
      <p className="cal-foot muted">
        {studied} study days · {reviewTotal} reviews this month
      </p>
    </div>
  );
}

export function StatsPage() {
  const { deck } = useDeck();
  const [leeches, setLeeches] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  const [allDays, setAllDays] = useState(false);

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
  const shownTopics =
    stats && !allTopics
      ? stats.topics.slice(0, SHORT_LIST)
      : (stats?.topics ?? []);
  const shownDays = allDays ? recent : recent.slice(0, SHORT_LIST);

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
              {shownTopics.map((t) => (
                <tr key={t.topicId}>
                  <th scope="row">{t.title}</th>
                  <td>
                    {t.learned} / {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {stats.topics.length > SHORT_LIST && (
            <ToggleList
              expanded={allTopics}
              onToggle={() => setAllTopics(!allTopics)}
            />
          )}

          <h2>Study days</h2>
          <Calendar days={stats.days} />

          <h2>Reviews per day</h2>
          {recent.length === 0 ? (
            <p className="muted">No reviews yet.</p>
          ) : (
            <table aria-label="Reviews per day" className="stat-table">
              <tbody>
                {shownDays.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{d.day}</th>
                    <td>{d.reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {recent.length > SHORT_LIST && (
            <ToggleList
              expanded={allDays}
              onToggle={() => setAllDays(!allDays)}
            />
          )}
        </>
      )}
    </section>
  );
}
