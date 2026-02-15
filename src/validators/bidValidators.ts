import { body } from 'express-validator';

/**
 * Teklif oluşturma validasyonu
 */
export const createBidValidation = [
    body('jobPostId')
        .notEmpty()
        .withMessage('İş ilanı ID gerekli'),

    body('amount')
        .notEmpty()
        .withMessage('Teklif tutarı gerekli')
        .isNumeric()
        .withMessage('Teklif tutarı sayısal bir değer olmalıdır')
        .custom((value) => {
            if (parseFloat(value) <= 0) {
                throw new Error('Teklif tutarı 0\'dan büyük olmalıdır');
            }
            return true;
        }),

    body('estimatedDuration')
        .notEmpty()
        .withMessage('Tahmini süre gerekli')
        .isInt({ min: 1 })
        .withMessage('Tahmini süre en az 1 saat olmalıdır'),

    body('message')
        .notEmpty()
        .withMessage('Teklif mesajı gerekli')
        .isLength({ min: 10, max: 1000 })
        .withMessage('Teklif mesajı 10-1000 karakter arasında olmalıdır')
        .trim(),

    body('estimatedStartDate')
        .optional()
        .isISO8601()
        .withMessage('Geçerli bir tarih formatı girin'),
];

/**
 * Teklif güncelleme validasyonu
 */
export const updateBidValidation = [
    body('amount')
        .optional()
        .isNumeric()
        .withMessage('Teklif tutarı sayısal bir değer olmalıdır')
        .custom((value) => {
            if (value !== undefined && parseFloat(value) <= 0) {
                throw new Error('Teklif tutarı 0\'dan büyük olmalıdır');
            }
            return true;
        }),

    body('estimatedDuration')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Tahmini süre en az 1 saat olmalıdır'),

    body('message')
        .optional()
        .isLength({ min: 10, max: 1000 })
        .withMessage('Teklif mesajı 10-1000 karakter arasında olmalıdır')
        .trim(),

    body('estimatedStartDate')
        .optional()
        .isISO8601()
        .withMessage('Geçerli bir tarih formatı girin'),
];
