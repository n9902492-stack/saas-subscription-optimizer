import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { resetMailer } from './reset-mailer.js';

const scrypt = promisify(derive);
const digest = (token) => createHash('sha256').update(token).digest('hex');
const sessionDuration = 86400000;
const invalid = (response) => response.status(401).json({ message: 'Sign in to continue.' });

export function authModule(db, { mailer = resetMailer() } = {}) {
  const users = db.collection('users');
  const sessions = db.collection('sessions');

  async function initialize() {
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ 'passwordReset.hash': 1 }, { unique: true, sparse: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  async function submit(request, response, signup) {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = request.body?.password;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return response.status(400).json({ message: 'Enter a valid email and a password of 12–128 characters.' });
    }
    let user = await users.findOne({ email });
    const salt = signup || !user ? randomBytes(16).toString('hex') : user.salt;
    const key = await scrypt(password, salt, 64);
    if (signup) {
      try {
        const result = await users.insertOne({ email, salt, passwordHash: key.toString('hex') });
        user = { _id: result.insertedId };
      } catch (error) {
        if (error.code !== 11000) throw error;
        return response.status(409).json({ message: 'An account already exists for this email.' });
      }
    } else if (!user || !timingSafeEqual(key, Buffer.from(user.passwordHash, 'hex'))) {
      return response.status(401).json({ message: 'Email or password is incorrect.' });
    }

    const token = randomBytes(32).toString('hex');
    await sessions.insertOne({ _id: digest(token), userId: user._id, authVersion: user.authVersion ?? 0, expiresAt: new Date(Date.now() + sessionDuration) });
    response.status(signup ? 201 : 200).json({ token });
  }

  async function requireSession(request, response, next) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.get('authorization') ?? '');
    if (!match) return invalid(response);
    const session = await sessions.findOne({ _id: digest(match[1]), expiresAt: { $gt: new Date() } });
    if (!session) return invalid(response);
    const user = await users.findOne({ _id: session.userId }, { projection: { authVersion: 1 } });
    if (!user || (user.authVersion ?? 0) !== (session.authVersion ?? 0)) return invalid(response);
    request.session = session;
    next();
  }

  return {
    initialize, requireSession,
    signup: (request, response) => submit(request, response, true),
    signin: (request, response) => submit(request, response, false),
    async forgotPassword(request, response) {
      response.set('Cache-Control', 'no-store');
      const unavailable = () => response.status(503).json({ message: 'Password recovery email is unavailable right now. Please try again later or contact your administrator.' });
      if (!mailer.configured) return unavailable();
      // Check transport availability for every address, including unknown accounts.
      try { await mailer.verify(); } catch { return unavailable(); }
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(400).json({ message: 'Enter a valid email address.' });
      }
      const token = randomBytes(32).toString('hex');
      const hash = digest(token);
      const now = new Date();
      // A single embedded reset record makes reissue and consumption atomic on standalone MongoDB.
      const user = await users.findOneAndUpdate({ email, $or: [
        { 'passwordReset.requestedAt': { $exists: false } },
        { 'passwordReset.requestedAt': { $lte: new Date(now.getTime() - 60_000) } },
      ] }, { $set: { passwordReset: { hash, requestedAt: now, expiresAt: new Date(now.getTime() + 30 * 60_000) } } },
      { projection: { _id: 1 }, returnDocument: 'after' });
      response.status(202).json({ message: 'If an account exists for this email, a reset link has been requested. Check your inbox and spam folder. Links expire after 30 minutes.' });
      // Delivery happens after the identical response, avoiding account-dependent SMTP response timing.
      if (user) void mailer.send(email, token).catch(async () => {
        console.error('Password recovery email delivery failed. Check SMTP configuration.');
        try { await users.updateOne({ _id: user._id, 'passwordReset.hash': hash }, { $unset: { passwordReset: '' } }); }
        catch { console.error('Password recovery cleanup failed.'); }
      });
    },
    async resetPassword(request, response) {
      response.set('Cache-Control', 'no-store');
      const { token, password, confirmPassword } = request.body ?? {};
      const invalidLink = () => response.status(400).json({ message: 'This reset link is invalid or has expired. Request a new reset link.' });
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return invalidLink();
      if (typeof password !== 'string' || password.length < 12 || password.length > 128 || password !== confirmPassword) {
        return response.status(400).json({ message: 'Passwords must match and contain 12–128 characters.' });
      }
      const hash = digest(token);
      if (!await users.findOne({ 'passwordReset.hash': hash, 'passwordReset.expiresAt': { $gt: new Date() } }, { projection: { _id: 1 } })) return invalidLink();
      const salt = randomBytes(16).toString('hex');
      const key = await scrypt(password, salt, 64);
      const updated = await users.findOneAndUpdate({
        'passwordReset.hash': hash, 'passwordReset.expiresAt': { $gt: new Date() },
      }, { $set: { salt, passwordHash: key.toString('hex') }, $unset: { passwordReset: '' }, $inc: { authVersion: 1 } },
      { projection: { _id: 1, authVersion: 1 }, returnDocument: 'after' });
      if (!updated) return invalidLink();
      // Version checks above invalidate old sessions immediately, even if physical cleanup fails.
      try { await sessions.deleteMany({ userId: updated._id, $or: [
        { authVersion: { $lt: updated.authVersion } }, { authVersion: { $exists: false } },
      ] }); } catch { console.error('Password reset session cleanup failed.'); }
      response.json({ message: 'Password updated. Sign in with your new password.' });
    },
    async signout(request, response) {
      await sessions.deleteOne({ _id: request.session._id });
      response.sendStatus(204);
    },
  };
}
