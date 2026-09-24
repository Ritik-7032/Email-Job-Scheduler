import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AuthUser } from '../types/index.js';

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL
);

export function generateGoogleAuthUrl(): { url: string; state: string } {
  const state = crypto.randomBytes(32).toString('hex');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'profile', 'email'],
    prompt: 'select_account',
    state,
  });

  return { url, state };
}

export async function handleGoogleCallback(
  code: string,
  state: string,
  storedState?: string
): Promise<{ token: string; user: AuthUser }> {
  if (!state || !storedState || state !== storedState) {
    throw new Error('Invalid OAuth state parameter');
  }

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.id_token) {
    throw new Error('Missing ID token from Google OAuth response');
  }

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google user profile payload');
  }

  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    update: {
      name: payload.name || payload.email.split('@')[0],
      email: payload.email,
      avatar: payload.picture || null,
    },
    create: {
      googleId: payload.sub,
      name: payload.name || payload.email.split('@')[0],
      email: payload.email,
      avatar: payload.picture || null,
    },
  });

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  };

  const token = jwt.sign(authUser, env.JWT_SECRET, { expiresIn: '7d' });

  return { token, user: authUser };
}

export function verifyJwtToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}
