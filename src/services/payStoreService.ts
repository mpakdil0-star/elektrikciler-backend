import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

// Not: Bu dosya Google Cloud Console'dan indirilen servis hesabı anahtarıdır.
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../config/google-service-account.json');

class PayStoreService {
    private androidPublisher: any;

    constructor() {
        this.init();
    }

    private async init() {
        try {
            if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
                console.warn('⚠️ Google Service Account JSON not found at:', SERVICE_ACCOUNT_PATH);
                return;
            }

            const auth = new google.auth.GoogleAuth({
                keyFile: SERVICE_ACCOUNT_PATH,
                scopes: ['https://www.googleapis.com/auth/androidpublisher'],
            });

            const authClient = await auth.getClient();
            this.androidPublisher = google.androidpublisher({
                version: 'v3',
                auth: authClient as any,
            });

            console.log('✅ Google Android Publisher API initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Google Android Publisher API:', error);
        }
    }

    /**
     * Google Play üzerinden satın alma işlemini doğrular
     */
    async verifyPurchase(productId: string, purchaseToken: string, packageName: string = 'com.isbitir.app') {
        try {
            if (!this.androidPublisher) {
                await this.init();
                if (!this.androidPublisher) throw new Error('Google API not initialized');
            }

            console.log(`🔍 Verifying purchase: ${productId}, Token: ${purchaseToken.substring(0, 10)}...`);

            const response = await this.androidPublisher.purchases.products.get({
                packageName,
                productId,
                token: purchaseToken,
            });

            const { purchaseState, consumptionState } = response.data;

            // purchaseState: 0 (Purchased), 1 (Canceled), 2 (Pending)
            // consumptionState: 0 (Yet to be consumed), 1 (Consumed)

            const isValid = purchaseState === 0;

            return {
                isValid,
                data: response.data,
                message: isValid ? 'Satın alma başarılı.' : 'Geçersiz veya iptal edilmiş satın alma.'
            };
        } catch (error: any) {
            console.error('❌ Google Purchase Verification Error:', error.message);
            return {
                isValid: false,
                error: error.message,
                message: 'Google doğrulama servisi hatası.'
            };
        }
    }
}

export const payStoreService = new PayStoreService();
