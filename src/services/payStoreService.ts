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
            let credentials;

            // 1. Try Environment Variable (Best for Render)
            if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
                console.log('✅ Using Google credentials from environment variable');
                credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            }
            // 2. Try Local File (Best for Dev)
            else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
                console.log('✅ Using Google credentials from file:', SERVICE_ACCOUNT_PATH);
                const fileContent = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
                credentials = JSON.parse(fileContent);
            }
            else {
                console.warn('⚠️ Google Service Account NOT found in ENV or FILE');
                return;
            }

            const auth = new google.auth.GoogleAuth({
                credentials,
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
            console.log(`🔍 Verifying purchase: ${productId}, Token: ${purchaseToken.substring(0, 10)}...`);

            if (!this.androidPublisher) {
                console.log('[payStoreService] androidPublisher not init, trying now...');
                await this.init();
            }

            if (!this.androidPublisher) {
                console.error('❌ Google Android Publisher not initialized. Check credentials.');
                return {
                    isValid: false,
                    message: 'Google doğrulama servisi şu an devre dışı. Lütfen teknik ekibe bildirin.',
                    error: 'Google API not initialized'
                };
            }

            const response = await this.androidPublisher.purchases.products.get({
                packageName,
                productId,
                token: purchaseToken,
            });

            console.log('[payStoreService] Raw Google Response received');
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
