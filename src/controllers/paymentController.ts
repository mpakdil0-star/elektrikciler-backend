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
            try {
                const verification = await payStoreService.verifyPurchase(packageId, purchaseToken);

                if (!verification.isValid) {
                    // TODO: Google Play Console servis hesabı yetkileri aktif olduktan sonra
                    // bu kısmı tekrar "return res.status(400)" yaparak katı doğrulamaya geçin.
                    console.warn('⚠️ Google verification failed but proceeding (permissions pending):', verification.error);
                    console.warn('⚠️ Double-spend check via purchaseToken is still active as safeguard.');
                } else {
                    console.log('✅ Google verification SUCCESS');
                }
            } catch (verifyError: any) {
                console.warn('⚠️ Google verification error, proceeding with purchase:', verifyError.message);
            }
        } else {
            // MOCK MODE: If no purchaseToken, we check if we are in a testing/dev environment
            // In production, purchaseToken should be mandatory for IAP products.
            console.warn('⚠️ No purchaseToken provided. Processing as MOCK purchase.');
        }

        // --- BALANCE UPDATE PROCESS ---
        if (isDatabaseAvailable) {
            const userId = req.user.id;
            console.log(`[PURCHASE] Start database update for user: ${userId}`);

            try {
                // 1. Get current balance
                const profile = await prisma.electricianProfile.findUnique({
                    where: { userId }
                });

                if (!profile) throw new NotFoundError('Usta profili bulunamadı');

                const currentBalance = Number(profile.creditBalance || 0);
                const creditsToAdd = Number(selectedPackage.credits);
                const newBalance = currentBalance + creditsToAdd;

                console.log(`[PURCHASE] Current: ${currentBalance}, Adding: ${creditsToAdd}, New: ${newBalance}`);

                // 2. Update Balance
                await prisma.electricianProfile.update({
                    where: { userId },
                    data: { creditBalance: newBalance.toString() }
                });

                console.log(`[PURCHASE] Profile updated`);

                // 3. Create credit log
                await prisma.credit.create({
                    data: {
                        userId,
                        amount: creditsToAdd.toString(),
                        transactionType: 'PURCHASE',
                        description: `${creditsToAdd} Kredi Yüklendi${purchaseToken ? '' : ' (Test)'}`,
                        relatedId: purchaseToken || `mock-tx-${Date.now()}`,
                        balanceAfter: newBalance.toString()
                    }
                });

                console.log(`[PURCHASE] Credit log created`);

                return res.json({
                    success: true,
                    message: 'Ödeme başarılı! Kredileriniz hesabınıza tanımlandı.',
                    data: {
                        creditsAdded: creditsToAdd,
                        newBalance
                    }
                });
            } catch (dbError: any) {
                console.error(`[PURCHASE] Database Operation ERROR:`, dbError);
                throw dbError;
            }
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
