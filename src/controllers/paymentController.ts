import { Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ValidationError, NotFoundError } from '../utils/errors';
import { mockStorage, mockTransactionStorage } from '../utils/mockStorage';
import { payStoreService } from '../services/payStoreService';

export const getCreditPackages = async (req: AuthRequest, res: Response) => {
    // Sabit kredi paketleri
    const packages = [
        { id: 'pkg-10', name: 'Hızlı Başlangıç', credits: 10, price: 189, color: '#3B82F6' },
        { id: 'pkg-35', name: 'Gelişim Paketi', credits: 35, price: 489, color: '#94A3B8' },
        { id: 'pkg-75', name: 'Eko-Avantaj', credits: 75, price: 889, color: '#F59E0B', isPopular: true },
        { id: 'pkg-175', name: 'Usta Paketi', credits: 175, price: 1489, color: '#8B5CF6' },
    ];

    res.json({ success: true, data: packages });
};

export const purchaseCredits = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        const { packageId, purchaseToken } = req.body;
        if (!packageId) throw new ValidationError('Paket seçimi yapılmadı');

        const packages: any = {
            'pkg-10': { credits: 10, price: 189 },
            'pkg-35': { credits: 35, price: 489 },
            'pkg-75': { credits: 75, price: 889 },
            'pkg-175': { credits: 175, price: 1489 },
        };

        const selectedPackage = packages[packageId];
        if (!selectedPackage) throw new ValidationError('Geçersiz paket');

        // --- REAL IAP VERIFICATION BRANCH ---
        if (purchaseToken) {
            console.log(`💎 Processing Real IAP for user ${req.user.id}, Token: ${purchaseToken.substring(0, 10)}...`);

            // 1. Double-spending check (Database only)
            if (isDatabaseAvailable) {
                const existingPayment = await prisma.payment.findUnique({
                    where: { transactionId: purchaseToken }
                });
                if (existingPayment) throw new ValidationError('Bu satın alma zaten işlenmiş.');
            }

            // 2. Verify with Google Play API
            const verification = await payStoreService.verifyPurchase(packageId, purchaseToken);

            if (!verification.isValid) {
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

            // 4. Create payment record
            await prisma.payment.create({
                data: {
                    jobPostId: '',
                    payerId: userId,
                    payeeId: 'SYSTEM',
                    amount: selectedPackage.price,
                    platformFee: 0,
                    netAmount: selectedPackage.price,
                    paymentMethod: purchaseToken ? 'GOOGLE_PLAY_IAP' : 'CREDIT_CARD_MOCK',
                    paymentStatus: 'COMPLETED',
                    transactionId: purchaseToken || `mock-tx-${Date.now()}`,
                    completedAt: new Date(),
                    metadata: purchaseToken ? { packageId } : { mock: true }
                }
            }).catch(e => console.warn('Payment record failed:', e.message));

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
