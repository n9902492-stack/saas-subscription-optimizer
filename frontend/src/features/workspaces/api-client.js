export async function request(path, { token, body, method = 'GET', signal } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    headers, method, signal, body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? 'Request failed.');
  return data;
}
