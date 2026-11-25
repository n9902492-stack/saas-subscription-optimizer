export async function request(path, { token, body, method = 'GET', signal } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(path, {
      headers, method, signal, body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    throw new Error('Cannot connect to the API. Make sure the backend is running with npm run dev:backend, then try again.');
  }
  if (response.status === 204) return;
  let parsed = true;
  const data = await response.json().catch(() => { parsed = false; return null; });
  if (!response.ok) {
    if (typeof data?.message === 'string' && data.message) throw new Error(data.message);
    if (response.status === 404) throw new Error('This API endpoint is unavailable. Restart the backend with npm run dev:backend to load the latest routes, then try again.');
    if (response.status === 429) throw new Error('Too many requests. Please wait before trying again.');
    if (response.status >= 500) throw new Error('The API is unavailable right now. Check the backend terminal and make sure npm run dev:backend is running, then try again.');
    throw new Error(`The request could not be completed (HTTP ${response.status}). Please try again.`);
  }
  if (!parsed) throw new Error('The API returned an unexpected response. Restart the backend with npm run dev:backend, then try again.');
  return data;
}
