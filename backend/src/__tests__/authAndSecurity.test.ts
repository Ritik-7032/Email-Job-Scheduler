import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

describe('Authentication, CSRF Protection, and Security Boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('OWASP CSRF Defense (Origin Verification)', () => {
    it('blocks state-changing POST requests from untrusted origins with 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/auth/demo')
        .set('Origin', 'https://malicious-attacker.com')
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('CSRF origin check failed');
    });

    it('allows state-changing POST requests from trusted production and local origins', async () => {
      vi.spyOn(prisma.user, 'create').mockResolvedValue({
        id: 'mock-demo-id',
        googleId: 'demo-guest-123',
        name: 'Demo Guest',
        email: 'guest-123@demo.hypersend.internal',
        avatar: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const response = await request(app)
        .post('/api/auth/demo')
        .set('Origin', 'https://hypersend.vercel.app')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
    });

    it('permits safe GET requests regardless of origin', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }] as any);
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://random-read-only-site.com');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('Deep Health & Dependency Readiness Probes', () => {
    it('returns status ok with healthy services when DB and Redis are responsive', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }] as any);
      (redisClient as any).ping = vi.fn().mockResolvedValue('PONG');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.services.database).toBe('healthy');
      expect(response.body.services.redis).toBe('healthy');
    });

    it('returns status 503 degraded when database connectivity fails', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Connection terminated'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.services.database).toBe('unhealthy');
    });
  });

  describe('Session Token & Cookie Boundaries', () => {
    it('authenticates user from signed HTTP-only cookie', async () => {
      const mockUser = {
        id: 'user-uuid-1',
        email: 'alex@example.com',
        name: 'Alex Developer',
        avatar: 'https://example.com/avatar.png',
      };

      const validCookieToken = jwt.sign(mockUser, env.JWT_SECRET, { expiresIn: '1h' });
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...mockUser,
        googleId: 'google-sub-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`token=${validCookieToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('alex@example.com');
    });

    it('rejects invalid or expired token with 401 and clears cookie', async () => {
      const invalidToken = 'invalid.bearer.jwt.payload';

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`token=${invalidToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Invalid or expired authentication token');
    });

    it('logs out and clears authentication cookie with secure flags', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
      const cookieHeader = response.headers['set-cookie'][0];
      expect(cookieHeader).toContain('token=;');
      expect(cookieHeader).toContain('HttpOnly');
    });
  });
});
