import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma, { isDatabaseAvailable } from '../config/database';
import { config } from '../config/env';
import { ValidationError, UnauthorizedError, ConflictError } from '../utils/errors';
import { UserType } from '@prisma/client';

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  userType: UserType;
  serviceCategory?: string; // Profession category: 'elektrik' | 'cilingir' | 'klima' | 'beyaz-esya' | 'tesisat'
  acceptedLegalVersion?: string;
  marketingAllowed?: boolean;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  userType: string;
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateTokens = (payload: TokenPayload) => {
  const accessToken = jwt.sign(
    payload as object,
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    payload as object,
    config.jwtRefreshSecret,
    {
      expiresIn: config.jwtRefreshExpiresIn,
    } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
};

export const register = async (data: RegisterData) => {
  const { email, password, fullName, phone, userType } = data;

  // Check if user exists (Mock check first)
  if (!isDatabaseAvailable) {
    const { mockStorage } = require('../utils/mockStorage');
    const existingMockId = `mock-user-${email.replace(/[@.]/g, '-')}-${userType}`;

    // Check for duplicates in mock mode
    const allUsers = mockStorage.getAllUsers();
    const existingEmailUser = allUsers.find((u: any) => u.email === email);

    if (existingEmailUser) {
      console.log(`🔍 Debug Register: Found existing user ${email}. isActive: ${existingEmailUser.isActive}, Type: ${typeof existingEmailUser.isActive}`);

      // Eğer hesap silinmişse, kullanıcının yeniden kayıt olmasına izin ver (eski veriyi sıfırla)
      if (existingEmailUser.isActive === false) {
        console.log(`♻️ Resetting deleted account for ${email}, allowing fresh registration`);
        // Eski hesap ID'sini kullanarak veriyi tamamen sıfırla
        // Yeni kayıt akışı devam edecek ve eski veriyi override edecek
      } else {
        throw new ConflictError('Bu e-posta adresi zaten kullanımda.');
      }
    }

    if (phone) {
      const existingPhoneUser = allUsers.find((u: any) => u.phone === phone);
      if (existingPhoneUser) {
        // Eğer telefon numarası silinmiş bir hesaba aitse, yeniden kayda izin ver
        if (existingPhoneUser.isActive === false) {
          console.log(`♻️ Phone ${phone} belongs to deleted account, allowing re-registration`);
        } else {
          throw new ConflictError('Bu telefon numarası zaten kullanımda.');
        }
      }
    }

    // Create new mock user with REAL data provided
    const user = {
      id: existingMockId,
      email,
      fullName: fullName || 'İsimsiz Kullanıcı',
      phone: phone || '', // Use the REAL provided phone
      userType,
      isVerified: userType === UserType.ELECTRICIAN && !!phone,
      profileImageUrl: null,
      createdAt: new Date(),
    };

    // Save to mock storage immediately
    // IMPORTANT: Set isActive: true to reactivate deleted accounts
    mockStorage.updateProfile(user.id, {
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      isVerified: user.isVerified,
      passwordHash: await hashPassword(password),
      experienceYears: 0,
      creditBalance: userType === UserType.ELECTRICIAN ? 5 : 0,
      isActive: true, // Mark account as active
      userType: userType, // Save userType directly to prevent future issues
      serviceCategory: userType === UserType.ELECTRICIAN ? (data.serviceCategory || 'elektrik') : undefined, // Save profession
      acceptedLegalVersion: data.acceptedLegalVersion,
      marketingAllowed: data.marketingAllowed,
    });

    // Create initial bonus transaction in mock storage
    if (userType === UserType.ELECTRICIAN) {
      const { mockTransactionStorage } = require('../utils/mockStorage');
      mockTransactionStorage.addTransaction({
        userId: user.id,
        amount: 5,
        transactionType: 'BONUS',
        description: 'Hoş geldin hediyesi',
        balanceAfter: 5
      });
    }

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      userType: user.userType,
    });

    // IMPORTANT: Get full user data including electricianProfile for the client
    const fullUser = mockStorage.getFullUser(user.id, user.userType);

    console.log('✅ Registered via Mock Storage:', user.email);
    return { user: fullUser, ...tokens };
  }

  // Check if user exists (DB)
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        ...(phone ? [{ phone }] : []),
      ],
    },
  });

  if (existingUser) {
    // Eğer silinmiş hesap varsa, yeniden kayda izin ver (veriler sıfırlanacak)
    if (!existingUser.isActive) {
      console.log(`♻️ DB: Allowing re-registration for deleted account ${email}`);
      // Eski kullanıcıyı tamamen sil, yeni kayıt oluşturulsun
      await prisma.user.delete({
        where: { id: existingUser.id }
      });
    } else {
      throw new ConflictError('User with this email or phone already exists');
    }
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  try {
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        userType,
        isVerified: userType === UserType.ELECTRICIAN && !!phone,
        acceptedLegalVersion: data.acceptedLegalVersion || null,
        marketingAllowed: data.marketingAllowed || false,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        userType: true,
        profileImageUrl: true,
        isVerified: true,
        createdAt: true,
      },
    });

    // Record formal consent in UserConsent table/mock
    const acceptedVersion = data.acceptedLegalVersion || 'v1.0';
    if (!isDatabaseAvailable) {
      const { mockStorage } = require('../utils/mockStorage');
      mockStorage.addConsent({
        userId: user.id,
        documentType: 'KVKK',
        documentVersion: acceptedVersion,
        action: 'ACCEPTED'
      });
      mockStorage.addConsent({
        userId: user.id,
        documentType: 'TERMS',
        documentVersion: acceptedVersion,
        action: 'ACCEPTED'
      });
      if (data.marketingAllowed) {
        mockStorage.addConsent({
          userId: user.id,
          documentType: 'MARKETING',
          documentVersion: acceptedVersion,
          action: 'ACCEPTED'
        });
      }
    } else {
      await prisma.userConsent.createMany({
        data: [
          { userId: user.id, documentType: 'KVKK', documentVersion: acceptedVersion, action: 'ACCEPTED' },
          { userId: user.id, documentType: 'TERMS', documentVersion: acceptedVersion, action: 'ACCEPTED' },
          ...(data.marketingAllowed ? [{ userId: user.id, documentType: 'MARKETING', documentVersion: acceptedVersion, action: 'ACCEPTED' }] : [])
        ]
      });
    }

    // Create electrician profile if user is electrician
    if (userType === UserType.ELECTRICIAN) {
      await prisma.electricianProfile.create({
        data: {
          userId: user.id,
          creditBalance: 5, // Bonus for phone verification (which is now mandatory)
          isAvailable: true,
          experienceYears: 0,
          totalReviews: 0,
          ratingAverage: 0,
          completedJobsCount: 0,
          serviceCategory: data.serviceCategory || 'elektrik', // Save profession/service category
        },
      });

      // Create initial bonus transaction in DB
      await prisma.credit.create({
        data: {
          userId: user.id,
          amount: 5,
          transactionType: 'BONUS',
          description: 'Hoş geldin hediyesi',
          balanceAfter: 5
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      userType: user.userType,
    });

    return {
      user,
      ...tokens,
    };
  } catch (error: any) {
    // Database error fallback
    console.warn('⚠️ Database registration failed, falling back to mock storage', error);

    const { mockStorage } = require('../utils/mockStorage');
    const existingMockId = `mock-user-${email.replace(/[@.]/g, '-')}-${userType}`;

    // Save to mock storage
    mockStorage.updateProfile(existingMockId, {
      fullName: fullName || 'İsimsiz Kullanıcı',
      phone: phone || '',
      email: email,
      isVerified: userType === UserType.ELECTRICIAN && !!phone,
      passwordHash: passwordHash, // Use hashed password
      experienceYears: 0,
      creditBalance: userType === UserType.ELECTRICIAN ? 5 : 0,
      userType: userType, // Save userType directly
      serviceCategory: userType === UserType.ELECTRICIAN ? (data.serviceCategory || 'elektrik') : undefined, // Save profession
      acceptedLegalVersion: data.acceptedLegalVersion,
      marketingAllowed: data.marketingAllowed,
    });

    // Create initial bonus transaction in mock storage (DB fallback)
    if (userType === UserType.ELECTRICIAN) {
      const { mockTransactionStorage } = require('../utils/mockStorage');
      mockTransactionStorage.addTransaction({
        userId: existingMockId,
        amount: 5,
        transactionType: 'BONUS',
        description: 'Hoş geldin hediyesi',
        balanceAfter: 5
      });
    }

    const user = {
      id: existingMockId,
      email,
      fullName: fullName || 'İsimsiz Kullanıcı',
      phone: phone || '',
      userType,
      isVerified: userType === UserType.ELECTRICIAN && !!phone,
      profileImageUrl: null,
      createdAt: new Date(),
    };

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      userType: user.userType,
    });

    // IMPORTANT: Get full user data including electricianProfile for the client
    const fullUser = mockStorage.getFullUser(user.id, user.userType);

    return { user: fullUser, ...tokens };
  }
};

