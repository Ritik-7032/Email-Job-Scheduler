import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

describe('Schedule API Validation & Auth (Requirement 1)', () => {
  const validUser = {
    id: 'user-test-123',
    email: 'test@reachinbox.ai',
    name: 'Test User',
    avatar: null,
  };

  const token = jwt.sign(validUser, env.JWT_SECRET);
  const authCookie = `token=${token}`;

  const futureIso = new Date(Date.now() + 3600000).toISOString();

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .send({
        subject: 'Hello',
        body: 'World',
        recipients: ['recipient@test.com'],
        startAt: futureIso,
        delayMs: 2000,
        hourlyLimit: 100,
      });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('Authentication required');
  });

  it('rejects invalid recipient email formats with 400', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', authCookie)
      .send({
        subject: 'Hello',
        body: 'World',
        recipients: ['not-a-valid-email'],
        startAt: futureIso,
        delayMs: 2000,
        hourlyLimit: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Validation failed');
    expect(res.body.error.details.some((d: any) => d.field.includes('recipients'))).toBe(true);
  });

  it('rejects past startAt timestamp with 400', async () => {
    const pastIso = new Date(Date.now() - 60000).toISOString();

    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', authCookie)
      .send({
        subject: 'Hello',
        body: 'World',
        recipients: ['valid@test.com'],
        startAt: pastIso,
        delayMs: 2000,
        hourlyLimit: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.field.includes('startAt'))).toBe(true);
  });

  it('rejects delay below MIN_DELAY_BETWEEN_EMAILS_MS with 400', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', authCookie)
      .send({
        subject: 'Hello',
        body: 'World',
        recipients: ['valid@test.com'],
        startAt: futureIso,
        delayMs: 500, // Below 2000ms
        hourlyLimit: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.field.includes('delayMs'))).toBe(true);
  });

  it('rejects hourlyLimit exceeding MAX_EMAILS_PER_HOUR with 400', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', authCookie)
      .send({
        subject: 'Hello',
        body: 'World',
        recipients: ['valid@test.com'],
        startAt: futureIso,
        delayMs: 2000,
        hourlyLimit: 500, // Exceeds 200
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.field.includes('hourlyLimit'))).toBe(true);
  });

  it('rejects empty subject and body with 400', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', authCookie)
      .send({
        subject: '',
        body: '',
        recipients: ['valid@test.com'],
        startAt: futureIso,
        delayMs: 2000,
        hourlyLimit: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });
});
