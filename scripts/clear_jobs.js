const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function clearJobs() {
    console.log('--- Starting Job Data Cleanup ---');

    try {
        // 1. Clear Database (conditional check if prisma is initialized/available)
        console.log('Clearing database tables...');

        try {
            // Ordered to handle foreign key constraints
            const deleteReviews = prisma.review.deleteMany();
            const deletePayments = prisma.payment.deleteMany();
            const deleteBids = prisma.bid.deleteMany();
            const deleteEscrow = prisma.escrowAccount.deleteMany();
            const deleteMessages = prisma.message.deleteMany();
            const deleteConversations = prisma.conversation.deleteMany();
            const deleteJobs = prisma.jobPost.deleteMany();

            const results = await prisma.$transaction([
                deleteReviews,
                deletePayments,
                deleteBids,
                deleteEscrow,
                deleteMessages,
                deleteConversations,
                deleteJobs
            ]);

            console.log('✅ Database tables cleared successfully.');
            console.log(`   Detailed: Reviews: ${results[0].count}, Bids: ${results[2].count}, Jobs: ${results[6].count}`);
        } catch (dbError) {
            console.log('⚠️ Database cleanup skipped or failed (perhaps disconnected?):', dbError.message);
        }

        // 2. Clear Mock Files
        console.log('Clearing mock data files...');
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const mockJobsPath = path.join(dataDir, 'mock-jobs.json');
        const mockBidsPath = path.join(dataDir, 'mock-bids.json');

        fs.writeFileSync(mockJobsPath, '[]');
        fs.writeFileSync(mockBidsPath, '[]');

        console.log('✅ Mock JSON files reset to [].');

        // 3. Clear Uploaded Job Images
        console.log('Clearing uploaded job images...');
        const uploadDir = path.join(__dirname, '..', 'uploads', 'jobs');
        if (fs.existsSync(uploadDir)) {
            const files = fs.readdirSync(uploadDir);
            let count = 0;
            for (const file of files) {
                if (file !== '.gitkeep') {
                    try {
                        fs.unlinkSync(path.join(uploadDir, file));
                        count++;
                    } catch (e) { }
                }
            }
            console.log(`✅ Cleared ${count} images from uploads/jobs.`);
        }

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        await prisma.$disconnect();
        console.log('--- Cleanup Finished ---');
    }
}

clearJobs();
