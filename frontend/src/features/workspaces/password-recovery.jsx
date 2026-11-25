'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { request } from './api-client';

export default function PasswordRecovery({ reset = false }) {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const readLink = useRef(false);
  useEffect(() => {
    if (!reset || readLink.current) return;
    readLink.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    setToken(/^[a-f0-9]{64}$/.test(value) ? value : '');
    // Keep the bearer secret out of history entries and same-origin navigation.
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [reset]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const fields = new FormData(event.currentTarget);
    if (reset && fields.get('password') !== fields.get('confirmPassword')) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await request(`/api/auth/${reset ? 'reset-password' : 'forgot-password'}`, {
        method: 'POST', body: reset
          ? { token, password: fields.get('password'), confirmPassword: fields.get('confirmPassword') }
          : { email: fields.get('email') },
      });
      if (reset) {
        setConfirmation(result.message);
        setToken('');
        router.replace('/sign-in');
      } else setConfirmation(result.message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="account">
    <div className="account-main">
      <header className="account-topbar"><Link className="brand" href="/">SaaS Optimizer</Link></header>
      <section className="account-content" aria-labelledby="recovery-title">
        <span className="eyebrow">Account recovery</span>
        <h2 id="recovery-title">{reset ? 'Choose a new password' : 'Forgot your password?'}</h2>
        {confirmation ? <p role="status">{confirmation}</p> : reset && token === null ? <p role="status">Checking reset link…</p>
          : reset && !token ? <p role="alert">This reset link is invalid or missing. <Link href="/forgot-password">Request a new reset link</Link>.</p>
          : <>
            <p className="recovery-description">{reset ? 'Use 12–128 characters for your new password.' : 'Enter your email address to request a password reset link.'}</p>
            <form onSubmit={submit}>
              {reset ? <>
                <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
                <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
              </> : <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
              <button disabled={busy}>{busy ? 'Please wait…' : reset ? 'Reset password' : 'Send reset link'}</button>
            </form>
          </>}
        {error && <div role="alert"><p>{error}</p>{reset && <Link href="/forgot-password">Request a new reset link</Link>}</div>}
        <Link className="recovery-back" href="/sign-in">Back to sign in</Link>
      </section>
    </div>
  </main>;
}
