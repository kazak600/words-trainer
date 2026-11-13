import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState('checking...');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main>
      <h1>Latvian Words</h1>
      <p>API: {status}</p>
    </main>
  );
}
