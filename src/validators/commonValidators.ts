import { validationResult, ValidationChain, param, query } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Validation sonuçlarını kontrol eden middleware
 * Hata varsa 400 Bad Request döner
 */
export const validate = (validations: ValidationChain[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Tüm validasyonları çalıştır
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        // Hataları formatla
        const formattedErrors = errors.array().map(err => ({
            field: (err as any).path || (err as any).param,
            message: err.msg,
        }));

        return res.status(400).json({
            success: false,
            error: {
                message: 'Geçersiz veri gönderildi',
                code: 'VALIDATION_ERROR',
                details: formattedErrors,
            },
        });
    };
};

/**
 * ID parametresi validasyonu (UUID formatı veya mock-* formatı)
 */
export const validateIdParam = (paramName: string = 'id') => [
    param(paramName)
        .notEmpty()
        .withMessage('ID parametresi gerekli')
        .custom((value) => {
            // UUID formatı veya mock-* formatı kabul et
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const mockRegex = /^mock-/;
            if (!uuidRegex.test(value) && !mockRegex.test(value)) {
                throw new Error('Geçersiz ID formatı');
            }
            return true;
        }),
];

/**
 * Pagination query parametreleri validasyonu
 */
export const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Sayfa numarası 1 veya daha büyük olmalı')
        .toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit 1-100 arasında olmalı')
        .toInt(),
];
