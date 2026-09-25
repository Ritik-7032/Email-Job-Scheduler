import { Request, Response, NextFunction } from 'express';
import { generateGoogleAuthUrl, handleGoogleCallback } from '../services/authService.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../types/index.js';

import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export async function handleEmailLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body;
    const targetEmail =
      email && typeof email === 'string' && email.trim()
        ? email.trim()
        : 'demo.user@reachinbox.ai';
    const userName = targetEmail.split('@')[0];

    const user = await prisma.user.upsert({
      where: { email: targetEmail },
      update: { name: userName },
      create: {
        googleId: `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        email: targetEmail,
        name: userName,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(targetEmail)}`,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    });
  } catch (err: unknown) {
    next(err);
  }
}

export function initiateGoogleAuth(_req: Request, res: Response): void {
  const { url, state } = generateGoogleAuthUrl();

  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000,
  });

  res.redirect(url);
}

export async function handleGoogleAuthCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, state } = req.query;
    const storedState = req.cookies?.oauth_state;

    res.clearCookie('oauth_state');

    if (!code || !state) {
      res.redirect(`${env.FRONTEND_URL}/login?error=missing_params`);
      return;
    }

    if (!storedState || state !== storedState) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
      return;
    }

    const { token } = await handleGoogleCallback(
      String(code),
      String(state),
      storedState
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(env.FRONTEND_URL);
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(err.message)}`);
      return;
    }
    next(err);
  }
}

export function getCurrentUser(req: AuthenticatedRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({
      error: {
        message: 'Unauthorized',
      },
    });
    return;
  }

  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
  });
}

export function logoutUser(_req: Request, res: Response): void {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}
