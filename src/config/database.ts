import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// DATABASE URL parametrelerini düzenle (Timeout eklemek için)
const databaseUrl = process.env.DATABASE_URL;
let finalUrl = databaseUrl;

if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
  finalUrl = databaseUrl.includes('?')
    ? `${databaseUrl}&connect_timeout=2`
    : `${databaseUrl}?connect_timeout=2`;
}

const prisma = new PrismaClient({
  ...(finalUrl ? {
    datasources: {
      db: {
        url: finalUrl,
      },
    },
  } : {}),
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Global flag to track database availability
// Starts as false, becomes true only after successful connection
export let isDatabaseAvailable = false;

// Test database connection at startup (async, non-blocking)
// Server başlatılmasını engellemez
const connectWithRetry = async (retryCount = 0) => {
  const retryLimit = 20;
  const retryInterval = 5000; // 5 saniye

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not defined');
    }

    logger.info(`🔄 Database connection attempt ${retryCount + 1}/${retryLimit}...`);
    await prisma.$connect();
    isDatabaseAvailable = true;
    logger.info('✅ Database connected successfully');
  } catch (error: any) {
    if (!process.env.DATABASE_URL) {
      isDatabaseAvailable = false;
      logger.info('⚠️  DATABASE_URL missing. Switching to MOCK STORAGE MODE.');
      return;
    }

    if (retryCount < retryLimit) {
      logger.warn(`⚠️ Database connection failed. Retrying in ${retryInterval / 1000}s...`);
      setTimeout(() => connectWithRetry(retryCount + 1), retryInterval);
    } else {
      isDatabaseAvailable = false;
      logger.error('❌ Database connection failed after maximum retries.');
      logger.info('⚠️ Switching to MOCK STORAGE MODE as fallback.');
    }
  }
};

// Start connection logic
setTimeout(() => connectWithRetry(), 500);

// Graceful shutdown
process.on('beforeExit', async () => {
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore
  }
});

export default prisma;
