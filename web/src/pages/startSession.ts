import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';

export function describeStartError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return error.code === 'daily_cap_reached'
      ? 'Daily limit reached: 15 new words today.'
      : 'Nothing to study right now.';
  }
  return 'Could not start the session. Try again.';
}

// Starts a session through `begin` and opens the session screen; failures become a readable message.
export function useStartSession() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(begin: () => Promise<unknown>) {
    setStarting(true);
    setError(null);
    try {
      await begin();
      navigate('/session');
    } catch (e) {
      setError(describeStartError(e));
      setStarting(false);
    }
  }

  return { start, starting, error };
}
