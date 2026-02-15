import { Request, Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { getCityCoordinates } from '../utils/geo';

// CENTRALIZED MOCK STORAGE is now used via ../utils/mockStorage

export const getLocations = async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;

    try {
        if (!userId) {
            return res.status(200).json({ success: true, data: [] });
        }

        // 1. Try real database first if available
        if (isDatabaseAvailable) {
            try {
                const locations = await prisma.location.findMany({
                    where: { userId, isActive: true },
                    orderBy: { createdAt: 'desc' }
                });
                return res.status(200).json({ success: true, data: locations });
            } catch (dbError: any) {
                console.warn('⚠️ Location DB Fetch Error (Falling back to mock):', dbError.message);
                if (!userId.startsWith('mock-')) {
                    // It's a real user but DB is failing for some other reason than connection/timeout? 
                    // Let's check common prisma errors
                    if (dbError.code?.startsWith('P2')) throw dbError; // Constraint errors
                }
            }
        }

        // 2. Fallback to mock storage (for mock IDs or when DB is down)
        const { mockStorage } = require('../utils/mockStorage');
        const mockData = mockStorage.get(userId);
        const mockLocs = mockData.locations || [];
        return res.status(200).json({ success: true, data: mockLocs });
    } catch (error: any) {
        console.error('🔥 Critical Location Controller Error:', error.message);
        return res.status(200).json({ success: true, data: [] });
    }
};

export const addLocation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { title, city, district, neighborhood, details, isDefault, latitude, longitude } = req.body;

        // Use provided coordinates OR fallback to city center
        const fallbackCoords = getCityCoordinates(city);
        const lat = latitude !== undefined ? Number(latitude) : fallbackCoords.lat;
        const lng = longitude !== undefined ? Number(longitude) : fallbackCoords.lng;

        // 1. Try real database first if available
        if (isDatabaseAvailable) {
            try {
                const location = await prisma.location.create({
                    data: {
                        userId,
                        address: details, // Database 'address' field maps to 'details' from UI
                        city,
                        district,
                        neighborhood: neighborhood || '',
                        isDefault: isDefault || false,
                        latitude: lat,
                        longitude: lng
                    }
                });

                // Refresh socket rooms for the user
                const { refreshUserRooms } = require('../services/socketHandler');
                refreshUserRooms(userId);

                return res.status(201).json({
                    success: true,
                    data: location
                });
            } catch (dbError: any) {
                console.warn('⚠️ Location DB Create Error (Falling back to mock):', dbError.message);
                if (!userId.startsWith('mock-')) {
                    if (dbError.code?.startsWith('P2')) throw dbError;
                }
            }
        }

        // 2. Fallback to mock storage (for mock IDs or when DB is down)
        const newLocation = {
            id: `mock-loc-${Date.now()}`,
            userId,
            city,
            district,
            neighborhood: neighborhood || '',
            address: details,
            isDefault: isDefault || false,
            isActive: true,
            createdAt: new Date().toISOString(),
            latitude: lat,
            longitude: lng
        };

        const { mockStorage } = require('../utils/mockStorage');
        const mockData = mockStorage.get(userId);
        const userLocations = mockData.locations || [];

        if (isDefault) {
            userLocations.forEach((l: any) => l.isDefault = false);
        }
        userLocations.unshift(newLocation);

        mockStorage.updateProfile(userId, { locations: userLocations });

        // Refresh socket rooms for the user
        try {
            const { refreshUserRooms } = require('../services/socketHandler');
            refreshUserRooms(userId);
        } catch (err) {
            console.error('Socket refresh error in mock mode:', err);
        }

        return res.status(201).json({
            success: true,
            data: newLocation
        });
    } catch (error) {
        next(error);
    }
};

export const updateLocation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        const { title, city, district, neighborhood, details, isDefault, latitude, longitude } = req.body;

        const updatePayload: any = {
            address: details,
            city,
            district,
            neighborhood: neighborhood || '',
            isDefault: isDefault || false
        };

        if (latitude !== undefined) updatePayload.latitude = Number(latitude);
        if (longitude !== undefined) updatePayload.longitude = Number(longitude);

        // 1. Try real database first if available
        if (isDatabaseAvailable) {
            try {
                // Find first to check if it exists in DB
                const existing = await prisma.location.findFirst({
                    where: { id, userId }
                });

                if (existing) {
                    const location = await prisma.location.update({
                        where: { id },
                        data: updatePayload
                    });

                    // Refresh socket rooms for the user
                    const { refreshUserRooms } = require('../services/socketHandler');
                    refreshUserRooms(userId);

                    return res.status(200).json({
                        success: true,
                        data: location
                    });
                }
            } catch (dbError: any) {
                console.warn('⚠️ Location DB Update Error (Falling back to mock):', dbError.message);
                if (!id.startsWith('mock-') && !userId.startsWith('mock-')) {
                    if (dbError.code?.startsWith('P2')) throw dbError;
                }
            }
        }

        // 2. Fallback to mock storage (for mock IDs or when DB is down)
        const { mockStorage } = require('../utils/mockStorage');
        const mockData = mockStorage.get(userId);
        const userLocations = mockData.locations || [];
        const index = userLocations.findIndex((l: any) => l.id === id);

        if (index !== -1) {
            if (isDefault) {
                userLocations.forEach((l: any) => l.isDefault = false);
            }

            userLocations[index] = {
                ...userLocations[index],
                ...updatePayload
            };

            mockStorage.updateProfile(userId, { locations: userLocations });

            // Refresh socket rooms for the user
            try {
                const { refreshUserRooms } = require('../services/socketHandler');
                refreshUserRooms(userId);
            } catch (err) {
                console.error('Socket refresh error in mock mode:', err);
            }

            return res.status(200).json({
                success: true,
                data: userLocations[index]
            });
        }
    } catch (error) {
        next(error);
    }
};

export const deleteLocation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        // 1. Try real database first if available
        if (isDatabaseAvailable) {
            try {
                // Check if it exists in DB
                const existing = await prisma.location.findFirst({
                    where: { id, userId }
                });

                if (existing) {
                    await prisma.location.update({
                        where: { id },
                        data: { isActive: false }
                    });

                    // Refresh socket rooms for the user
                    const { refreshUserRooms } = require('../services/socketHandler');
                    refreshUserRooms(userId);

                    return res.status(200).json({
                        success: true,
                        message: 'Konum başarıyla silindi'
                    });
                }
            } catch (dbError: any) {
                console.warn('⚠️ Location DB Delete Error (Falling back to mock):', dbError.message);
                if (!id.startsWith('mock-') && !userId.startsWith('mock-')) {
                    if (dbError.code?.startsWith('P2')) throw dbError;
                }
            }
        }

        // 2. Fallback to mock storage (for mock IDs or when DB is down)
        const { mockStorage } = require('../utils/mockStorage');
        const mockData = mockStorage.get(userId);
        const userLocations = mockData.locations || [];
        const index = userLocations.findIndex((l: any) => l.id === id);

        if (index !== -1) {
            userLocations.splice(index, 1);
            mockStorage.updateProfile(userId, { locations: userLocations });

            // Refresh socket rooms for the user
            try {
                const { refreshUserRooms } = require('../services/socketHandler');
                refreshUserRooms(userId);
            } catch (err) {
                console.error('Socket refresh error in mock mode:', err);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Konum başarıyla silindi'
        });
    } catch (error) {
        next(error);
    }
};
