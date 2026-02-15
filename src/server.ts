import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { Server as SocketServer } from 'socket.io';
import { config } from './config/env';
import routes from './routes';
import { initializeSocketServer } from './services/socketHandler';
import { logger } from './utils/logger';
import prisma from './config/database';

const app = express();

// ngrok gibi reverse proxy kullanıldığında X-Forwarded-For header'ını doğru işlemek için gerekli
app.set('trust proxy', 1);
const httpServer = createServer(app);

// Global Socket.io instance
let io: SocketServer;

// Helper to notify users via socket
export const notifyUser = (target: string | string[], event: string, data: any) => {
  if (io) {
    const targets = Array.isArray(target) ? target : [target];
    const targetRooms: string[] = [];

    targets.forEach(t => {
      if (t === 'all_electricians' || t.startsWith('area:')) {
        targetRooms.push(t);
      } else {
        // Individual user ID - use their private room
        targetRooms.push(`user:${t}`);
      }
    });

    if (targetRooms.length > 0) {
      io.to(targetRooms).emit(event, data);
    }

    logger.info(`🔔 Socket Notification sent to ${Array.isArray(target) ? target.join(', ') : target}: ${event}`);
  } else {
    logger.warn('⚠️ Cannot send socket notification: io not initialized');
  }
};

// Initialize Socket Server
io = initializeSocketServer(httpServer);
app.set('io', io);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disallowed for local testing over HTTP
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
app.use(cors({
  origin: true,
  credentials: true,
}));

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/v1', routes);

// 404 handler
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.warn(`❌ [404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
});

// Error handling middleware (must be last)
import { errorHandler } from './middleware/errorHandler';
app.use(errorHandler);


const PORT = config.port || 3001;

async function startServer() {
  try {
    // Note: Database connection is handled in database.ts with a timeout
    // We just ensure we listen here
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 SERVER RESTARTED SUCCESFULLY - LEGAL READY on port ${PORT}`);
      logger.info(`🏠 Local: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();

export default app;
