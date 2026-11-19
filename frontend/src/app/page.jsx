export const dynamic = 'force-dynamic';

async function getReadiness() {
  try {
    const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
    const response = await fetch(new URL('/api/health', baseUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    return response.ok && (await response.json()).status === 'ready';
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const ready = await getReadiness();
  return (
    <main>
      <h1>SaaS Subscription Optimizer</h1>
      <p>Track software spend, licenses, and renewal decisions.</p>
      <dl>
        <dt>API and database status</dt>
        <dd>{ready ? 'Connected' : 'Unavailable. Check the API and MongoDB.'}</dd>
      </dl>
    </main>
  );
}
