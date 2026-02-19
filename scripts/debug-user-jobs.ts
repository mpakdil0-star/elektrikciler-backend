
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugJobs() {
    try {
        console.log('--- DEBUG USER ---');
        const user = await prisma.user.findFirst({
            where: { email: 'mpakdil0@gmail.com' }
        });
        if (user) {
            console.log(`User Found: ${user.email}`);
            console.log(`User ID:   ${user.id}`);
            console.log(`User Type: ${user.userType}`);
        } else {
            console.log('User mpakdil0@gmail.com NOT FOUND in database.');
        }

        console.log('\n--- DEBUG JOBS (All) ---');
        const jobs = await prisma.jobPost.findMany({
            include: { citizen: true }
        });

        console.log(`Total Jobs in DB: ${jobs.length}`);
        jobs.forEach(job => {
            console.log(`Job ID: ${job.id}`);
            console.log(`Title: ${job.title}`);
            console.log(`Status: ${job.status}`);
            console.log(`Creator ID: ${job.citizenId}`);
            console.log(`Creator Name: ${job.citizen?.fullName}`);
            console.log(`Is Match? ${user ? (job.citizenId === user.id ? '✅ YES' : '❌ NO') : 'N/A'}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugJobs();