export const login = async (data: LoginData) => {
  const { email, password } = data;

  try {
    // Veritabanı yoksa direkt mock moduna geç
    if (!isDatabaseAvailable) {
      throw new Error('DATABASE_NOT_CONNECTED');
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Block login for deleted accounts
    if (!user.isActive) {
      throw new UnauthorizedError('Bu hesap silinmiş. Yeniden kayıt olmanız gerekiyor.');
    }

    if (user.isBanned) {
      if (user.banUntil && user.banUntil > new Date()) {
        throw new UnauthorizedError('Account is banned');
      }
      // Ban expired, update
      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: false, banUntil: null, banReason: null },
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      userType: user.userType,
    });

    // Get user profile
    const userProfile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        userType: true,
        profileImageUrl: true,
        isVerified: true,
        createdAt: true,
        electricianProfile: true,
      },
    });

    return {
      user: userProfile,
      ...tokens,
    };
  } catch (dbError: any) {
    const isConnectionError =
      !isDatabaseAvailable ||
      dbError.message?.includes('connect') ||
      dbError.message?.includes('database') ||
      dbError.message?.includes("Can't reach database") ||
      dbError.message?.includes("DATABASE_NOT_CONNECTED") ||
      dbError.code === 'P1001' ||
      dbError.code === 'P1017' ||
      dbError.name === 'PrismaClientInitializationError' ||
      dbError.constructor?.name === 'PrismaClientInitializationError';

    if (isConnectionError) {
      console.warn('⚠️ Database login failed, checking mock storage');
      const { mockStorage } = require('../utils/mockStorage');

      // Email'den mock ID bul
      const allUsers = mockStorage.getAllUsers();
      const mockUser = allUsers.find((u: any) => u.email === email);

      if (!mockUser) {
        throw new UnauthorizedError('Bu e-posta ile kayıtlı kullanıcı bulunamadı.');
      }

      // Block login for deleted accounts
      if (mockUser.isActive === false) {
        throw new UnauthorizedError('Bu hesap silinmiş. Yeniden kayıt olmanız gerekiyor.');
      }

      // Şifre kontrolü
      if (mockUser.passwordHash) {
        console.log(`🔐 Mock login password check for ${email}:`);
        console.log(`   passwordHash starts with: ${mockUser.passwordHash.substring(0, 10)}...`);
        console.log(`   passwordHash length: ${mockUser.passwordHash.length}`);
        console.log(`   is bcrypt hash: ${mockUser.passwordHash.startsWith('$2')}`);

        let isPasswordValid = false;

        // Önce bcrypt ile dene (register bcrypt hash kaydediyor)
        if (mockUser.passwordHash.startsWith('$2')) {
          try {
            isPasswordValid = await comparePassword(password, mockUser.passwordHash);
            console.log(`   bcrypt compare result: ${isPasswordValid}`);
          } catch (bcryptError: any) {
            console.error(`   ❌ bcrypt compare error: ${bcryptError.message}`);
          }
        }

        // bcrypt başarısız olduysa düz metin ile dene (eski demo hesaplar için)
        if (!isPasswordValid) {
          isPasswordValid = mockUser.passwordHash === password;
          console.log(`   plain text compare result: ${isPasswordValid}`);
        }

        if (!isPasswordValid) {
          throw new UnauthorizedError('E-posta veya şifre hatalı.');
        }
      }

      const tokens = generateTokens({
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      });

      const userResponse = {
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        phone: mockUser.phone,
        userType: mockUser.userType,
        profileImageUrl: mockUser.profileImageUrl || null,
        isVerified: mockUser.isVerified || false,
        createdAt: new Date(),
      };

      return { user: userResponse, ...tokens };
    }

    throw dbError;
  }
};

