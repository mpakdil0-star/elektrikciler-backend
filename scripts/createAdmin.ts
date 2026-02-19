
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function createAdmin() {
    try {
        console.log('👤 Creating Admin User...');

        const email = 'admin@isbitir.com';
        const password = 'admin123'; // Default strong password
        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await prisma.user.upsert({
            where: { email },
            update: {
                userType: 'ADMIN', // Ensure role is ADMIN
                passwordHash: hashedPassword,
            },
            create: {
                email,
                passwordHash: hashedPassword,
                fullName: 'Sistem Yöneticisi',
                userType: 'ADMIN',
                phone: '+905550000000',
                isVerified: true,
                isActive: true,
            },
        });

        console.log('\n✅ Admin User Created Successfully!');
        console.log('-----------------------------------');
        console.log(`📧 Email:    ${admin.email}`);
        console.log(`🔑 Password: ${password}`);
        console.log('-----------------------------------');
        console.log('🚀 You can now login with these credentials in the mobile app.');

    } catch (error) {
        console.error('❌ Error creating admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
