import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Clearing Job and Bid data...');
    try {
        const bids = await prisma.bid.deleteMany({});
        console.log(`✅ Deleted ${bids.count} bids.`);

        const jobs = await prisma.jobPost.deleteMany({});
        console.log(`✅ Deleted ${jobs.count} jobs.`);

        console.log('✨ Database cleanup complete.');
    } catch (error) {
        console.error('❌ Error clearing database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