export const refreshToken = async (refreshToken: string) => {
  try {
    let decoded: TokenPayload;
    try {
      decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as TokenPayload;
      console.log('✅ Refresh token verified successfully for user:', decoded.id);
    } catch (jwtError: any) {
      console.error('❌ JWT verification failed:', jwtError.name, jwtError.message);
      if (jwtError.name === 'TokenExpiredError') {
        console.error('   Token expired at:', jwtError.expiredAt);
      }
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Veritabanı yoksa direkt mock moduna geç, Prisma timeout'unu bekleme
    if (!isDatabaseAvailable) {
      console.warn('⚠️ Database not connected, skipping DB check for refresh');
      const tokens = generateTokens({
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
      });
      return tokens;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          userType: true,
          isActive: true,
          isBanned: true,
        },
      });

      if (!user || !user.isActive || user.isBanned) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        userType: user.userType,
      });

      return tokens;
    } catch (dbError: any) {
      const isConnectionError =
        dbError.message?.includes('connect') ||
        dbError.message?.includes('database') ||
        dbError.message?.includes('Can\'t reach database') ||
        dbError.code === 'P1001' ||
        dbError.code === 'P1017' ||
        dbError.name === 'PrismaClientInitializationError' ||
        dbError.constructor.name === 'PrismaClientInitializationError';

      // Database bağlantı hatası varsa, token'dan user bilgisini kullan (mock mode)
      if (isConnectionError || decoded.id.startsWith('mock-')) {
        console.warn('⚠️ Database connection failed, using token user info for refresh');
        const tokens = generateTokens({
          id: decoded.id,
          email: decoded.email,
          userType: decoded.userType,
        });
        return tokens;
      }

      // Diğer hatalar için orijinal hatayı fırlat
      throw dbError;
    }
  } catch (error: any) {
    // UnauthorizedError'ları olduğu gibi fırlat
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid refresh token');
  }
};

