'use client';

import { useState } from 'react';
import Link from 'next/link';

import { request } from './api-client';
import WorkspaceDashboard from './workspace-dashboard';

export default function AccountWorkspaces({ initialMode, collaborationPanel }) {
  const [mode, setMode] = useState(initialMode);
  const [token, setToken] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [workspace, selectWorkspace] = useState(null);
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
      selectWorkspace(item);
      form.reset();
    });
  }

  const showCollaboration = !token && mode === 'signin';
  const showDashboard = Boolean(token && workspace);

  function signOut() {
    return run(async () => {
      await request('/api/auth/signout', { token, method: 'POST' });
      setToken('');
      setWorkspaces([]);
      selectWorkspace(null);
      setMode('signin');
    });
  }

  return (
    <main className={`account${showCollaboration ? ' account--split' : ''}${showDashboard ? ' account--dashboard' : ''}`}>
      <div className="account-main">
        {!showDashboard && <header className="account-topbar">
          <Link className="brand" href="/">SaaS Optimizer</Link>
        </header>}
        <section className={`account-content${showDashboard ? ' account-content--dashboard' : token ? ' account-content--workspaces' : ''}`}>
          {showDashboard ? (
            <><WorkspaceDashboard key={workspace.id} workspace={workspace} token={token} onBack={() => selectWorkspace(null)} onSignOut={signOut} signingOut={busy} />{error && <p role="alert">{error}</p>}</>
          ) : (
            <>
              {token ? (
                <>
                  <h2>Your workspaces</h2>
                  <form onSubmit={createWorkspace}>
                    <label>Workspace name<input name="name" required maxLength={100} /></label>
                    <button disabled={busy}>Create workspace</button>
                  </form>
                  {workspaces.length ? <ul className="workspace-list">{workspaces.map((item) => (
                    <li key={item.id}><button type="button" className="secondary" onClick={() => selectWorkspace(item)}>{item.name} · {item.role}</button></li>
                  ))}</ul> : <p>No workspaces yet.</p>}
                  <button disabled={busy} onClick={signOut}>Sign out</button>
                </>
              ) : (
                <>
                  <h2>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
                  <form onSubmit={authenticate}>
                    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
                    <label>Password<input name="password" type="password" minLength={12} maxLength={128}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
                    {mode === 'signin' && <Link className="password-recovery-link" href="/forgot-password">Forgot password?</Link>}
                    <button disabled={busy}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
                  </form>
                  <button disabled={busy} onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup');
                    setError('');
                  }}>{mode === 'signup' ? 'I already have an account' : 'Create an account'}</button>
                </>
              )}
              {error && <p role="alert">{error}</p>}
            </>
          )}
        </section>
      </div>
      {showCollaboration && collaborationPanel}
    </main>
  );
}
