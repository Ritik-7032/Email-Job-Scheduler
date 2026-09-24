import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { verifyJwtToken } from '../services/authService.js';

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({
      error: {
        message: 'Authentication required',
      },
    });
    return;
  }

  const user = verifyJwtToken(token);
  if (!user) {
    res.status(401).json({
      error: {
        message: 'Invalid or expired authentication token',
      },
    });
    return;
  }

  req.user = user;
  next();
}
