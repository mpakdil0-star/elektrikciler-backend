import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export interface PushNotificationPayload {
    to: string | string[];
    title: string;
    body: string;
    data?: any;
    sound?: 'default' | null;
    badge?: number;
}

export const pushNotificationService = {
    async sendNotification(payload: PushNotificationPayload) {
        const { to, title, body, data, sound = 'default', badge } = payload;

        const messages: ExpoPushMessage[] = [];
        const pushTokens = Array.isArray(to) ? to : [to];

        for (const pushToken of pushTokens) {
            if (!Expo.isExpoPushToken(pushToken)) {
                console.error(`❌ Push token ${pushToken} is not a valid Expo push token`);
                continue;
            }

            messages.push({
                to: pushToken,
                sound,
                title,
                body,
                data,
                badge,
                priority: 'high',
                channelId: 'default',
            });

            console.log(`\n📤 SENDING PUSH NOTIFICATION:`);
            console.log(`   To: ${pushToken}`);
            console.log(`   Title: ${title}`);
            console.log(`   Body: ${body}\n`);
        }

        if (messages.length === 0) return;

        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);

                // Log each ticket result for debugging
                ticketChunk.forEach((ticket, index) => {
                    const token = chunk[index]?.to;
                    if (ticket.status === 'ok') {
                        console.log(`   ✅ PUSH DELIVERED to Expo: ${token}`);
                        console.log(`      Ticket ID: ${ticket.id}`);
                    } else if (ticket.status === 'error') {
                        console.error(`   ❌ PUSH FAILED for ${token}:`);
                        console.error(`      Error: ${ticket.message}`);
                        if (ticket.details?.error) {
                            console.error(`      Details: ${ticket.details.error}`);
                            if (ticket.details.error === 'DeviceNotRegistered') {
                                console.error(`      ⚠️ This token is INVALID - device unregistered or token expired!`);
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('❌ Error sending push notification chunk:', error);
            }
        }

        return tickets;
    }
};

export default pushNotificationService;
