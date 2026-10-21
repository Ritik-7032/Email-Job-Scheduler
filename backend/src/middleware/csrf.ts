import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

const rawFrontend = env.FRONTEND_URL ? env.FRONTEND_URL.replace(/\/+$/, '') : '';
export const ALLOWED_ORIGINS = new Set(
  [
    rawFrontend,
    'https://hypersend.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ].filter(Boolean)
);

/**
 * OWASP CSRF Defense: Verifying Origin with Standard Headers.
 * For any state-changing method (POST, PUT, PATCH, DELETE), verifies that
 * the Origin / Referer header matches trusted origins before processing.
 */
export function verifyOriginCsrf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Safe HTTP methods do not alter state
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const origin = req.headers.origin ? req.headers.origin.replace(/\/+$/, '') : null;
  let refererOrigin: string | null = null;
  if (req.headers.referer) {
    try {
      refererOrigin = new URL(req.headers.referer).origin.replace(/\/+$/, '');
    } catch {
      refererOrigin = null;
    }
  }

  const requestSource = origin || refererOrigin;

  // Block any untrusted cross-origin request attempting a state change
  if (requestSource && !ALLOWED_ORIGINS.has(requestSource)) {
    res.status(403).json({
      error: {
        message: 'Forbidden: Cross-site request rejected (CSRF origin check failed)',
      },
    });
    return;
  }

  next();
}
