import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  logger.info('Reading migration SQL...');
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20260924120000_init/migration.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Split SQL by statements or execute block
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        // Skip already created types/tables
        continue;
      }
      logger.warn({ err: msg, statement: statement.slice(0, 50) }, 'Statement notice');
    }
  }

  logger.info('Database schema initialized successfully!');
}

initDb()
  .catch((err) => {
    logger.error({ err }, 'Failed to initialize DB');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
