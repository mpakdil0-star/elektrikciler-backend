import { Request, Response, NextFunction } from 'express';
import { register, login, refreshToken, generateTokens, forgotPassword, resetPassword } from '../services/authService';
import { ValidationError, UnauthorizedError } from '../utils/errors';
import prisma, { isDatabaseAvailable } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { mockStorage } from '../utils/mockStorage';

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, fullName, phone, userType, serviceCategory, acceptedLegalVersion, marketingAllowed } = req.body;

    if (!email || !password || !fullName || !userType || !phone) {
      throw new ValidationError('Missing required fields');
    }

    try {
      const result = await register({
        email,
        password,
        fullName,
        phone,
        userType,
        serviceCategory, // Pass serviceCategory to register service
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (dbError: any) {
      const isConnectionError =
        dbError.message?.includes('connect') ||
        dbError.message?.includes('database') ||
        dbError.message?.includes('Can\'t reach database') ||
        dbError.code === 'P1001' ||
        dbError.code === 'P1017' ||
        dbError.name === 'PrismaClientInitializationError' ||
        dbError.constructor.name === 'PrismaClientInitializationError';

      if (isConnectionError) {
        console.warn('⚠️ Database connection failed, saving to persistent mock storage');
        // Make ID deterministic based on email AND userType
        const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '-');
        const mockUserId = `mock-user-${sanitizedEmail}-${userType}`;

        const allUsers = mockStorage.getAllUsers();

        // Email check
        if (allUsers.find(u => u.email === email)) {
          return res.status(409).json({
            success: false,
            error: {
              message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.',
              code: 'EMAIL_ALREADY_EXISTS'
            },
          });
        }

        // Phone check
        if (phone && allUsers.find(u => u.phone === phone)) {
          return res.status(409).json({
            success: false,
            error: {
              message: 'Bu telefon numarası ile kayıtlı bir kullanıcı zaten mevcut.',
              code: 'PHONE_ALREADY_EXISTS'
            },
          });
        }

        // Save user data to persistent mockStorage
        const userData = mockStorage.updateProfile(mockUserId, {
          fullName, email,
          phone: phone || '',
          passwordHash: password, // Store password in mock mode
          isVerified: userType === 'ELECTRICIAN' && !!phone,
          serviceCategory: userType === 'ELECTRICIAN' ? (serviceCategory || 'elektrik') : undefined, // Save profession
          userType: userType, // Explicitly save userType
          acceptedLegalVersion,
          marketingAllowed: !!marketingAllowed,
        });

        const tokens = generateTokens({ id: mockUserId, email, userType });

        return res.status(201).json({
          success: true,
          data: {
            user: mockStorage.getFullUser(mockUserId, userType),
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          },
        });
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    try {
      const result = await login({ email, password });

      res.json({
        success: true,
        data: result,
      });
    } catch (dbError: any) {
      const isConnectionError =
        dbError.message?.includes('connect') ||
        dbError.message?.includes('database') ||
        dbError.message?.includes('Can\'t reach database') ||
        dbError.code === 'P1001' ||
        dbError.code === 'P1017' ||
        dbError.name === 'PrismaClientInitializationError' ||
        dbError.constructor.name === 'PrismaClientInitializationError';

      if (isConnectionError) {
        console.warn('⚠️ Database connection failed, checking mock storage for login');

        // Check if user exists in mockStorage
        const allMockUsers = mockStorage.getAllUsers();
        const existingUser = allMockUsers.find(u => u.email === email);

        if (!existingUser) {
          // User not found - they need to register first
          return res.status(401).json({
            success: false,
            error: {
              message: 'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı. Lütfen önce kayıt olun.',
              code: 'USER_NOT_FOUND'
            },
          });
        }

        // Validate password in mock mode
        if (existingUser.passwordHash && existingUser.passwordHash !== password) {
          return res.status(401).json({
            success: false,
            error: {
              message: 'Girdiğiniz şifre hatalı. Lütfen kontrol edip tekrar deneyin.',
              code: 'INVALID_CREDENTIALS'
            },
          });
        }

        // User exists - use their ACTUAL id and userType from mockStorage
        const mockUserId = existingUser.id;
        const mockUserType = existingUser.userType;

        console.log(`✅ Mock login successful: ${mockUserId} as ${mockUserType}`);

        // Generate tokens with correct user data
        const tokens = generateTokens({ id: mockUserId, email, userType: mockUserType });

        // IMPORTANT: Use getFullUser to get complete user data INCLUDING electricianProfile
        const fullUser = mockStorage.getFullUser(mockUserId, mockUserType);

        // DEBUG: Log what we're sending back
        console.log('📦 LOGIN RESPONSE DEBUG:', {
          userId: mockUserId,
          userType: mockUserType,
          hasElectricianProfile: !!fullUser.electricianProfile,
          experienceYears: fullUser.electricianProfile?.experienceYears,
          specialtiesCount: fullUser.electricianProfile?.specialties?.length,
          specialties: fullUser.electricianProfile?.specialties,
        });

        return res.json({
          success: true,
          data: {
            user: fullUser,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            currentLegalVersion: 'v1.0', // Latest version in mock mode
          },
        });
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
};

export const refreshTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      throw new ValidationError('Refresh token is required');
    }

    try {
      const tokens = await refreshToken(token);

      res.json({
        success: true,
        data: tokens,
      });
    } catch (error: any) {
      // Hata loglama
      console.error('❌ Refresh token error:', error.message);
      if (error instanceof UnauthorizedError) {
        console.error('   Reason: UnauthorizedError - token invalid or expired');
      } else {
        console.error('   Error type:', error.constructor?.name);
        console.error('   Error details:', error);
      }

      // UnauthorizedError ise (token geçersiz), olduğu gibi döndür
      if (error instanceof UnauthorizedError || (error instanceof Error && error.message.includes('Invalid refresh token'))) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid or expired refresh token',
          },
        });
      }

      // Diğer hataları next'e gönder
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const meController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    // 1. Try real database first if available
    if (isDatabaseAvailable) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: {
            id: true,
            email: true,
            fullName: true,
            city: true,
            phone: true,
            userType: true,
            profileImageUrl: true,
            isVerified: true,
            createdAt: true,
            updatedAt: true,
            electricianProfile: true, // Profile ve bakiye bilgisini ekle
          },
        });

        if (user) {
          return res.json({
            success: true,
            data: {
              user,
              currentLegalVersion: 'v1.0'
            },
          });
        }
        // If user not found in DB but ID starts with mock-, it might be in mockStorage
      } catch (dbError) {
        console.warn('⚠️ Database fetch failed in meController, falling back to mockStorage');
      }
    }

    // 2. Fallback to mockStorage
    const userData = mockStorage.getFullUser(req.user.id, req.user.userType);
    return res.json({
      success: true,
      data: {
        user: userData,
        currentLegalVersion: 'v1.0'
      },
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;
    if (!email) throw new ValidationError('Email is required');

    const result = await forgotPassword(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const resetPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      throw new ValidationError('Missing required fields');
    }

    const result = await resetPassword({ email, code, newPassword });
    res.json(result);
  } catch (error) {
    next(error);
  }
};
