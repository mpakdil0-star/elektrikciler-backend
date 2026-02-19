import { Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ValidationError } from '../utils/errors';
import { mockTicketStorage, mockStorage } from '../utils/mockStorage';

export const createTicket = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        const { subject, description, ticketType, priority } = req.body;

        if (!subject || !description || !ticketType) {
            throw new ValidationError('Konu, açıklama ve talep türü zorunludur');
        }

        let ticket;
        if (isDatabaseAvailable) {
            ticket = await prisma.supportTicket.create({
                data: {
                    userId: req.user.id,
                    subject,
                    description,
                    ticketType,
                    priority: priority || 'medium',
                    status: 'open'
                }
            });
        } else {
            ticket = mockTicketStorage.addTicket({
                userId: req.user.id,
                subject,
                description,
                ticketType,
                priority: priority || 'medium'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Destek talebiniz oluşturuldu',
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

export const getMyTickets = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        let tickets;
        if (isDatabaseAvailable) {
            tickets = await prisma.supportTicket.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' }
            });
        } else {
            tickets = mockTicketStorage.getTicketsByUser(req.user.id);
            tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};

export const getTicketDetail = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        const { id } = req.params;

        let ticket: any;
        if (isDatabaseAvailable) {
            ticket = await prisma.supportTicket.findFirst({
                where: {
                    id,
                    // Allow admin to see all, user to see own
                    ...(req.user.userType !== 'ADMIN' ? { userId: req.user.id } : {})
                },
                include: {
                    user: { select: { fullName: true, email: true, phone: true, profileImageUrl: true } },
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        include: { sender: { select: { fullName: true, profileImageUrl: true } } }
                    }
                }
            });
        } else {
            const rawTicket = mockTicketStorage.getTicket(id);

            if (rawTicket) {
                const isAdmin = req.user.userType === 'ADMIN';
                if (rawTicket.userId !== req.user.id && !isAdmin) {
                    ticket = null;
                } else {
                    const user = mockStorage.get(rawTicket.userId);
                    ticket = {
                        ...rawTicket,
                        user: {
                            fullName: user.fullName || 'Bilinmeyen Kullanıcı',
                            email: user.email,
                            phone: user.phone
                        },
                        messages: rawTicket.messages || [] // Mock messages
                    };
                }
            }
        }

        if (!ticket) {
            throw new ValidationError('Destek talebi bulunamadı');
        }

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

export const getAllTickets = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || req.user.userType !== 'ADMIN') {
            throw new ValidationError('Bu işlem için yönetici yetkisi gereklidir');
        }

        let tickets;
        if (isDatabaseAvailable) {
            tickets = await prisma.supportTicket.findMany({
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            fullName: true,
                            email: true,
                            phone: true
                        }
                    }
                }
            });
        } else {
            const allTickets: any[] = mockTicketStorage.getAllTickets();
            tickets = allTickets.map(t => {
                const user = mockStorage.get(t.userId);
                return {
                    ...t,
                    user: {
                        fullName: user.fullName || 'Bilinmeyen Kullanıcı',
                        email: user.email,
                        phone: user.phone
                    }
                };
            });
            tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};

export const updateTicketStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || req.user.userType !== 'ADMIN') {
            throw new ValidationError('Bu işlem için yönetici yetkisi gereklidir');
        }

        const { id } = req.params;
        const { status, replyMessage } = req.body;

        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            throw new ValidationError('Geçersiz durum');
        }

        let ticket;
        if (isDatabaseAvailable) {
            ticket = await prisma.supportTicket.update({
                where: { id },
                data: { status }
            });

            if (replyMessage) {
                await prisma.ticketMessage.create({
                    data: {
                        ticketId: id,
                        senderId: req.user.id,
                        message: replyMessage,
                        isAdmin: true
                    }
                });
            }
        } else {
            ticket = mockTicketStorage.updateTicket(id, { status });

            if (replyMessage && ticket) {
                mockTicketStorage.addMessage(id, {
                    senderId: req.user.id,
                    text: replyMessage,
                    isAdmin: true
                });
            }
        }

        if (!ticket) {
            throw new ValidationError('Talep bulunamadı');
        }

        res.json({
            success: true,
            message: 'Talep durumu güncellendi',
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

export const addTicketMessage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ValidationError('Oturum açmanız gerekiyor');

        const { id } = req.params;
        const { text } = req.body;

        if (!text) throw new ValidationError('Mesaj boş olamaz');

        let message;
        if (isDatabaseAvailable) {
            const ticket = await prisma.supportTicket.findUnique({ where: { id } });
            if (!ticket) throw new ValidationError('Talep bulunamadı');

            // Check permission
            if (ticket.userId !== req.user.id && req.user.userType !== 'ADMIN') {
                throw new ValidationError('Yetkisiz işlem');
            }

            message = await prisma.ticketMessage.create({
                data: {
                    ticketId: id,
                    senderId: req.user.id,
                    message: text,
                    isAdmin: req.user.userType === 'ADMIN'
                },
                include: {
                    sender: { select: { fullName: true, profileImageUrl: true } }
                }
            });
        } else {
            const isAdmin = req.user.userType === 'ADMIN';
            const existingTicket = mockTicketStorage.getTicket(id);
            if (!existingTicket) throw new ValidationError('Talep bulunamadı');

            if (existingTicket.userId !== req.user.id && !isAdmin) {
                throw new ValidationError('Yetkisiz işlem');
            }

            message = mockTicketStorage.addMessage(id, {
                senderId: req.user.id,
                text,
                isAdmin
            });
        }

        res.json({
            success: true,
            message: 'Mesaj gönderildi',
            data: message
        });

    } catch (error) {
        next(error);
    }
};
