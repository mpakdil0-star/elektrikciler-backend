import prisma, { isDatabaseAvailable } from '../config/database';

// In-memory block store for mock mode
let mockBlocks: Array<{ id: string; blockerId: string; blockedId: string; reason?: string; createdAt: string }> = [];

// Load from disk
import fs from 'fs';
import path from 'path';
const BLOCKS_FILE = path.join(__dirname, '../../data/mock_blocks.json');

function loadBlocksFromDisk() {
    try {
        if (fs.existsSync(BLOCKS_FILE)) {
            mockBlocks = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf-8'));
        }
    } catch (e) {
        mockBlocks = [];
    }
}

function saveBlocksToDisk() {
    try {
        const dir = path.dirname(BLOCKS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BLOCKS_FILE, JSON.stringify(mockBlocks, null, 2));
    } catch (e) {
        console.error('Failed to save mock blocks:', e);
    }
}

loadBlocksFromDisk();

/**
 * Block a user
 */
export const blockUser = async (blockerId: string, blockedId: string, reason?: string) => {
    if (blockerId === blockedId) {
        throw new Error('Kendinizi engelleyemezsiniz.');
    }

    if (!isDatabaseAvailable || blockerId.startsWith('mock-')) {
        // Mock mode
        const existing = mockBlocks.find(b => b.blockerId === blockerId && b.blockedId === blockedId);
        if (existing) {
            throw new Error('Bu kullanıcı zaten engellenmiş.');
        }

        const block = {
            id: `mock-block-${Date.now()}`,
            blockerId,
            blockedId,
            reason,
            createdAt: new Date().toISOString(),
        };
        mockBlocks.push(block);
        saveBlocksToDisk();
        return block;
    }

    // DB mode
    try {
        // Check if already blocked to avoid Prisma unique constraint error logging
        const existing = await prisma.userBlock.findUnique({
            where: {
                blockerId_blockedId: { blockerId, blockedId }
            }
        });

        if (existing) {
            throw new Error('Bu kullanıcı zaten engellenmiş.');
        }

        const block = await prisma.userBlock.create({
            data: { blockerId, blockedId, reason },
        });
        return block;
    } catch (error: any) {
        if (error.code === 'P2002' || error.message === 'Bu kullanıcı zaten engellenmiş.') {
            throw new Error('Bu kullanıcı zaten engellenmiş.');
        }
        throw error;
    }
};

/**
 * Unblock a user
 */
export const unblockUser = async (blockerId: string, blockedId: string) => {
    if (!isDatabaseAvailable || blockerId.startsWith('mock-')) {
        const idx = mockBlocks.findIndex(b => b.blockerId === blockerId && b.blockedId === blockedId);
        if (idx === -1) {
            throw new Error('Bu kullanıcı engellenmiş değil.');
        }
        mockBlocks.splice(idx, 1);
        saveBlocksToDisk();
        return { success: true };
    }

    const deleted = await prisma.userBlock.deleteMany({
        where: { blockerId, blockedId },
    });

    if (deleted.count === 0) {
        throw new Error('Bu kullanıcı engellenmiş değil.');
    }

    return { success: true };
};

/**
 * Get list of blocked users
 */
export const getBlockedUsers = async (userId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-')) {
        const blocks = mockBlocks.filter(b => b.blockerId === userId);
        // Return with basic user info from mock storage
        const { mockStorage } = require('../utils/mockStorage');
        return blocks.map(b => {
            const user = mockStorage.get(b.blockedId);
            return {
                id: b.id,
                blockedUser: {
                    id: b.blockedId,
                    fullName: user?.fullName || 'Bilinmeyen Kullanıcı',
                    profileImageUrl: user?.profileImageUrl || null,
                },
                reason: b.reason,
                createdAt: b.createdAt,
            };
        });
    }

    const blocks = await prisma.userBlock.findMany({
        where: { blockerId: userId },
        include: {
            blocked: {
                select: {
                    id: true,
                    fullName: true,
                    profileImageUrl: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return blocks.map((b: any) => ({
        id: b.id,
        blockedUser: b.blocked,
        reason: b.reason,
        createdAt: b.createdAt,
    }));
};

/**
 * Check if there is a block between two users (bidirectional)
 * Returns true if EITHER user has blocked the other
 */
export const isBlocked = async (userId1: string, userId2: string): Promise<boolean> => {
    if (!isDatabaseAvailable || userId1.startsWith('mock-') || userId2.startsWith('mock-')) {
        return mockBlocks.some(
            b => (b.blockerId === userId1 && b.blockedId === userId2) ||
                (b.blockerId === userId2 && b.blockedId === userId1)
        );
    }

    const block = await prisma.userBlock.findFirst({
        where: {
            OR: [
                { blockerId: userId1, blockedId: userId2 },
                { blockerId: userId2, blockedId: userId1 },
            ],
        },
    });

    return !!block;
};

/**
 * Check block status between current user and target user
 */
export const getBlockStatus = async (currentUserId: string, targetUserId: string) => {
    if (!isDatabaseAvailable || currentUserId.startsWith('mock-')) {
        const iBlockedThem = mockBlocks.some(b => b.blockerId === currentUserId && b.blockedId === targetUserId);
        const theyBlockedMe = mockBlocks.some(b => b.blockerId === targetUserId && b.blockedId === currentUserId);
        return { iBlockedThem, theyBlockedMe, isBlocked: iBlockedThem || theyBlockedMe };
    }

    const [iBlockedThem, theyBlockedMe] = await Promise.all([
        prisma.userBlock.findFirst({ where: { blockerId: currentUserId, blockedId: targetUserId } }),
        prisma.userBlock.findFirst({ where: { blockerId: targetUserId, blockedId: currentUserId } }),
    ]);

    return {
        iBlockedThem: !!iBlockedThem,
        theyBlockedMe: !!theyBlockedMe,
        isBlocked: !!iBlockedThem || !!theyBlockedMe,
    };
};
