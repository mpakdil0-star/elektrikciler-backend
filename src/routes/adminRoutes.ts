import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { mockStorage, getAllMockUsers } from '../utils/mockStorage';
import * as adminController from '../controllers/adminController';

const router = Router();

// Middleware: Check if user is admin
const adminMiddleware = (req: Request, res: Response, next: any) => {
    const user = (req as any).user;
    if (!user || (user.userType !== 'ADMIN' && !user.email.startsWith('admin'))) {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem için yönetici yetkisi gereklidir.'
        });
    }
    next();
};

// GET /admin/users - Get all users
router.get('/users', authenticate, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { search, userType, page = 1, limit = 20 } = req.query;
        const allUsers = getAllMockUsers();

        let usersList = Object.entries(allUsers).map(([id, data]: [string, any]) => {
            let uType = data.userType;
            if (!uType) {
                if (id.endsWith('-ELECTRICIAN')) uType = 'ELECTRICIAN';
                else if (id.endsWith('-ADMIN')) uType = 'ADMIN';
                else uType = 'CITIZEN';
            }
            return { ...data, id, userType: uType };
        });

        // Filter ADMINs out for security
        usersList = usersList.filter(u => u.userType !== 'ADMIN');

        // Search filter
        if (search) {
            const s = (search as string).toLowerCase();
            usersList = usersList.filter(u =>
                u.fullName.toLowerCase().includes(s) ||
                u.email.toLowerCase().includes(s) ||
                (u.phone && u.phone.includes(s))
            );
        }

        // Type filter
        if (userType && userType !== 'ALL') {
            usersList = usersList.filter(u => u.userType === userType);
        }

        // MAPPING: Ensure pushStatus is always calculated even for mock data
        const mapped = usersList.map(u => {
            let isPushEnabled = true;
            if (u.notificationSettings && typeof u.notificationSettings === 'object') {
                if (u.notificationSettings.pushEnabled === false) isPushEnabled = false;
            }

            let calculatedPushStatus = 'DISABLED';
            if (isPushEnabled) {
                calculatedPushStatus = u.pushToken ? 'ACTIVE' : 'PENDING';
            }

            return {
                ...u,
                pushStatus: calculatedPushStatus,
                creditBalance: Number(u.creditBalance || 0),
                completedJobsCount: Number(u.completedJobsCount || 0)
            };
        });

        // Pagination
        const total = mapped.length;
        const start = (Number(page) - 1) * Number(limit);
        const paginated = mapped.slice(start, start + Number(limit));

        res.json({
            success: true,
            data: {
                users: paginated,
                pagination: {
                    total,
                    page: Number(page),
                    totalPages: Math.ceil(total / Number(limit))
                }
            }
        });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ success: false, message: 'Kullanıcılar listelenirken hata oluştu' });
    }
});

// GET /admin/stats - Get statistics
router.get('/stats', authenticate, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const allUsers = getAllMockUsers();
        const usersWithType = Object.entries(allUsers).map(([id, data]: [string, any]) => {
            let userType = data.userType || (id.endsWith('-ELECTRICIAN') ? 'ELECTRICIAN' : id.endsWith('-ADMIN') ? 'ADMIN' : 'CITIZEN');
            return { ...data, id, userType };
        });

        const citizens = usersWithType.filter((u: any) => u.userType === 'CITIZEN');
        const electricians = usersWithType.filter((u: any) => u.userType === 'ELECTRICIAN');

        const stats = {
            users: {
                total: usersWithType.length,
                citizens: citizens.length,
                electricians: electricians.length,
                admins: usersWithType.filter((u: any) => u.userType === 'ADMIN').length
            },
            activity: {
                totalCredits: electricians.reduce((acc, u) => acc + Number(u.creditBalance || 0), 0)
            }
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'İstatistikler yüklenirken hata oluştu' });
    }
});

router.get('/users/:id', authenticate, adminMiddleware, adminController.getUserDetails);
router.put('/users/:id', authenticate, adminMiddleware, adminController.updateUser);
router.get('/verifications', authenticate, adminMiddleware, adminController.getAllVerifications);
router.post('/verifications/process', authenticate, adminMiddleware, adminController.processVerification);
router.get('/dashboard-stats', authenticate, adminMiddleware, adminController.getDashboardStats);
router.get('/jobs', authenticate, adminMiddleware, adminController.getAllJobs);
router.delete('/jobs/:id', authenticate, adminMiddleware, adminController.deleteJob);

export default router;
