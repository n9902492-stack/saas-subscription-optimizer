'use client';

import { useState } from 'react';

async function request(path, { token, body, method = 'GET' } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { headers, method, body: body ? JSON.stringify(body) : undefined });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'Request failed.');
  return data;
}

export default function AccountWorkspaces({ initialMode }) {
  const [mode, setMode] = useState(initialMode);
  const [token, setToken] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function authenticate(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    return run(async () => {
      const result = await request(`/api/auth/${mode}`, {
        method: 'POST', body: { email: fields.get('email'), password: fields.get('password') },
      });
      setToken(result.token);
      setWorkspaces(await request('/api/workspaces', { token: result.token }));
    });
  }

  function createWorkspace(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get('name');
    return run(async () => {
      const item = await request('/api/workspaces', { token, method: 'POST', body: { name } });
      setWorkspaces((current) => [item, ...current]);
      form.reset();
    });
  }

  return (
    <section>
      {token ? (
        <>
          <h2>Your workspaces</h2>
          <form onSubmit={createWorkspace}>
            <label>Workspace name<input name="name" required maxLength={100} /></label>
            <button disabled={busy}>Create workspace</button>
          </form>
          {workspaces.length ? <ul>{workspaces.map((item) => (
            <li key={item.id}>{item.name} · {item.role}</li>
          ))}</ul> : <p>No workspaces yet.</p>}
          <button disabled={busy} onClick={() => run(async () => {
            await request('/api/auth/signout', { token, method: 'POST' });
            setToken('');
            setWorkspaces([]);
            setMode('signin');
          })}>Sign out</button>
        </>
      ) : (
        <>
          <h2>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
          <form onSubmit={authenticate}>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" minLength={12} maxLength={128}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
            <button disabled={busy}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>
          <button disabled={busy} onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setError('');
          }}>{mode === 'signup' ? 'I already have an account' : 'Create an account'}</button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
