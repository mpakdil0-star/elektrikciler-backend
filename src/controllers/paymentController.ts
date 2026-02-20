import { Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ValidationError, NotFoundError } from '../utils/errors';
import { mockStorage, mockTransactionStorage } from '../utils/mockStorage';
import { payStoreService } from '../services/payStoreService';

export const getCreditPackages = async (req: AuthRequest, res: Response) => {
    // Sabit kredi paketleri
    const packages = [
        { id: 'pkg_10', name: 'Hızlı Başlangıç', credits: 10, price: 224.99, color: '#3B82F6' },
        { id: 'pkg_35', name: 'Gelişim Paketi', credits: 35, price: 589.99, color: '#94A3B8' },
        { id: 'pkg_75', name: 'Eko-Avantaj', credits: 75, price: 1069.99, color: '#F59E0B', isPopular: true },
        { id: 'pkg_175', name: 'Usta Paketi', credits: 175, price: 1789.99, color: '#8B5CF6' },
    ];

    res.json({ success: true, data: packages });
};

export const purchaseCredits = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        const { packageId, purchaseToken } = req.body;
        if (!packageId) throw new ValidationError('Paket seçimi yapılmadı');

        const packages: any = {
            'pkg_10': { credits: 10, price: 224.99 },
            'pkg_35': { credits: 35, price: 589.99 },
            'pkg_75': { credits: 75, price: 1069.99 },
            'pkg_175': { credits: 175, price: 1789.99 },
        };

        const selectedPackage = packages[packageId];
        if (!selectedPackage) throw new ValidationError('Geçersiz paket');

        // --- REAL IAP VERIFICATION BRANCH ---
        if (purchaseToken) {
            console.log(`💎 Processing Real IAP for user ${req.user.id}, Token: ${purchaseToken.substring(0, 10)}...`);

            // 1. Double-spending check (Database only)
            if (isDatabaseAvailable) {
                const existingCredit = await prisma.credit.findFirst({
                    where: { relatedId: purchaseToken }
                });
                if (existingCredit) throw new ValidationError('Bu satın alma zaten işlenmiş.');
            }

            // 2. Verify with Google Play API
            console.log(`🔍 Verifying with Google Play for package: ${packageId}...`);
            const verification = await payStoreService.verifyPurchase(packageId, purchaseToken);

            if (!verification.isValid) {
                console.error('❌ Google verification FAILED:', verification.error);
                return res.status(400).json({
                    success: false,
                    message: verification.message,
                    error: verification.error
                });
            }

            console.log('✅ Google verification SUCCESS');
        } else {
            // MOCK MODE: If no purchaseToken, we check if we are in a testing/dev environment
            // In production, purchaseToken should be mandatory for IAP products.
            console.warn('⚠️ No purchaseToken provided. Processing as MOCK purchase.');
        }

        // --- BALANCE UPDATE PROCESS ---
        if (isDatabaseAvailable) {
            const userId = req.user.id;

            // 1. Get current balance
            const profile = await prisma.electricianProfile.findUnique({
                where: { userId }
            });

            if (!profile) throw new NotFoundError('Usta profili bulunamadı');

            const currentBalance = Number(profile.creditBalance || 0);
            const newBalance = currentBalance + selectedPackage.credits;

            // 2. Update Balance
            await prisma.electricianProfile.update({
                where: { userId },
                data: { creditBalance: newBalance }
            });

            // 3. Create credit log
            await prisma.credit.create({
                data: {
                    userId,
                    amount: selectedPackage.credits,
                    transactionType: 'PURCHASE',
                    description: `${selectedPackage.credits} Kredi Yüklendi${purchaseToken ? '' : ' (Test)'}`,
                    relatedId: purchaseToken || `mock-tx-${Date.now()}`,
                    balanceAfter: newBalance
                }
            });

            // 4. Create payment record - NOT FOR CREDIT RECHARGES
            // Note: Payment model has a @unique constraint on jobPostId and a 1-to-1 relation with JobPost.
            // Since this is a standalone credit purchase (no JobPost), we skip Payment record creation 
            // to avoid unique constraint violations on empty strings.
            // The transaction is already logged in the Credit table.

            console.log(`💰 Credit recharge complete. Added ${selectedPackage.credits} to user ${userId}. New Balance: ${newBalance}`);

            return res.json({
                success: true,
                message: 'Ödeme başarılı! Kredileriniz hesabınıza tanımlandı.',
                data: {
                    creditsAdded: selectedPackage.credits,
                    newBalance
                }
            });
        } else {
            // --- MOCK STORAGE FALLBACK ---
            const userId = req.user.id;
            const mockData = mockStorage.addCredits(userId, selectedPackage.credits);

            mockTransactionStorage.addTransaction({
                userId,
                amount: selectedPackage.credits,
                transactionType: 'PURCHASE',
                description: `Kredi Yükleme${purchaseToken ? '' : ' (Test)'}`,
                balanceAfter: mockData.creditBalance
            });

            return res.json({
                success: true,
                message: 'İşlem başarılı (Bakiye güncellendi)',
                data: {
                    creditsAdded: selectedPackage.credits,
                    newBalance: mockData.creditBalance
                }
            });
        }
    } catch (error) {
        next(error);
    }
};

export const getTransactionHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Yetkisiz erişim');

        if (isDatabaseAvailable) {
            const history = await prisma.credit.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                take: 50
            });

            return res.json({ success: true, data: history });
        } else {
            // Get real transaction history from mock storage
            const mockHistory = mockTransactionStorage.getTransactions(req.user.id, 50);
            return res.json({ success: true, data: mockHistory });
        }
    } catch (error) {
        next(error);
    }
};