/**
 * Forgot Password - Send recovery code
 */
export const forgotPassword = async (email: string) => {
  // In a real app, you would send an email. For now, we'll use a fixed code for mock/demo
  const recoveryCode = '123456';

  if (!isDatabaseAvailable) {
    const { mockStorage } = require('../utils/mockStorage');
    const allUsers = mockStorage.getAllUsers();
    const user = allUsers.find((u: { email: string }) => u.email === email);
    if (!user) {
      throw new ValidationError('Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı.');
    }
    return { success: true, message: 'Kurtarma kodu gönderildi (Mock: 123456)' };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ValidationError('Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı.');
  }

  // Real DB logic would store the code and expiry
  return { success: true, message: 'Kurtarma kodu gönderildi (Test: 123456)' };
};

/**
 * Reset Password - Verify code and update password
 */
export const resetPassword = async (data: any) => {
  const { email, code, newPassword } = data;

  if (code !== '123456') {
    throw new ValidationError('Geçersiz kurtarma kodu.');
  }

  const passwordHash = await hashPassword(newPassword);

  if (!isDatabaseAvailable) {
    const { mockStorage } = require('../utils/mockStorage');
    const allUsers = mockStorage.getAllUsers();
    const user = allUsers.find((u: { id: string, email: string }) => u.email === email);
    if (!user) throw new ValidationError('Kullanıcı bulunamadı.');

    mockStorage.updateProfile(user.id, { passwordHash });
    return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
  }

  await prisma.user.update({
    where: { email },
    data: { passwordHash }
  });

  return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
};
