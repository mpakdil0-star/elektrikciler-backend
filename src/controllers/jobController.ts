import { Response, NextFunction } from 'express';
import { isDatabaseAvailable } from '../config/database';
import { jobService } from '../services/jobService';
import { AuthRequest } from '../middleware/auth';
import { ValidationError } from '../utils/errors';
import { mockStorage, mockReviewStorage } from '../utils/mockStorage';
import { bidStoreById } from './bidController';
const { saveNotification } = require('../services/notificationService');
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const MOCK_JOBS_FILE = path.join(DATA_DIR, 'mock-jobs.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// In-memory store for jobs created when database is not available
// Key: userId, Value: array of jobs
export const userJobsStore = new Map<string, any[]>();
// Global job store for quick lookup by ID
// Key: jobId, Value: job object
export const jobStoreById = new Map<string, any>();

// Helper to save mock jobs to disk
export const saveMockJobs = () => {
  try {
    const jobs = Array.from(jobStoreById.values());
    fs.writeFileSync(MOCK_JOBS_FILE, JSON.stringify(jobs, null, 2));
    console.log(`✅ Saved ${jobs.length} mock jobs to disk`);
  } catch (error) {
    console.error('❌ Error saving mock jobs:', error);
  }
};

// Helper to delete a mock job
export const deleteMockJob = (jobId: string) => {
  const job = jobStoreById.get(jobId);
  if (job) {
    // Remove from global store
    jobStoreById.delete(jobId);

    // Remove from user store
    if (job.citizenId && userJobsStore.has(job.citizenId)) {
      const userJobs = userJobsStore.get(job.citizenId) || [];
      const filtered = userJobs.filter(j => j.id !== jobId);
      userJobsStore.set(job.citizenId, filtered);
    }

    saveMockJobs();
    return true;
  }
  return false;
};

// Helper to load mock jobs from disk
export const loadMockJobs = () => {
  try {
    if (fs.existsSync(MOCK_JOBS_FILE)) {
      const data = fs.readFileSync(MOCK_JOBS_FILE, 'utf8');
      const jobs = JSON.parse(data);
      if (Array.isArray(jobs)) {
        // Clear existing stores first if needed, but here we just append/overwrite
        jobs.forEach(job => {
          jobStoreById.set(job.id, job);
          // Populate userJobsStore as well
          if (job.citizenId) {
            if (!userJobsStore.has(job.citizenId)) {
              userJobsStore.set(job.citizenId, []);
            }
            // Avoid duplicates in userJobsStore if run multiple times (though checking id is safer)
            const userJobs = userJobsStore.get(job.citizenId);
            if (userJobs && !userJobs.find(j => j.id === job.id)) {
              userJobs.push(job);
            }
          }
        });
        console.log(`✅ Loaded ${jobs.length} mock jobs from disk`);
      }
    }
  } catch (error) {
    console.error('❌ Error loading mock jobs:', error);
  }
};

// Load jobs on startup
loadMockJobs();

export const createJobController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    if (req.user.userType !== 'CITIZEN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Only citizens can create job posts' },
      });
    }

    const { images = [], ...restBody } = req.body;

    // Process images: base64 to file
    // Process images: base64 to Cloudinary
    const processedImages: string[] = [];
    if (images && images.length > 0) {
      const cloudinary = require('../config/cloudinary').default;

      for (const img of images) {
        if (img.startsWith('data:image')) {
          try {
            const result = await cloudinary.uploader.upload(img, {
              folder: 'jobs',
              resource_type: 'image'
            });
            processedImages.push(result.secure_url);
          } catch (err) {
            console.error('Error uploading job image to Cloudinary:', err);
            // Fallback or skip? For now, maybe skip or push original if it's not too huge (but it is huge)
            // Better to skip or log error. pushing original might fail database constraints if too long.
          }
        } else {
          processedImages.push(img);
        }
      }
    }

    const jobData = {
      ...restBody,
      images: processedImages,
      citizenId: req.user.id,
    };

    // Debug: Check what images are received
    console.log('📸 createJob - req.body.images:', req.body.images ? req.body.images.length : 'undefined');
    console.log('📸 createJob - jobData.images:', jobData.images ? jobData.images.length : 'undefined');

    try {
      if (!isDatabaseAvailable) {
        throw new Error('DATABASE_NOT_CONNECTED');
      }
      const job = await jobService.createJob(jobData);

      // Socket notifications are already handled inside jobService.createJob()
      // so we don't need redundant notifyUser call here.

      res.status(201).json({
        success: true,
        data: { job },
      });
    } catch (dbError: any) {
      const isConnectionError =
        !isDatabaseAvailable ||
        dbError.message?.includes('connect') ||
        dbError.message?.includes('database') ||
        dbError.message?.includes("Can't reach database") ||
        dbError.message?.includes("DATABASE_NOT_CONNECTED") ||
        dbError.code === 'P1001' ||
        dbError.code === 'P1017' ||
        dbError.name === 'PrismaClientInitializationError' ||
        dbError.constructor?.name === 'PrismaClientInitializationError';

      if (isConnectionError || req.user.id.startsWith('mock-')) {
        console.warn('⚠️ Database connection failed, returning mock job data for creation');
        console.log('📦 Job Data Service Category:', jobData.serviceCategory);
        const mockJob = {
          id: `mock-${Date.now()}`,
          citizenId: req.user.id,
          title: jobData.title,
          description: jobData.description,
          serviceCategory: jobData.serviceCategory, // Ana hizmet kategorisi
          category: jobData.category,
          subcategory: jobData.subcategory || null,
          location: jobData.location,
          urgencyLevel: jobData.urgencyLevel || 'MEDIUM',
          estimatedBudget: jobData.estimatedBudget ? jobData.estimatedBudget.toString() : null,
          status: 'OPEN',
          images: jobData.images || [],
          viewCount: 0,
          bidCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          citizen: {
            id: req.user.id,
            fullName: mockStorage.get(req.user.id)?.fullName || (req.user.email ? req.user.email.split('@')[0] : 'Kullanıcı'),
            profileImageUrl: mockStorage.get(req.user.id)?.profileImageUrl || null,
            phone: mockStorage.get(req.user.id)?.phone || null,
          },
        };

        // Store the job in memory
        if (!userJobsStore.has(req.user.id)) {
          userJobsStore.set(req.user.id, []);
        }
        const userJobs = userJobsStore.get(req.user.id) || [];
        userJobs.unshift(mockJob);
        userJobsStore.set(req.user.id, userJobs);
        jobStoreById.set(mockJob.id, mockJob);
        saveMockJobs();

        // Notification Logic
        // Notification Logic
        const { notifyUser } = require('../server');
        const { getAllMockUsers } = require('../utils/mockStorage');

        const allUsers = getAllMockUsers();
        const jobServiceCategory = jobData.serviceCategory;
        const targetCity = jobData.location?.city;
        const targetDistrict = jobData.location?.district;
        const targetRooms: string[] = [];

        // 1. WebSocket Rooms Preparation
        if (jobServiceCategory && targetCity) {
          targetRooms.push(`area:${targetCity}:all:${jobServiceCategory}`);
          if (targetDistrict && targetDistrict !== 'Tüm Şehir' && targetDistrict !== 'Merkez') {
            targetRooms.push(`area:${targetCity}:${targetDistrict}:${jobServiceCategory}`);
          }
        }

        // 2. Iterate users for Mock Notifications and Push Notifications
        const electricians = Object.entries(allUsers).filter(([id]) => id.includes('ELECTRICIAN'));

        console.log(`📡 Sending notifications. Job: ${jobServiceCategory}, City: ${targetCity}, Creator: ${req.user.id}`);

        electricians.forEach(([userId, userData]: [string, any]) => {
          // SKIP the current user (even if they have an electrician profile)
          if (req.user && userId === req.user.id) {
            console.log(`   ⏭️ Skipping current user: ${userId}`);
            return;
          }

          const ustaServiceCategory = userData.serviceCategory;
          const serviceCategoryMatch = ustaServiceCategory && jobServiceCategory && ustaServiceCategory === jobServiceCategory;

          if (!serviceCategoryMatch) {
            if (userData.pushToken) {
              console.log(`   ❌ Category Mismatch for ${userId}: Usta(${ustaServiceCategory}) != Job(${jobServiceCategory})`);
            }
            return;
          }

          const hasLocationMatch = userData.locations?.some((loc: any) =>
            loc.city?.toLowerCase() === targetCity?.toLowerCase() &&
            (
              !targetDistrict ||
              loc.district?.toLowerCase() === targetDistrict.toLowerCase() ||
              !loc.district ||
              loc.district === 'Tüm Şehir' ||
              loc.district === 'Merkez'
            )
          );

          if (hasLocationMatch) {
            console.log(`   ✅ MATCH FOUND: ${userId} (${userData.email}). Token: ${userData.pushToken ? 'YES' : 'NO'}`);
            // Persistent Notification (DB or Mock)
            const { saveNotification } = require('../services/notificationService');
            saveNotification({
              userId,
              type: 'new_job_available',
              title: 'Yeni İş İlanı! ⚡',
              message: `Bölgenizde yeni ilan verildi: ${jobData.title}`,
              relatedId: mockJob.id,
              relatedType: 'JOB',
            });

            // Push Notification
            if (userData.pushToken) {
              const pushNotificationService = require('../services/pushNotificationService').default;
              pushNotificationService.sendNotification({
                to: userData.pushToken,
                title: 'Yeni İş İlanı! ⚡',
                body: `Bölgenizde yeni ilan verildi: ${jobData.title}`,
                data: { jobId: mockJob.id, type: 'new_job_available' }
              }).catch((err: any) => console.error('Push Notification Error:', err));
            }
          } else if (userData.pushToken) {
            console.log(`   ❌ Location Mismatch for ${userId}`);
          }
        });

        // 3. Send Socket Notifications
        console.log(`📡 [Socket] Target rooms for new_job_available: ${targetRooms.length > 0 ? targetRooms.join(', ') : 'NONE'}`);

        if (targetRooms.length > 0) {
          notifyUser(targetRooms, 'new_job_available', {
            title: 'Yeni İş İlanı! ⚡',
            message: `Bölgenizde yeni ilan verildi: ${jobData.title}`,
            jobId: mockJob.id,
            locationPreview: targetDistrict || targetCity,
            category: jobData.category,
            serviceCategory: jobServiceCategory
          });
        } else {
          console.warn('⚠️ No target rooms for new job notification (Missing category or city)');
        }

        return res.status(201).json({
          success: true,
          data: { job: mockJob },
        });
      }

      throw dbError;
    }
  } catch (error) {
    next(error);
  }
};

