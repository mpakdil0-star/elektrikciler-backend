import { body } from 'express-validator';

/**
 * Profil güncelleme validasyonu
 */
export const updateProfileValidation = [
    body('fullName')
        .optional()
        .isLength({ min: 2, max: 100 })
        .withMessage('Ad soyad 2-100 karakter arasında olmalıdır')
        .trim(),

    body('phone')
        .optional()
        .matches(/^[0-9]{10,11}$/)
        .withMessage('Geçerli bir telefon numarası girin (10-11 rakam)'),

    body('city')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Şehir ismi en fazla 100 karakter olabilir')
        .trim(),

    body('bio')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Biyografi en fazla 500 karakter olabilir')
        .trim(),

    body('experienceYears')
        .optional()
        .isInt({ min: 0, max: 50 })
        .withMessage('Deneyim yılı 0-50 arasında olmalıdır'),

    body('specialties')
        .optional()
        .isArray()
        .withMessage('Uzmanlıklar dizi formatında olmalıdır'),

    body('hourlyRate')
        .optional()
        .isNumeric()
        .withMessage('Saatlik ücret sayısal bir değer olmalıdır'),

    body('minimumCharge')
        .optional()
        .isNumeric()
        .withMessage('Minimum ücret sayısal bir değer olmalıdır'),
];

/**
 * Şifre değiştirme validasyonu
 */
export const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Mevcut şifre gerekli'),

    body('newPassword')
        .notEmpty()
        .withMessage('Yeni şifre gerekli')
        .isLength({ min: 6 })
        .withMessage('Yeni şifre en az 6 karakter olmalıdır')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('Yeni şifre mevcut şifreden farklı olmalıdır');
            }
            return true;
        }),
];

/**
 * Push token güncelleme validasyonu
 */
export const updatePushTokenValidation = [
    body('pushToken')
        .notEmpty()
        .withMessage('Push token gerekli')
        .isString()
        .withMessage('Push token metin formatında olmalıdır'),
];

/**
 * Bildirim tercihleri güncelleme validasyonu
 */
export const updateNotificationPreferencesValidation = [
    body('push')
        .optional()
        .isBoolean()
        .withMessage('Push tercihi boolean olmalıdır'),

    body('email')
        .optional()
        .isBoolean()
        .withMessage('Email tercihi boolean olmalıdır'),

    body('sms')
        .optional()
        .isBoolean()
        .withMessage('SMS tercihi boolean olmalıdır'),
];
