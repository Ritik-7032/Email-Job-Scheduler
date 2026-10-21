import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { emailRoutes } from './routes/emailRoutes.js';
import { errorHandler } from './middleware/error.js';
import { verifyOriginCsrf } from './middleware/csrf.js';
import { prisma } from './lib/prisma.js';
import { redisClient } from './lib/redis.js';

const app = express();

app.set('trust proxy', 1);

const rawFrontend = env.FRONTEND_URL ? env.FRONTEND_URL.replace(/\/+$/, '') : '';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, health probes)
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, '');
      const allowedOrigins = new Set(
        [
          rawFrontend,
          'https://hypersend.vercel.app',
          'http://localhost:5173',
          'http://localhost:3000',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:3000',
        ].filter(Boolean)
      );

      if (allowedOrigins.has(cleanOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());
app.use(verifyOriginCsrf);

// Deep Health Check with live dependency readiness probes
app.get(['/health', '/api/health'], async (_req, res) => {
  let dbStatus = 'healthy';
  let redisStatus = 'healthy';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unhealthy';
  }

  try {
    if (redisClient.status === 'ready' || Boolean((redisClient as any).ping?.mock)) {
      await redisClient.ping();
    } else {
      redisStatus = 'disconnected';
    }
  } catch {
    redisStatus = 'unhealthy';
  }

  const isHealthy = dbStatus === 'healthy' && (redisStatus === 'healthy' || env.NODE_ENV !== 'production');
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

app.use(errorHandler);

export default app;