export const getJobByIdController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isGuest = !req.user;

    // 1. Try real database first if available
    if (isDatabaseAvailable) {
      try {
        let job = await jobService.getJobById(id, userId);
        if (job) {
          if (isGuest) job = maskJobData(job);
          return res.json({
            success: true,
            data: { job },
          });
        }
      } catch (dbError: any) {
        const isConnectionError =
          dbError.message?.includes('Database not available') ||
          dbError.message?.includes('connect') ||
          dbError.message?.includes('database') ||
          dbError.message?.includes("Can't reach database") ||
          dbError.code === 'P1001' ||
          dbError.code === 'P1017' ||
          dbError.name === 'PrismaClientInitializationError' ||
          dbError.constructor?.name === 'PrismaClientInitializationError';

        if (!isConnectionError && !id.startsWith('mock-')) {
          // It's a real DB error (not connection) for a real ID, rethrow
          throw dbError;
        }
        console.warn('⚠️ Database fetch failed in getJobByIdController, falling back to mock storage');
      }
    }

    // 2. Fallback to mock storage (for mock IDs or when DB is down)
    let job = jobStoreById.get(id) || getMockJobs().jobs.find(j => j.id === id);

    if (!job) {
      // Try fallback ID formats
      const numericId = id.match(/\d+/)?.[0];
      if (numericId) {
        const fallbackId = `mock-${numericId}`;
        job = jobStoreById.get(fallbackId) || getMockJobs().jobs.find(j => j.id === fallbackId);
      }
    }

    if (job) {
      // Enrich citizen data with profile info from mockStorage
      if (job.citizenId) {
        const citizenData = mockStorage.get(job.citizenId);
        job = {
          ...job,
          citizen: {
            ...job.citizen,
            id: job.citizenId,
            fullName: citizenData?.fullName || job.citizen?.fullName || 'Müşteri',
            profileImageUrl: citizenData?.profileImageUrl || job.citizen?.profileImageUrl || null,
            phone: citizenData?.phone || job.citizen?.phone || null,
          },
        };
      }

      if (isGuest) job = maskJobData(job);
      const { _count, ...jobWithoutCount } = job;
      return res.json({
        success: true,
        data: { job: { ...jobWithoutCount, bidCount: _count?.bids || job.bidCount || 0 } },
      });
    }

    return res.status(404).json({
      success: false,
      error: { message: 'Job not found' }
    });
  } catch (error) {
    next(error);
  }
};

