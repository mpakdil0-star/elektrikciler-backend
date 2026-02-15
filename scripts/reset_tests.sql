-- Tüm kullanıcıların telefon numaralarını ve doğrulama durumlarını sıfırla
UPDATE users SET phone = NULL, is_verified = false;

-- Tüm elektrikçilerin kredi bakiyelerini sıfırla
UPDATE electrician_profiles SET credit_balance = 0;

-- Kredi harcama/kazanma geçmişini temizle
TRUNCATE TABLE credits CASCADE;
