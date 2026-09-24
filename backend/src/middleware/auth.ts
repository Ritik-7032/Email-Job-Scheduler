import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { verifyJwtToken } from '../services/authService.js';
import { prisma } from '../lib/prisma.js';

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.token;

    if (!token) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
        },
      });
      return;
    }

    const payload = verifyJwtToken(token);
    if (!payload) {
      res.clearCookie('token');
      res.status(401).json({
        error: {
          message: 'Invalid or expired authentication token',
        },
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      res.clearCookie('token');
      res.status(401).json({
        error: {
          message: 'User session invalid or user no longer exists. Please log in again.',
        },
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    };
    next();
  } catch (err) {
    next(err);
  }
}