// Masking Helper
const maskJobData = (job: any) => {
  if (!job) return job;
  const masked = { ...job };

  // Mask location address
  if (masked.location) {
    masked.location = {
      ...masked.location,
      address: `${masked.location.district || ''}, ${masked.location.city || ''} (Tam adres için giriş yapın)`,
    };
  }

  // Mask citizen name
  if (masked.citizen) {
    masked.citizen = {
      ...masked.citizen,
      fullName: 'Vatandaş', // Or mask like "Ahmet V." if preferred
    };
  }

  return masked;
};

// Mock data for testing when database is not available
export const getMockJobs = () => {
  const mockJobs: any[] = [
    {
      id: 'mock-job-1',
      citizenId: 'mock-citizen-1',
      title: 'Mutfak Priz Arızası',
      description: 'Mutfaktaki 3 prizden elektrik gelmiyor. Sigortalar sağlam görünüyor.',
      category: 'Priz ve Anahtar',
      location: {
        city: 'İstanbul',
        district: 'Kadıköy',
        neighborhood: 'Caferağa',
        address: 'Moda Cd. No:12'
      },
      urgencyLevel: 'HIGH',
      estimatedBudget: '500',
      status: 'OPEN',
      images: [],
      viewCount: 12,
      bidCount: 3,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      citizen: {
        id: 'mock-citizen-1',
        fullName: 'Caner Kaya',
        profileImageUrl: null,
      }
    },
    {
      id: 'mock-job-2',
      citizenId: 'mock-citizen-2',
      title: 'Avize Montajı (3 Adet)',
      description: 'Yeni aldığımız 3 adet avizenin montajı yapılacak. Tavanlar yüksek.',
      category: 'Aydınlatma Sistemleri',
      location: {
        city: 'Adana',
        district: 'Çukurova',
        neighborhood: 'Güzelyalı',
        address: 'Turgut Özal Blv. No:88'
      },
      urgencyLevel: 'MEDIUM',
      estimatedBudget: '750',
      status: 'OPEN',
      images: [],
      viewCount: 8,
      bidCount: 1,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      citizen: {
        id: 'mock-citizen-2',
        fullName: 'Merve Demir',
        profileImageUrl: null,
      }
    },
    {
      id: 'mock-job-3',
      citizenId: 'mock-citizen-3',
      title: 'Sigorta Panosu Değişimi',
      description: 'Eski tip sigorta panosu otomatik sigortalarla değiştirilecek.',
      category: 'Elektrik Panosu',
      location: {
        city: 'Adana',
        district: 'Seyhan',
        neighborhood: 'Cemalpaşa',
        address: 'Vali Yolu Cd.'
      },
      urgencyLevel: 'MEDIUM',
      estimatedBudget: '1200',
      status: 'OPEN',
      images: [],
      viewCount: 15,
      bidCount: 2,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      citizen: {
        id: 'mock-citizen-3',
        fullName: 'Bülent Yılmaz',
        profileImageUrl: null,
      }
    }
  ];

  return {
    jobs: mockJobs,
    pagination: {
      page: 1,
      limit: 20,
      total: mockJobs.length,
      totalPages: 1,
    },
  };
};

