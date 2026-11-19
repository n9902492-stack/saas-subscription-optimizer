import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const digest = (token) => createHash('sha256').update(token).digest('hex');
const sessionDuration = 86400000;
const invalid = (response) => response.status(401).json({ message: 'Sign in to continue.' });

export function authModule(db) {
  const users = db.collection('users');
  const sessions = db.collection('sessions');

  async function initialize() {
    await users.createIndex({ email: 1 }, { unique: true });
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
    await sessions.insertOne({ _id: digest(token), userId: user._id, expiresAt: new Date(Date.now() + sessionDuration) });
    response.status(signup ? 201 : 200).json({ token });
  }

  async function requireSession(request, response, next) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.get('authorization') ?? '');
    if (!match) return invalid(response);
    const session = await sessions.findOne({ _id: digest(match[1]), expiresAt: { $gt: new Date() } });
    if (!session) return invalid(response);
    request.session = session;
    next();
  }

  return {
    initialize, requireSession,
    signup: (request, response) => submit(request, response, true),
    signin: (request, response) => submit(request, response, false),
    async signout(request, response) {
      await sessions.deleteOne({ _id: request.session._id });
      response.sendStatus(204);
    },
  };
}
