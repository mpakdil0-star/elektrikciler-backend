import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        ...(config.nodeEnv === 'development' && { stack: err.stack }),
      },
    });
  }

  // Unexpected errors - log detailed information
  logger.error('Unexpected error:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    url: req.url,
    method: req.method,
  });

  // Prisma specific error handling
  const prismaError = err as any;
  if (prismaError.code) {
    logger.error('Prisma error code:', prismaError.code);
    
    if (prismaError.code === 'P1001' || prismaError.code === 'P1017') {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Database connection error. Please check your database configuration.',
          details: config.nodeEnv === 'development' ? err.message : undefined,
        },
      });
    }
  }

  return res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      ...(config.nodeEnv === 'development' && { 
        stack: err.stack,
        details: err.message,
      }),
    },
  });
};