export const getJobsController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      status, category, city, district, districts, lat, lng, radius,
      page = '1', limit = '20',
    } = req.query;

    const isGuest = !req.user;

    // Parse districts from comma-separated string to array
    let parsedDistricts: string[] | undefined;
    if (districts) {
      if (typeof districts === 'string') {
        parsedDistricts = districts.split(',').map(d => d.trim()).filter(Boolean);
      } else if (Array.isArray(districts)) {
        parsedDistricts = districts as string[];
      }
    }

    const filters = {
      status: status as any,
      category: category as string | undefined,
      city: city as string | undefined,
      district: district as string | undefined,
      districts: parsedDistricts,
      lat: lat ? parseFloat(lat as string) : undefined,
      lng: lng ? parseFloat(lng as string) : undefined,
      radius: radius ? parseFloat(radius as string) : undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    };

    try {
      let result = await jobService.getJobs(filters);

      if (isGuest && result.jobs) {
        result.jobs = result.jobs.map((job: any) => maskJobData(job));
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (dbError: any) {
      // Mock data handling
      let mockResult = getAllMockJobs();

      // Apply filtering to mock data manually
      if (city) {
        mockResult.jobs = mockResult.jobs.filter((j: any) => j.location?.city === city);
      }
      if (parsedDistricts && parsedDistricts.length > 0) {
        mockResult.jobs = mockResult.jobs.filter((j: any) => parsedDistricts.includes(j.location?.district));
      } else if (district) {
        mockResult.jobs = mockResult.jobs.filter((j: any) => j.location?.district === district);
      }
      if (category) {
        mockResult.jobs = mockResult.jobs.filter((j: any) => j.category === category);
      }
      // NEW: Filter by serviceCategory logic
      // This is crucial for distinguishing between Electrician vs Plumber jobs
      const serviceCategoryParam = req.query.serviceCategory as string;
      if (serviceCategoryParam) {
        mockResult.jobs = mockResult.jobs.filter((j: any) =>
          // Match exact serviceCategory 'tesisat' === 'tesisat'
          j.serviceCategory === serviceCategoryParam ||
          // Fallback: If job has no serviceCategory, assume 'elektrik' (legacy support)
          (!j.serviceCategory && serviceCategoryParam === 'elektrik')
        );
      }

      if (isGuest && mockResult.jobs) {
        mockResult.jobs = mockResult.jobs.map((j: any) => maskJobData(j));
      }
      return res.json({
        success: true,
        data: mockResult,
      });
    }
  } catch (error: any) {
    let mockResult = getAllMockJobs();
    if (!req.user && mockResult.jobs) {
      mockResult.jobs = mockResult.jobs.map((j: any) => maskJobData(j));
    }
    return res.json({
      success: true,
      data: mockResult,
    });
  }
};

