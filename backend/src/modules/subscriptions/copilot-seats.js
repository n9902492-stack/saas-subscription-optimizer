const pageSize = 100;
const maxPages = 10;

export async function fetchCopilotSeats(org, token) {
  const rows = new Map();
  const signal = AbortSignal.timeout(20_000);
  let expectedCount;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`/orgs/${org}/copilot/billing/seats`, 'https://api.github.com');
    url.searchParams.set('per_page', pageSize);
    url.searchParams.set('page', page);

    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10' },
      redirect: 'error', signal,
    });
    if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' && response.status === 403) {
      throw new Error('GitHub rate limit reached. Try again later.');
    }
    if ([401, 403, 404].includes(response.status)) {
      throw new Error('GitHub denied access. Check the organization, Copilot plan, and read permission.');
    }
    if (!response.ok) throw new Error('GitHub did not return seat data. Try again later.');

    const { seats, total_seats: total } = await response.json();
    if (!Array.isArray(seats) || !Number.isSafeInteger(total) || total < 0 || seats.length > pageSize) {
      throw new Error('GitHub returned an invalid seat list.');
    }
    if (total > pageSize * maxPages) throw new Error('This sync supports up to 1,000 seats.');
    expectedCount ??= total;
    if (total !== expectedCount) throw new Error('Seat count changed during sync. Try again.');
    for (const seat of seats) {
      const account = seat?.assignee?.login;
      const key = typeof account === 'string' ? account.toLowerCase() : '';
      if (!key || account.length > 160 || rows.has(key)) throw new Error('GitHub returned inconsistent seat assignments.');
      const timestamp = typeof seat.last_activity_at === 'string' ? Date.parse(seat.last_activity_at) : NaN;
      const lastActivity = Number.isFinite(timestamp) && timestamp <= Date.now()
        ? new Date(timestamp).toISOString().slice(0, 10) : null;
      rows.set(key, { account, lastActivity });
    }
    const hasNext = /;\s*rel="next"/.test(response.headers.get('link') ?? '');
    if (!hasNext) {
      if (rows.size !== expectedCount) throw new Error('GitHub returned an incomplete seat list. Try again.');
      return [...rows.values()];
    }
  }
  throw new Error('GitHub returned more pages than this sync supports.');
}
