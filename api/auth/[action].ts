import crypto from 'node:crypto';
import {
  hashSecret,
  parseBody,
  readStore,
  signStatelessToken,
  verifySecret,
  verifyStatelessToken,
  writeStore,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/vercelStore';
import { pickAvatarColor } from '../../src/utils/meetingLogic';
import type { UserProfile } from '../../src/types/meeting';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const store = readStore();

  if (action === 'me' && req.method === 'GET') {
    const authHeader = req.headers.authorization;
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const payload = verifyStatelessToken<{ user: UserProfile; exp: number }>(token);
    if (!payload || payload.exp < Date.now()) {
      res.status(401).json({ error: 'Sesi tidak aktif atau kedaluwarsa.' });
      return;
    }
    res.status(200).json({ user: payload.user });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);

  if (action === 'register') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Nama minimal 2 karakter.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (store.users[email]) {
      res.status(409).json({ error: 'Email sudah terdaftar.' });
      return;
    }

    const user: UserProfile = {
      id: `usr_${crypto.randomUUID().slice(0, 12)}`,
      name,
      email,
      authProvider: 'email',
      avatarColor: pickAvatarColor(name + email),
    };
    store.users[email] = { ...user, passwordHash: hashSecret(password) };
    writeStore(store);

    const sessionToken = signStatelessToken({ user, exp: Date.now() + 86400_000 * 7 });
    res.status(201).json({ user, sessionToken });
    return;
  }

  if (action === 'login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const found = store.users[email];
    if (!found || !found.passwordHash || !verifySecret(password, found.passwordHash)) {
      res.status(401).json({ error: 'Email atau kata sandi salah.' });
      return;
    }
    const { passwordHash: _ph, ...user } = found;
    const sessionToken = signStatelessToken({ user, exp: Date.now() + 86400_000 * 7 });
    res.status(200).json({ user, sessionToken });
    return;
  }

  if (action === 'google') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (name.length < 2 || !email) {
      res.status(400).json({ error: 'Profil Google tidak lengkap.' });
      return;
    }
    const user: UserProfile = {
      id: `usr_${crypto.randomUUID().slice(0, 12)}`,
      name,
      email,
      authProvider: 'google',
      avatarColor: pickAvatarColor(name + email),
    };
    const sessionToken = signStatelessToken({ user, exp: Date.now() + 86400_000 * 7 });
    res.status(200).json({ user, sessionToken });
    return;
  }

  if (action === 'guest') {
    const name = typeof body.name === 'string' && body.name.trim().length >= 2
      ? body.name.trim()
      : 'Tamu Ketemu';
    const user: UserProfile = {
      id: `usr_${crypto.randomUUID().slice(0, 12)}`,
      name,
      email: null,
      authProvider: 'guest',
      avatarColor: pickAvatarColor(name),
    };
    const sessionToken = signStatelessToken({ user, exp: Date.now() + 86400_000 * 7 });
    res.status(200).json({ user, sessionToken });
    return;
  }

  res.status(404).json({ error: 'Endpoint autentikasi tidak ditemukan.' });
}