// Get all mock jobs including dynamically created ones
const getAllMockJobs = () => {
  const staticMockResult = getMockJobs();

  // Get all dynamically created jobs from the global store
  const dynamicJobs: any[] = [];
  jobStoreById.forEach((job) => {
    // Only include OPEN status jobs
    if (job.status === 'OPEN') {
      dynamicJobs.push({
        ...job,
        bidCount: job.bidCount || job._count?.bids || 0,
      });
    }
  });

  // Merge: dynamic jobs first (newest), then static mock jobs
  const allJobs = [...dynamicJobs, ...staticMockResult.jobs];

  // Remove duplicates by ID (dynamic jobs take precedence)
  const uniqueJobs = allJobs.filter((job, index, self) =>
    index === self.findIndex((j) => j.id === job.id)
  );

  return {
    jobs: uniqueJobs,
    pagination: {
      page: 1,
      limit: 20,
      total: uniqueJobs.length,
      totalPages: Math.ceil(uniqueJobs.length / 20),
    },
  };
};

export const getMyJobsController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Wrap everything in try-catch to prevent any error from reaching error handler
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    let jobs: any[] = [];
    const userId = req.user.id;
    const userType = req.user.userType;

    // 1. Try real database first if available and not a mock user
    if (isDatabaseAvailable && !userId.startsWith('mock-')) {
      try {
        jobs = await jobService.getMyJobs(userId, userType);
        return res.json({ success: true, data: { jobs } });
      } catch (dbError) {
        console.warn('⚠️ Database fetch failed in getMyJobsController, falling back to memory store');
      }
    }

    // 2. Fallback to memory store (for mock users or when DB is down)
    if (userType === 'CITIZEN') {
      // Get user's created jobs from memory store
      jobs = userJobsStore.get(userId) || [];
      // Demo jobs removed as per user request (only see own jobs)
    } else if (userType === 'ELECTRICIAN') {
      // Get jobs where this electrician has placed a bid (from bidStoreById)
      const allJobs = Array.from(jobStoreById.values());
      const electricianBids = Array.from(bidStoreById.values()).filter(b => b.electricianId === userId);
      const jobIdsWithBids = new Set(electricianBids.map(b => b.jobPostId));

      jobs = allJobs.filter(j => jobIdsWithBids.has(j.id)).map(job => ({
        ...job,
        bids: electricianBids.filter(b => b.jobPostId === job.id)
      }));
    }

    return res.json({
      success: true,
      data: { jobs },
    });
  } catch (error: any) {
    console.error('Error in getMyJobsController:', error);
    return res.json({
      success: true,
      data: { jobs: [] },
    });
  }
};

