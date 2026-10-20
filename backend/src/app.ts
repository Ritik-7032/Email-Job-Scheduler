import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { emailRoutes } from './routes/emailRoutes.js';
import { errorHandler } from './middleware/error.js';

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
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

app.use(errorHandler);

export default app;
