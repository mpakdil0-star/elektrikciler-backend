import { body } from 'express-validator';

/**
 * İş ilanı oluşturma validasyonu
 */
export const createJobValidation = [
    body('title')
        .notEmpty()
        .withMessage('İlan başlığı gerekli')
        .isLength({ min: 5, max: 200 })
        .withMessage('Başlık 5-200 karakter arasında olmalıdır')
        .trim(),

    body('description')
        .notEmpty()
        .withMessage('İlan açıklaması gerekli')
        .isLength({ min: 10, max: 2000 })
        .withMessage('Açıklama 10-2000 karakter arasında olmalıdır')
        .trim(),

    body('category')
        .notEmpty()
        .withMessage('Kategori seçimi gerekli'),

    body('serviceCategory')
        .optional()
        .isIn(['elektrik', 'cilingir', 'klima', 'beyaz-esya', 'tesisat'])
        .withMessage('Geçersiz hizmet kategorisi'),

    body('location')
        .notEmpty()
        .withMessage('Konum bilgisi gerekli'),

    body('location.city')
        .notEmpty()
        .withMessage('Şehir seçimi gerekli'),

    body('location.district')
        .notEmpty()
        .withMessage('İlçe seçimi gerekli'),

    body('urgencyLevel')
        .optional()
        .isIn(['LOW', 'MEDIUM', 'HIGH'])
        .withMessage('Aciliyet seviyesi LOW, MEDIUM veya HIGH olmalıdır'),

    body('estimatedBudget')
        .optional()
        .isNumeric()
        .withMessage('Bütçe sayısal bir değer olmalıdır'),

    body('images')
        .optional()
        .isArray({ max: 5 })
        .withMessage('En fazla 5 resim yüklenebilir'),
];

/**
 * İş ilanı güncelleme validasyonu
 */
export const updateJobValidation = [
    body('title')
        .optional()
        .isLength({ min: 5, max: 200 })
        .withMessage('Başlık 5-200 karakter arasında olmalıdır')
        .trim(),

    body('description')
        .optional()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Açıklama 10-2000 karakter arasında olmalıdır')
        .trim(),

    body('urgencyLevel')
        .optional()
        .isIn(['LOW', 'MEDIUM', 'HIGH'])
        .withMessage('Aciliyet seviyesi LOW, MEDIUM veya HIGH olmalıdır'),

    body('estimatedBudget')
        .optional()
        .isNumeric()
        .withMessage('Bütçe sayısal bir değer olmalıdır'),
];

/**
 * İş ilanı iptal validasyonu
 */
export const cancelJobValidation = [
    body('cancellationReason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('İptal nedeni en fazla 500 karakter olabilir')
        .trim(),
];

/**
 * Değerlendirme oluşturma validasyonu
 */
export const createReviewValidation = [
    body('rating')
        .notEmpty()
        .withMessage('Puan gerekli')
        .isInt({ min: 1, max: 5 })
        .withMessage('Puan 1-5 arasında olmalıdır'),

    body('comment')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Yorum en fazla 1000 karakter olabilir')
        .trim(),
];