export const updateJobController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;

    // Mock job kontrolü
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İlan bulunamadı' },
        });
      }
      if (mockJob.citizenId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: { message: 'Bu ilanı düzenleme yetkiniz yok' },
        });
      }
      if (mockJob.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: { message: 'Sadece açık ilanlar düzenlenebilir' },
        });
      }

      // Güncelleme
      const updatedJob = {
        ...mockJob,
        ...req.body,
        updatedAt: new Date().toISOString(),
        location: {
          ...mockJob.location,
          ...(req.body.location || {}),
        },
      };

      jobStoreById.set(id, updatedJob);

      // Ana listedeki referansı da güncelle (mock jobs için gerekli olabilir)
      // Ancak UserJobsStore sadece referans tutuyorsa burada yapmaya gerek olmayabilir
      // Yine de tutarlılık için userJobsStore'u güncellemek iyi olur
      const userJobs = userJobsStore.get(req.user.id) || [];
      const jobIndex = userJobs.findIndex(j => j.id === id);
      if (jobIndex !== -1) {
        userJobs[jobIndex] = updatedJob;
        userJobsStore.set(req.user.id, userJobs);
      }

      // Save to disk
      saveMockJobs();

      return res.json({
        success: true,
        data: { job: updatedJob },
        message: 'İlan başarıyla güncellendi',
      });
    }

    const job = await jobService.updateJob(id, req.user.id, req.body);

    res.json({
      success: true,
      data: { job },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteJobController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;
    const result = await jobService.deleteJob(id, req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// İlan İptali - Sadece OPEN veya PENDING durumunda iptal edilebilir
export const cancelJobController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    // Mock job kontrolü
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İlan bulunamadı' },
        });
      }
      if (mockJob.citizenId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: { message: 'Bu ilanı iptal etme yetkiniz yok' },
        });
      }
      if (mockJob.status === 'IN_PROGRESS') {
        return res.status(400).json({
          success: false,
          error: { message: 'Devam eden işler iptal edilemez' },
        });
      }
      if (mockJob.status === 'COMPLETED' || mockJob.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Bu ilan zaten tamamlanmış veya iptal edilmiş' },
        });
      }

      mockJob.status = 'CANCELLED';
      mockJob.cancellationReason = reason || null;
      mockJob.cancelledAt = new Date().toISOString();
      mockJob.cancelledAt = new Date().toISOString();
      jobStoreById.set(id, mockJob);

      // Save to disk
      saveMockJobs();

      // 📢 Socket ve Kalıcı Bildirim: Teklif veren tüm ustalara ilan iptal edildi bildir
      console.log(`🔍 [DEBUG] Processing notifications for cancelled job ${id}`);

      // Bu ilana ait tüm teklifleri bul
      bidStoreById.forEach((bid: any) => {
        if (bid.jobPostId === id && bid.electricianId) {
          // 💰 KREDİ İADESİ: Teklif veren tüm ustalara 1 kredi iade et
          try {
            const { mockStorage } = require('../utils/mockStorage');
            mockStorage.addCredits(bid.electricianId, 1);
            console.log(`💰 [MOCK REFUND] 1 Credit refunded to electrician ${bid.electricianId}`);
          } catch (refundErr) {
            console.error('❌ Failed to refund mock credit:', refundErr);
          }

          const cancelMsg = `İlan iptal edildi: ${mockJob.title}. Teklif krediniz hesabınıza yüklenmiştir.${reason ? `\nSebep: ${reason}` : ''}`;
          const notificationData = {
            id: `notif-${Date.now()}-${bid.id}`,
            type: 'JOB_CANCELLED',
            title: '🚫 İlan İptal Edildi (Kredi İade)',
            message: cancelMsg,
            body: cancelMsg,
            jobId: id,
            relatedId: id,
            isRead: false,
            createdAt: new Date().toISOString()
          };

          // 1. Kalıcı bildirim merkezine ekle
          saveNotification({
            userId: bid.electricianId,
            ...notificationData
          });

          // 2. Anlık socket bildirimi gönder
          const io = req.app.get('io');
          if (io) {
            io.to(`user:${bid.electricianId}`).emit('notification', notificationData);
            console.log(`📢 Socket notification emitted to user:${bid.electricianId}`);
          }

          console.log(`📢 Notification processed for electrician ${bid.electricianId} for cancelled job ${id}`);
        }
      });

      return res.json({
        success: true,
        data: { job: mockJob },
        message: 'İlan başarıyla iptal edildi',
      });
    }

    // Gerçek veritabanı işlemi
    const job = await jobService.cancelJob(id, req.user.id, reason);
    res.json({
      success: true,
      data: { job },
      message: 'İlan başarıyla iptal edildi',
    });
  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
};

// Elektrikçi: İşi Tamamlandı Olarak İşaretle
export const markJobCompleteController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    if (req.user.userType !== 'ELECTRICIAN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Sadece elektrikçiler işi tamamlayabilir' },
      });
    }

    const { id } = req.params;

    // Mock job kontrolü
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İş bulunamadı' },
        });
      }
      if (mockJob.status !== 'IN_PROGRESS') {
        return res.status(400).json({
          success: false,
          error: { message: 'Sadece devam eden işler tamamlanabilir' },
        });
      }

      mockJob.status = 'PENDING_CONFIRMATION';
      mockJob.electricianCompletedAt = new Date().toISOString();
      mockJob.electricianCompletedAt = new Date().toISOString();
      jobStoreById.set(id, mockJob);

      // Save to disk
      saveMockJobs();

      return res.json({
        success: true,
        data: { job: mockJob },
        message: 'İş tamamlandı olarak işaretlendi. Vatandaş onayı bekleniyor.',
      });
    }

    const job = await jobService.markJobComplete(id, req.user.id);
    res.json({
      success: true,
      data: { job },
      message: 'İş tamamlandı olarak işaretlendi. Vatandaş onayı bekleniyor.',
    });
  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
};

