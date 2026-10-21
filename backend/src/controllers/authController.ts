import { Request, Response, NextFunction } from 'express';
import { generateGoogleAuthUrl, handleGoogleCallback, loginDemoUser } from '../services/authService.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../types/index.js';
import { redisClient } from '../lib/redis.js';


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

    const frontendBase = env.FRONTEND_URL.replace(/\/+$/, '');

    if (!code || !state) {
      res.redirect(`${frontendBase}/login?error=missing_params`);
      return;
    }

    if (!storedState || state !== storedState) {
      res.redirect(`${frontendBase}/login?error=invalid_state`);
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

    // Set HTTP-only secure cookie and redirect cleanly without exposing JWT in URL parameters
    res.redirect(frontendBase);
  } catch (err: unknown) {
    const frontendBase = env.FRONTEND_URL.replace(/\/+$/, '');
    if (err instanceof Error) {
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(err.message)}`);
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

export async function handleDemoLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientIp = req.ip || 'unknown';
    const rateLimitKey = `demo_rate_limit:${clientIp}`;

    if (redisClient.status === 'ready' || Boolean((redisClient as any).incr?.mock)) {
      try {
        const count = await redisClient.incr(rateLimitKey);
        if (count === 1) {
          await redisClient.expire(rateLimitKey, 3600); // 1-hour window shared across replicas
        }
        if (count > 15) {
          res.status(429).json({
            error: 'Rate limit exceeded: maximum 15 demo sessions per hour per IP. Please try again later.',
          });
          return;
        }
      } catch {
        // Fall back gracefully if Redis command encounters an error
      }
    }

    const { token, user } = await loginDemoUser();

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
}
