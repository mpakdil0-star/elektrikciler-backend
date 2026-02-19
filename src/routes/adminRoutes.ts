import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { mockStorage, getAllMockUsers } from '../utils/mockStorage';
import * as adminController from '../controllers/adminController';

const router = Router();

// Middleware: Check if user is admin
const adminMiddleware = (req: Request, res: Response, next: any) => {
    const user = (req as any).user;
    // Allow if userType is ADMIN or if email indicates admin (for testing)
    if (!user || (user.userType !== 'ADMIN' && !user.email.startsWith('admin'))) {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem için yönetici yetkisi gereklidir.'
        });
    }
    next();
};

// GET /admin/users - Get all users
router.get('/users', authenticate, adminMiddleware, adminController.getAllUsers);

// GET /admin/users/:id - Get single user details
router.get('/users/:id', authenticate, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userData = mockStorage.get(id);

        if (!userData) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
        }

        res.json({
            success: true,
            data: {
                ...userData
            }
        });
    } catch (error) {
        console.error('Admin get user error:', error);
        res.status(500).json({ success: false, message: 'Kullanıcı bilgileri yüklenirken hata oluştu' });
    }
});

// PUT /admin/users/:id - Update user (suspend, add credits, etc.)
router.put('/users/:id', authenticate, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isActive, creditBalance, isVerified } = req.body;

        const userData = mockStorage.get(id);
        if (!userData) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
        }

        const updates: any = {};

        if (isActive !== undefined) {
            updates.isActive = isActive;
        }

        if (creditBalance !== undefined) {
            updates.creditBalance = creditBalance;
            mockStorage.updateBalance(id, creditBalance);
        }

        if (isVerified !== undefined) {
            updates.isVerified = isVerified;
        }

        if (Object.keys(updates).length > 0) {
            mockStorage.updateProfile(id, updates);
        }

        res.json({
            success: true,
            message: 'Kullanıcı güncellendi',
            data: { id, ...updates }
        });
    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ success: false, message: 'Kullanıcı güncellenirken hata oluştu' });
    }
});

// GET /admin/stats - Get comprehensive platform statistics
router.get('/stats', authenticate, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const allUsers = getAllMockUsers();

        // Process users with derived userType from ID
        const usersWithType = Object.entries(allUsers).map(([id, data]: [string, any]) => {
            let userType = data.userType;
            if (!userType) {
                if (id.endsWith('-ELECTRICIAN')) {
                    userType = 'ELECTRICIAN';
                } else if (id.endsWith('-ADMIN')) {
                    userType = 'ADMIN';
                } else {
                    userType = 'CITIZEN';
                }
            }
            return { ...data, id, userType };
        });

        // Filter by user types
        const citizens = usersWithType.filter((u: any) => u.userType === 'CITIZEN');
        const electricians = usersWithType.filter((u: any) => u.userType === 'ELECTRICIAN');

        // Service category breakdown
        const serviceCategories = {
            elektrik: electricians.filter((u: any) => u.serviceCategory === 'elektrik' || !u.serviceCategory).length,
            cilingir: electricians.filter((u: any) => u.serviceCategory === 'cilingir').length,
            klima: electricians.filter((u: any) => u.serviceCategory === 'klima').length,
            'beyaz-esya': electricians.filter((u: any) => u.serviceCategory === 'beyaz-esya').length,
            tesisat: electricians.filter((u: any) => u.serviceCategory === 'tesisat').length
        };

        // Regional distribution - count by city from locations
        const regionStats: { [city: string]: { electricians: number; citizens: number } } = {};

        usersWithType.forEach((user: any) => {
            const locations = user.locations || [];
            const city = locations[0]?.city || user.city || 'Belirtilmemiş';

            if (!regionStats[city]) {
                regionStats[city] = { electricians: 0, citizens: 0 };
            }

            if (user.userType === 'ELECTRICIAN') {
                regionStats[city].electricians++;
            } else if (user.userType === 'CITIZEN') {
                regionStats[city].citizens++;
            }
        });

        // Convert to sorted array (top cities first)
        const topRegions = Object.entries(regionStats)
            .map(([city, counts]) => ({
                city,
                electricians: counts.electricians,
                citizens: counts.citizens,
                total: counts.electricians + counts.citizens
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10); // Top 10 cities

        // Load job and bid stats from mock storage
        let jobStats = { total: 0, open: 0, completed: 0, cancelled: 0 };
        let bidStats = { total: 0, accepted: 0 };
        let totalCredits = 0;

        try {
            // Get bids from mock storage file
            const fs = require('fs');
            const path = require('path');
            const bidsFile = path.join(process.cwd(), 'data', 'mock-bids.json');
            if (fs.existsSync(bidsFile)) {
                const bidsData = JSON.parse(fs.readFileSync(bidsFile, 'utf8'));
                // Handle both array and object formats
                const bids = Array.isArray(bidsData) ? bidsData : Object.values(bidsData);
                bidStats.total = bids.length;
                bidStats.accepted = bids.filter((b: any) => b.status === 'ACCEPTED').length;
            }
        } catch (e) {
            // Bids file not available
            console.error('Error reading bids file:', e);
        }

        try {
            // Get jobs from mock storage file
            const fs = require('fs');
            const path = require('path');
            const jobsFile = path.join(process.cwd(), 'data', 'mock-jobs.json');
            if (fs.existsSync(jobsFile)) {
                const jobsData = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
                // Handle both array and object formats
                const jobs = Array.isArray(jobsData) ? jobsData : Object.values(jobsData);
                jobStats.total = jobs.length;
                jobStats.open = jobs.filter((j: any) => j.status === 'OPEN' || j.status === 'BIDDING').length;
                jobStats.completed = jobs.filter((j: any) => j.status === 'COMPLETED').length;
                jobStats.cancelled = jobs.filter((j: any) => j.status === 'CANCELLED').length;
            }
        } catch (e) {
            // Jobs file not available
            console.error('Error reading jobs file:', e);
        }

        // Calculate total credits in platform
        electricians.forEach((u: any) => {
            totalCredits += Number(u.creditBalance) || 0;
        });

        const stats = {
            // User Summary
            users: {
                total: usersWithType.length,
                citizens: citizens.length,
                electricians: electricians.length,
                admins: usersWithType.filter((u: any) => u.userType === 'ADMIN').length
            },
            // Service Categories
            serviceCategories,
            // Status
            status: {
                verified: electricians.filter((u: any) => u.isVerified).length,
                pending: usersWithType.filter((u: any) => u.verificationStatus === 'PENDING').length,
                suspended: usersWithType.filter((u: any) => u.isActive === false).length
            },
            // Platform Activity
            activity: {
                jobs: jobStats,
                bids: bidStats,
                totalCredits: Math.round(totalCredits)
            },
            // Regional Distribution
            regions: topRegions
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ success: false, message: 'İstatistikler yüklenirken hata oluştu' });
    }
});

// GET /admin/verifications - Get all pending verifications
router.get('/verifications', authenticate, adminMiddleware, adminController.getAllVerifications);

// POST /admin/verifications/process - Approve/Reject verification
router.post('/verifications/process', authenticate, adminMiddleware, adminController.processVerification);

// GET /admin/dashboard-stats - Fast lookup for dashboard cards
router.get('/dashboard-stats', authenticate, adminMiddleware, adminController.getDashboardStats);

// GET /admin/jobs - Get all jobs for management
router.get('/jobs', authenticate, adminMiddleware, adminController.getAllJobs);

// DELETE /admin/jobs/:id - Force delete a job
router.delete('/jobs/:id', authenticate, adminMiddleware, adminController.deleteJob);

export default router;