// Vatandaş: İş Tamamlama Onayı
export const confirmJobCompleteController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;

    // Mock job kontrolü
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İş bulunamadı' },
        });
      }
      if (mockJob.citizenId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: { message: 'Bu işi onaylama yetkiniz yok' },
        });
      }
      if (mockJob.status !== 'PENDING_CONFIRMATION' && mockJob.status !== 'IN_PROGRESS') {
        return res.status(400).json({
          success: false,
          error: { message: 'Bu iş onaylanamaz' },
        });
      }

      mockJob.status = 'COMPLETED';
      mockJob.completedAt = new Date().toISOString();
      mockJob.completedAt = new Date().toISOString();
      jobStoreById.set(id, mockJob);

      // Save to disk
      saveMockJobs();

      // 🎉 Socket ve Kalıcı Bildirim: Atanmış ustaya "Tebrikler, iş onaylandı!" bildir
      if (mockJob.assignedElectricianId) {
        const notificationData = {
          id: `notif-${Date.now()}-complete`,
          type: 'JOB_COMPLETED',
          title: 'Tebrikler! 🎉',
          message: `İş tarafınızdan onaylandı: ${mockJob.title}`,
          body: `İş onaylandı: ${mockJob.title}`,
          jobId: id,
          relatedId: id,
          isRead: false,
          createdAt: new Date().toISOString()
        };

        // 1. Kalıcı bildirim merkezine ekle
        saveNotification({
          userId: mockJob.assignedElectricianId,
          ...notificationData
        });

        // 2. Anlık socket bildirimi gönder
        const io = req.app.get('io');
        if (io) {
          io.to(`user:${mockJob.assignedElectricianId}`).emit('notification', notificationData);
          console.log(`🎉 Socket completion notification emitted to user:${mockJob.assignedElectricianId}`);
        }

        console.log(`🎉 Job completion notification processed for electrician ${mockJob.assignedElectricianId}`);
      }

      return res.json({
        success: true,
        data: { job: mockJob },
        message: 'İş başarıyla tamamlandı!',
      });
    }

    const job = await jobService.confirmJobComplete(id, req.user.id);
    res.json({
      success: true,
      data: { job },
      message: 'İş başarıyla tamamlandı!',
    });
  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
};

// Değerlendirme Oluştur
export const createReviewController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params; // job id
    const { rating, comment, electricianId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: { message: 'Lütfen 1-5 arası bir puan verin' },
      });
    }

    // Mock job kontrolü
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İş bulunamadı' },
        });
      }
      if (mockJob.citizenId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: { message: 'Bu işi değerlendirme yetkiniz yok' },
        });
      }
      if (mockJob.status !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Sadece tamamlanan işler değerlendirilebilir' },
        });
      }

      const mockReview = {
        id: `review-${Date.now()}`,
        jobPostId: id,
        citizenId: req.user.id,
        electricianId: electricianId || mockJob.acceptedElectricianId,
        rating,
        comment: comment || null,
        createdAt: new Date().toISOString(),
      };

      mockJob.hasReview = true;
      mockJob.review = mockReview;
      jobStoreById.set(id, mockJob);

      return res.status(201).json({
        success: true,
        data: { review: mockReview },
        message: 'Değerlendirmeniz kaydedildi. Teşekkürler!',
      });
    }

    const review = await jobService.createReview(id, req.user.id, {
      rating,
      comment,
      electricianId,
    });

    res.status(201).json({
      success: true,
      data: { review },
      message: 'Değerlendirmeniz kaydedildi. Teşekkürler!',
    });
  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
};

