import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased for development/testing
  message: {
    success: false,
    error: {
      message: 'Too many login attempts, please try again later.',
    },
  },
  skipSuccessfulRequests: true,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Increased for development/testing
  message: {
    success: false,
    error: {
      message: 'Too many registration attempts, please try again later.',
    },
  },
});

