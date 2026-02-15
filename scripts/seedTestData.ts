import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function seedTestData() {
  try {
    console.log('🌱 Starting to seed test data...');

    // 1. Create a test citizen user
    const citizenPassword = await bcrypt.hash('test123', 10);
    const citizen = await prisma.user.upsert({
      where: { email: 'citizen@test.com' },
      update: {},
      create: {
        email: 'citizen@test.com',
        passwordHash: citizenPassword,
        fullName: 'Ahmet Vatandaş',
        userType: 'CITIZEN',
        phone: '+905551234567',
        isVerified: true,
        isActive: true,
      },
    });
    console.log('✅ Test citizen created:', citizen.email);

    // 2. Create a test electrician user
    const electricianPassword = await bcrypt.hash('test123', 10);
    const electrician = await prisma.user.upsert({
      where: { email: 'electrician@test.com' },
      update: {},
      create: {
        email: 'electrician@test.com',
        passwordHash: electricianPassword,
        fullName: 'Mehmet Elektrikçi',
        userType: 'ELECTRICIAN',
        phone: '+905559876543',
        city: 'İstanbul',
        isVerified: true,
        isActive: true,
        electricianProfile: {
          create: {
            companyName: 'Mehmet Elektrik Hizmetleri',
            bio: '20 yıllık deneyimli elektrikçi',
            experienceYears: 20,
            specialties: ['Ev Elektrik Tesisatı', 'Arıza Tamiri', 'Led Aydınlatma'],
            ratingAverage: 4.8,
            totalReviews: 45,
            completedJobsCount: 120,
          },
        },
        locations: {
          create: {
            address: 'Usta Sokak No: 1',
            city: 'İstanbul',
            district: 'Kadıköy',
            neighborhood: 'Moda',
            latitude: 40.9850,
            longitude: 29.0250,
            isDefault: true,
          }
        }
      },
    });
    console.log('✅ Test electrician created:', electrician.email);

    // 3. Create test job posts
    const jobPosts = [
      {
        citizenId: citizen.id,
        title: 'Ev Elektrik Tesisatı Arızası',
        description: 'Evin ana panosunda sürekli atma sorunu var. Acil müdahale gerekiyor. Ev 3 katlı ve her katta ayrı panolar var.',
        category: 'Elektrik Tesisatı',
        subcategory: 'Pano Arızası',
        location: {
          address: 'Atatürk Mahallesi, Cumhuriyet Caddesi No: 15',
          city: 'İstanbul',
          district: 'Kadıköy',
          neighborhood: 'Acıbadem',
          latitude: 41.0082,
          longitude: 29.0233,
        },
        urgencyLevel: 'HIGH' as const,
        estimatedBudget: '5000',
        status: 'OPEN' as const,
      },
      {
        citizenId: citizen.id,
        title: 'Led Aydınlatma Kurulumu',
        description: 'Salon ve oturma odasına led şerit aydınlatma kurulumu yapılması gerekiyor. Yaklaşık 30 metre şerit kullanılacak.',
        category: 'Aydınlatma',
        subcategory: 'Led Aydınlatma',
        location: {
          address: 'Barbaros Bulvarı, Deniz Sokak No: 8',
          city: 'İstanbul',
          district: 'Beşiktaş',
          neighborhood: 'Ortaköy',
          latitude: 41.0431,
          longitude: 29.0238,
        },
        urgencyLevel: 'MEDIUM' as const,
        estimatedBudget: '2500',
        budgetRange: {
          min: 2000,
          max: 3000,
        },
        status: 'OPEN' as const,
      },
      {
        citizenId: citizen.id,
        title: 'Prize Takılan Cihazlar Çalışmıyor',
        description: 'Oturma odasında 3 priz çalışmıyor. Muhtemelen kablo problemi var. Hızlı çözüm arıyorum.',
        category: 'Elektrik Tamiri',
        subcategory: 'Priz Arızası',
        location: {
          address: 'Bağdat Caddesi, Güneş Sokak No: 42',
          city: 'İstanbul',
          district: 'Kadıköy',
          neighborhood: 'Fenerbahçe',
          latitude: 40.9769,
          longitude: 29.0312,
        },
        urgencyLevel: 'MEDIUM' as const,
        estimatedBudget: '800',
        status: 'OPEN' as const,
      },
      {
        citizenId: citizen.id,
        title: 'Yeni Ev Elektrik Projesi',
        description: 'Yeni aldığımız daireye elektrik tesisatı döşenmesi gerekiyor. 2+1 daire, yaklaşık 100 m².',
        category: 'Elektrik Tesisatı',
        subcategory: 'Yeni Tesisat',
        location: {
          address: 'Levent Mahallesi, İşçi Blokları Caddesi No: 25',
          city: 'İstanbul',
          district: 'Şişli',
          neighborhood: 'Levent',
          latitude: 41.0821,
          longitude: 29.0158,
        },
        urgencyLevel: 'LOW' as const,
        estimatedBudget: '15000',
        budgetRange: {
          min: 12000,
          max: 18000,
        },
        status: 'OPEN' as const,
      },
      {
        citizenId: citizen.id,
        title: 'Klima Elektrik Bağlantısı',
        description: 'Yeni alınan split klima için elektrik bağlantısı yapılması gerekiyor. Zaten priz var, sadece bağlantı yeterli.',
        category: 'Elektrik Bağlantısı',
        subcategory: 'Klima Bağlantısı',
        location: {
          address: 'Nişantaşı, Teşvikiye Caddesi No: 58',
          city: 'İstanbul',
          district: 'Şişli',
          neighborhood: 'Nişantaşı',
          latitude: 41.0479,
          longitude: 28.9861,
        },
        urgencyLevel: 'HIGH' as const,
        estimatedBudget: '600',
        status: 'OPEN' as const,
      },
    ];

    // Delete existing test jobs
    await prisma.jobPost.deleteMany({
      where: {
        citizen: {
          email: 'citizen@test.com',
        },
      },
    });

    // Create job posts
    for (const jobData of jobPosts) {
      const job = await prisma.jobPost.create({
        data: jobData,
      });
      console.log(`✅ Job created: ${job.title}`);
    }

    console.log('\n🎉 Test data seeded successfully!');
    console.log('\n📝 Test Accounts:');
    console.log('  Citizen: citizen@test.com / test123');
    console.log('  Electrician: electrician@test.com / test123');
    console.log(`\n📋 Created ${jobPosts.length} test job posts`);
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData()
  .then(() => {
    console.log('\n✅ Seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });

