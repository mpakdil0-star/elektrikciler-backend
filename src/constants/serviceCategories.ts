/**
 * Hizmet Kategorileri (Service Categories)
 * Ana meslekler: elektrik, cilingir, klima, beyaz-esya, tesisat
 */

export const SERVICE_CATEGORIES = [
    'elektrik',
    'cilingir',
    'klima',
    'beyaz-esya',
    'tesisat'
] as const;

export type ServiceCategory = typeof SERVICE_CATEGORIES[number];

/**
 * Varsayılan hizmet kategorisi
 */
export const DEFAULT_SERVICE_CATEGORY: ServiceCategory = 'elektrik';

/**
 * Verilen string'in geçerli bir service category olup olmadığını kontrol et
 */
export const isValidServiceCategory = (category: string): category is ServiceCategory => {
    return SERVICE_CATEGORIES.includes(category as ServiceCategory);
};

/**
 * Service category'yi normalize et (geçersizse default döndür)
 */
export const normalizeServiceCategory = (category?: string | null): ServiceCategory => {
    if (category && isValidServiceCategory(category)) {
        return category;
    }
    return DEFAULT_SERVICE_CATEGORY;
};