// Combined Complete & Review (Called by Citizen)
export const completeJobController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;
    const { rating, comment } = req.body;

    // 1. Confirm Job Complete
    if (id.startsWith('mock-')) {
      const mockJob = jobStoreById.get(id);
      if (!mockJob) {
        return res.status(404).json({
          success: false,
          error: { message: 'İş bulunamadı' },
        });
      }

      mockJob.status = 'COMPLETED';
      mockJob.completedAt = new Date().toISOString();

      // Get electrician ID
      const electricianId = mockJob.assignedElectricianId || mockJob.acceptedElectricianId;
      try {
        const logMsg = `[${new Date().toISOString()}] Job Completion: JobId=${id}, ElectricianId=${electricianId}, Assigned=${mockJob.assignedElectricianId}, Accepted=${mockJob.acceptedElectricianId}\n`;
        const logPath = path.join(process.cwd(), 'debug_output.txt');
        fs.appendFileSync(logPath, logMsg);
      } catch (e) { console.error('Log error', e); }

      console.log(`👷 Job Completion Debug: JobId=${id}, ElectricianId=${electricianId}`);
      console.log('👷 Assigned:', mockJob.assignedElectricianId, 'Accepted:', mockJob.acceptedElectricianId);

      // 2. Add Review if provided using mockReviewStorage
      if (rating && electricianId) {
        // require() removed, using top-level import

        // Get reviewer info from mockStorage if not available in req.user
        let reviewerName = (req.user as any).fullName;
        let reviewerImageUrl = (req.user as any).profileImageUrl || null;

        if (!reviewerName && req.user.id) {
          const reviewerData = mockStorage.get(req.user.id);
          reviewerName = reviewerData?.fullName || 'Müşteri';
          reviewerImageUrl = reviewerData?.profileImageUrl || null;
        }

        // Add review to mockReviewStorage
        const review = mockReviewStorage.addReview({
          electricianId: electricianId,
          reviewerId: req.user.id,
          reviewerName: reviewerName || 'Müşteri',
          reviewerImageUrl: reviewerImageUrl,
          rating: Number(rating),
          comment: comment || '',
          jobId: id
        });

        mockJob.hasReview = true;
        mockJob.review = review;
        console.log(`✅ Review added for electrician ${electricianId}`);
      }

      // 3. Increment electrician's completedJobsCount in mockStorage
      if (electricianId) {
        const electricianData = mockStorage.get(electricianId);
        if (electricianData) {
          const currentCount = electricianData.completedJobsCount || 0;
          console.log(`📊 Updating job count for ${electricianId}. Old: ${currentCount}, New: ${currentCount + 1}`);

          try {
            const logPath = path.join(process.cwd(), 'debug_output.txt');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Updating count for ${electricianId}. Old: ${currentCount}, New: ${currentCount + 1}\n`);
          } catch (e) { console.error(e); }

          mockStorage.updateProfile(electricianId, {
            completedJobsCount: currentCount + 1
          });

          // Verify update
          const updatedData = mockStorage.get(electricianId);
          console.log(`✅ Verified new count: ${updatedData?.completedJobsCount}`);
        } else {
          console.warn(`⚠️ Electrician data not found for ID: ${electricianId}`);
        }
      } else {
        console.warn('⚠️ No electrician ID found for this job, cannot increment count.');
      }

      // Sync job status in userBidsStore (Electrician's My Bids list)
      if (electricianId) {
        try {
          const { userBidsStore } = require('./bidController');
          const bids = userBidsStore.get(electricianId) || [];
          const bidIndex = bids.findIndex((b: any) => b.jobPostId === id);

          if (bidIndex !== -1) {
            if (bids[bidIndex].jobPost) {
              bids[bidIndex].jobPost.status = 'COMPLETED';
              bids[bidIndex].jobPost.completedAt = new Date().toISOString();
            }
            userBidsStore.set(electricianId, bids);

            try {
              const logPath = path.join(process.cwd(), 'debug_output.txt');
              fs.appendFileSync(logPath, `[${new Date().toISOString()}] Synced bid status for electrician ${electricianId}\n`);
            } catch (e) { }
          }
        } catch (e) { console.error('Sync error:', e); }
      }

      // 4. Send Push Notification & In-App Notification to Electrician
      if (electricianId) {
        const electricianData = mockStorage.get(electricianId);
        const reviewerData = mockStorage.get(req.user.id);
        const reviewerName = reviewerData?.fullName || (req.user as any).fullName || 'Müşteri';
        const starText = rating ? '⭐'.repeat(Math.min(Number(rating), 5)) : '';
        const notifTitle = 'Yeni Değerlendirme ⭐';
        const notifBody = rating
          ? `${reviewerName} işinizi ${rating} yıldız ile değerlendirdi.${comment ? ` "${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}"` : ''}`
          : `${reviewerName} işi tamamlandı olarak işaretledi.`;

        // In-app notification
        const reviewNotification = {
          id: `mock-notif-review-${Date.now()}`,
          userId: electricianId,
          type: 'new_review',
          title: notifTitle,
          message: notifBody,
          isRead: false,
          relatedId: id,
          relatedType: 'JOB',
          createdAt: new Date().toISOString()
        };
        saveNotification({
          ...reviewNotification,
          userId: electricianId // Explicitly set or let it be in reviewNotification
        });

        // Push notification
        if (electricianData?.pushToken) {
          const pushNotificationService = require('../services/pushNotificationService').default;
          pushNotificationService.sendNotification({
            to: electricianData.pushToken,
            title: notifTitle,
            body: notifBody,
            data: { jobId: id, type: 'new_review' }
          }).catch((err: any) => console.error('Review Push Error:', err));
          console.log(`📱 Sending review push notification to ${electricianId}`);
        }

        // Socket notification
        try {
          const { notifyUser } = require('../server');
          notifyUser(electricianId, 'new_review', {
            title: notifTitle,
            message: notifBody,
            jobId: id,
            rating: Number(rating),
          });
        } catch (e) { console.error('Socket notify error:', e); }
      }

      jobStoreById.set(id, mockJob);
      saveMockJobs();

      return res.json({
        success: true,
        message: 'İş başarıyla tamamlandı ve değerlendirildi!',
        data: { job: mockJob }
      });
    }

    // Database path
    await jobService.confirmJobComplete(id, req.user.id);

    if (rating) {
      await jobService.createReview(id, req.user.id, { rating, comment });
    }

    res.json({
      success: true,
      message: 'İş başarıyla tamamlandı ve değerlendirildi!',
    });
  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
};
