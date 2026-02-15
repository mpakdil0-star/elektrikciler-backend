import { body } from 'express-validator';

/**
 * Kayıt validasyonu
 */
export const registerValidation = [
    body('email')
        .notEmpty()
        .withMessage('E-posta adresi gerekli')
        .isEmail()
        .withMessage('Geçerli bir e-posta adresi girin')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Şifre gerekli')
        .isLength({ min: 6 })
        .withMessage('Şifre en az 6 karakter olmalıdır'),

    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('Ad soyad gerekli')
        .isLength({ min: 2, max: 100 })
        .withMessage('Ad soyad 2-100 karakter arasında olmalıdır'),

    body('phone')
        .notEmpty()
        .withMessage('Telefon numarası gerekli')
        .matches(/^[0-9]{10,11}$/)
        .withMessage('Geçerli bir telefon numarası girin (10-11 rakam)'),

    body('userType')
        .notEmpty()
        .withMessage('Kullanıcı tipi gerekli')
        .isIn(['CITIZEN', 'ELECTRICIAN'])
        .withMessage('Kullanıcı tipi CITIZEN veya ELECTRICIAN olmalıdır'),

    body('serviceCategory')
        .optional()
        .isIn(['elektrik', 'cilingir', 'klima', 'beyaz-esya', 'tesisat'])
        .withMessage('Geçersiz hizmet kategorisi'),

    body('acceptedLegalVersion')
        .optional()
        .isString(),

    body('marketingAllowed')
        .optional()
        .isBoolean(),
];

/**
 * Giriş validasyonu
 */
export const loginValidation = [
    body('email')
        .notEmpty()
        .withMessage('E-posta adresi gerekli')
        .isEmail()
        .withMessage('Geçerli bir e-posta adresi girin')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Şifre gerekli'),
];

/**
 * Token yenileme validasyonu
 */
export const refreshTokenValidation = [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token gerekli'),
];

/**
 * Şifre sıfırlama isteği validasyonu
 */
export const forgotPasswordValidation = [
    body('email')
        .notEmpty()
        .withMessage('E-posta adresi gerekli')
        .isEmail()
        .withMessage('Geçerli bir e-posta adresi girin')
        .normalizeEmail(),
];

/**
 * Şifre sıfırlama validasyonu
 */
export const resetPasswordValidation = [
    body('email')
        .notEmpty()
        .withMessage('E-posta adresi gerekli')
        .isEmail()
        .withMessage('Geçerli bir e-posta adresi girin')
        .normalizeEmail(),

    body('code')
        .notEmpty()
        .withMessage('Doğrulama kodu gerekli'),

    body('newPassword')
        .notEmpty()
        .withMessage('Yeni şifre gerekli')
        .isLength({ min: 6 })
        .withMessage('Şifre en az 6 karakter olmalıdır'),
];
