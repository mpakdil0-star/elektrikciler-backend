import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import prisma, { isDatabaseAvailable } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    userType: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);

    let decoded: { id: string; email: string; userType: string };

    try {
      decoded = jwt.verify(token, config.jwtSecret) as {
        id: string;
        email: string;
        userType: string;
      };
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return next(new UnauthorizedError('Token expired'));
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return next(new UnauthorizedError('Invalid token'));
      }
      return next(new UnauthorizedError('Token verification failed'));
    }

    // FAST PATH: Skip Prisma if database is not available or user is mock
    if (!isDatabaseAvailable || decoded.id.startsWith('mock-')) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
      };
      return next();
    }

    // Check if user exists and is active
    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          userType: true,
          isActive: true,
          isBanned: true,
          banUntil: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      if (!user.isActive) {
        throw new UnauthorizedError('User account is inactive');
      }

      if (user.isBanned) {
        if (user.banUntil && user.banUntil > new Date()) {
          throw new ForbiddenError('User is banned');
        }
        // Ban expired, update user
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { isBanned: false, banUntil: null, banReason: null },
          });
        } catch (updateError) {
          // Ignore update errors (database might be down, but user is not banned anymore)
          console.warn('Failed to update user ban status:', updateError);
        }
      }

      req.user = {
        id: user.id,
        email: user.email,
        userType: user.userType,
      };

      next();
    } catch (dbError: any) {
      const dbMsg = dbError.message || '';
      const isConnectionError =
        dbError.code?.startsWith('P1') ||
        dbMsg.includes('connect') ||
        dbMsg.includes('database') ||
        dbMsg.includes('reach') ||
        dbMsg.includes('timeout') ||
        dbError.name?.includes('Prisma') ||
        dbError.name === 'PrismaClientInitializationError';

      // Database connection error or timeout - but token is valid, allow with decoded user info
      if (isConnectionError || (decoded && decoded.id && decoded.id.startsWith('mock-'))) {
        console.warn('⚠️ auth.ts: Database fail / Mock user, using token info as fallback');

        // Derive userType from ID suffix if not in token
        let fallbackUserType = decoded?.userType;
        if (!fallbackUserType && decoded?.id) {
          if (decoded.id.endsWith('-ELECTRICIAN')) {
            fallbackUserType = 'ELECTRICIAN';
          } else if (decoded.id.endsWith('-ADMIN')) {
            fallbackUserType = 'ADMIN';
          } else {
            fallbackUserType = 'CITIZEN';
          }
        }

        req.user = {
          id: decoded?.id || 'unknown',
          email: decoded?.email || 'unknown',
          userType: fallbackUserType || 'CITIZEN',
        };
        return next();
      } else {
        next(dbError);
      }
    }
  } catch (error) {
    next(error);
  }
};

// Optional authentication - token varsa decode eder, yoksa devam eder
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    // Token yoksa, direkt devam et (public endpoint)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    // Token varsa decode etmeyi dene, ama başarısız olursa da devam et
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        id: string;
        email: string;
        userType: string;
      };

      // FAST PATH: Skip Prisma if database is not available or user is mock
      if (!isDatabaseAvailable || decoded.id.startsWith('mock-')) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          userType: decoded.userType,
        };
        return next();
      }

      // Check if user exists and is active (skip if database is not available)
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            email: true,
            userType: true,
            isActive: true,
            isBanned: true,
            banUntil: true,
          },
        });

        if (user && user.isActive && (!user.isBanned || (user.banUntil && user.banUntil < new Date()))) {
          req.user = {
            id: user.id,
            email: user.email,
            userType: user.userType,
          };
        }
        // User yoksa veya aktif değilse, req.user undefined kalır ama devam eder
      } catch (dbError: any) {
        // Database connection error - continue without user (public endpoint)
        // Tüm database hatalarını ignore et
      }
    } catch (jwtError) {
      // Token geçersiz/expired - ama public endpoint olduğu için devam et
      // JWT hatalarını ignore et (JsonWebTokenError, TokenExpiredError, etc.)
    }

    // Her durumda devam et (public endpoint)
    next();
  } catch (error) {
    // Beklenmeyen hata olsa bile devam et (public endpoint)
    next();
  }
};

export const authorize = (...allowedTypes: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedTypes.includes(req.user.userType)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

