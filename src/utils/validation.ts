/**
 * Detects if a string contains a Turkish phone number pattern.
 * Supports various formats:
 * - 05xxxxxxxxx
 * - 5xxxxxxxxx
 * - 0 5xx xxx xx xx
 * - 5xx-xxx-xx-xx
 * - 0 (5xx) xxx xx xx
 */
export const containsPhoneNumber = (text: string | undefined | null): boolean => {
    if (!text) return false;

    // 1. Normalize text: remove common separators but keep numbers
    // This helps catch: "0 5 0 5 1 2 3 4 5 6 7" or "0.505.123.45.67"
    const normalized = text.replace(/[\s\.\-\(\)]/g, '');

    // 2. Look for 10 or 11 consecutive digits that start with 5 or 05
    // Turkish mobile: 05xx xxx xx xx (11 digits) or 5xx xxx xx xx (10 digits)
    // We also catch landlines if they match the 10-11 digit pattern
    const phoneRegex = /(05|5)\d{9}/;

    // 3. Look for numbers written in parts or with obfuscation attempts
    // Catching patterns like "bes yuz bes" is complex, but we can catch basic digit sequences
    if (phoneRegex.test(normalized)) return true;

    // 4. Secondary check for spaced-out numbers that might not be caught by simple normalization
    // e.g., "Sıfır 505" is hard, but "0 5 0 5" is caught by step 1.

    return false;
};
