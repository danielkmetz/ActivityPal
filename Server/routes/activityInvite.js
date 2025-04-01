const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Business = require('../models/Business');
const dayjs = require('dayjs');
const mongoose = require('mongoose');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');


// Get all activity invites for a user
router.get('/user/:userId/invites', async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId).select('activityInvites');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const enrichedInvites = await Promise.all(
            user.activityInvites.map(async (invite) => {
                // 1. Enrich business
                const business = await Business.findOne({ placeId: invite.placeId }).lean();
                let presignedUrl = null;
                if (business?.logoKey) {
                    presignedUrl = await generateDownloadPresignedUrl(business.logoKey);
                }

                // 2. Enrich recipients
                const recipientIds = invite.recipients.map(r => r.userId);
                const recipientUsers = await User.find({ _id: { $in: recipientIds } })
                    .select('_id firstName lastName profilePic')
                    .lean();

                const enrichedRecipients = await Promise.all(
                    invite.recipients.map(async (r) => {
                        const user = recipientUsers.find(u => u._id.toString() === r.userId.toString());
                        let presignedProfileUrl = null;
                        if (user?.profilePic?.photoKey) {
                            presignedProfileUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
                        }

                        return {
                            userId: r.userId?.toString() || user?._id?.toString(),
                            status: r.status,
                            firstName: user?.firstName || '',
                            lastName: user?.lastName || '',
                            presignedProfileUrl,
                        };
                    })
                );

                return {
                    ...invite.toObject(),
                    recipients: enrichedRecipients,
                    business: {
                        ...business,
                        presignedPhotoUrl: presignedUrl,
                    },
                };
            })
        );

        res.status(200).json({ success: true, invites: enrichedInvites });
    } catch (err) {
        console.error('Error fetching invites:', err);
        res.status(500).json({ error: 'Failed to fetch invites', details: err.message });
    }
});

router.post('/send', async (req, res) => {
    const { senderId, recipientIds, placeId, dateTime, message, isPublic, note } = req.body;

    try {
        const sender = await User.findById(senderId);
        if (!sender) {
            return res.status(404).json({ error: 'Sender not found' });
        }

        const business = await Business.findOne({ placeId }).lean();
        if (!business) {
            return res.status(404).json({ error: 'Business not found for this placeId' });
        }

        const sharedInviteId = new mongoose.Types.ObjectId();
        const formattedDateTime = dayjs(dateTime).format('MMMM D [at] h:mm A');

        // 🟢 Base invite data
        const baseInvite = {
            _id: sharedInviteId,
            senderId,
            placeId,
            note,
            dateTime,
            message,
            isPublic,
            createdAt: new Date(),
        };

        // ✉️ Push invite to each recipient with their individual status
        const recipientUpdatePromises = recipientIds.map((recipientId) => {
            const recipientInvite = {
                ...baseInvite,
                status: 'pending',
                recipients: recipientIds.map(id => ({
                    userId: id,
                    status: id === recipientId ? 'pending' : 'pending',
                })),
            };

            const notification = {
                type: 'activityInvite',
                message: `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`,
                relatedId: sender._id,
                typeRef: 'User',
                postType: 'activityInvite',
                createdAt: new Date(),
            };

            return User.findByIdAndUpdate(recipientId, {
                $push: {
                    activityInvites: recipientInvite,
                    notifications: notification,
                },
            });
        });

        // 🧑‍💼 Sender's version
        const senderInvite = {
            ...baseInvite,
            status: 'sent',
            recipients: recipientIds.map(id => ({ userId: id, status: 'pending' })),
        };

        const senderUpdate = User.findByIdAndUpdate(senderId, {
            $push: {
                activityInvites: senderInvite,
            },
        });

        await Promise.all([...recipientUpdatePromises, senderUpdate]);

        // 🖼️ Presigned image
        let presignedPhotoUrl = null;
        if (business.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        res.status(200).json({
            success: true,
            message: 'Invite sent!',
            senderInvite: {
                ...senderInvite,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });
    } catch (err) {
        console.error('❌ Failed to send invites:', err);
        res.status(500).json({ error: 'Failed to send invites', details: err.message });
    }
});

// Accept an activity invite
router.post('/accept', async (req, res) => {
    const { recipientId, inviteId } = req.body;

    try {
        const recipient = await User.findById(recipientId);
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

        const invite = recipient.activityInvites.id(inviteId);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        // Update status to accepted
        invite.status = 'accepted';

        // Update the recipient's status inside the invite
        const recipientEntry = invite.recipients.find(r => r.userId.toString() === recipientId);
        if (recipientEntry) recipientEntry.status = 'accepted';

        // Remove the original invite notification
        recipient.notifications = recipient.notifications.filter((notif) => {
            return !(
                notif.type === 'activityInvite' &&
                notif.relatedId.toString() === invite.senderId.toString()
            );
        });

        await recipient.save();

        // Lookup business info
        const business = await Business.findOne({ placeId: invite.placeId });
        const dayjs = require('dayjs');
        const formattedDate = dayjs(invite.dateTime).format('MMMM D [at] h:mm A');
        const recipientName = recipient.firstName;

        // Notification to sender
        const senderNotification = {
            type: 'activityInviteAccepted',
            message: `${recipientName} accepted your activity invite to ${business.businessName} on ${formattedDate}`,
            relatedId: recipient._id,
            typeRef: 'User',
            postType: 'activityInviteAccepted',
            createdAt: new Date(),
        };

        // Confirmation to recipient
        const recipientConfirmation = {
            type: 'confirmation',
            message: `You accepted the invite to ${business.businessName} on ${formattedDate}`,
            relatedId: invite._id,
            typeRef: 'Invite',
            postType: 'activityInviteConfirmed',
            createdAt: new Date(),
        };

        // Push notifications
        await User.findByIdAndUpdate(invite.senderId, {
            $push: { notifications: senderNotification },
        });

        await User.findByIdAndUpdate(recipientId, {
            $push: { notifications: recipientConfirmation },
        });

        // Refresh updated recipient for enriched response
        const updatedRecipient = await User.findById(recipientId)
            .select('activityInvites')
            .lean();

        const updatedInvite = updatedRecipient.activityInvites.find(
            i => i._id.toString() === inviteId.toString()
        );

        // Enrich recipients
        const recipientIds = updatedInvite.recipients.map(r => r.userId);
        const recipientUsers = await User.find({ _id: { $in: recipientIds } })
            .select('_id firstName lastName profilePic')
            .lean();

        const enrichedRecipients = await Promise.all(
            updatedInvite.recipients.map(async (r) => {
                const user = recipientUsers.find(u => u._id.toString() === r.userId.toString());
                let presignedProfileUrl = null;
                if (user?.profilePic?.photoKey) {
                    presignedProfileUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
                }

                return {
                    ...r,
                    firstName: user?.firstName || '',
                    lastName: user?.lastName || '',
                    presignedProfileUrl,
                };
            })
        );

        // Get presigned logo URL
        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        res.status(200).json({
            success: true,
            message: 'Invite accepted!',
            invite: {
                ...updatedInvite,
                recipients: enrichedRecipients,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        console.error('Error in /accept:', err);
        res.status(500).json({ error: 'Failed to accept invite', details: err.message });
    }
});

// Reject an activity invite
router.post('/reject', async (req, res) => {
    const { recipientId, inviteId } = req.body;

    try {
        const recipient = await User.findById(recipientId);
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

        const invite = recipient.activityInvites.id(inviteId);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        // Update status to declined
        invite.status = 'declined';

        // Update the status inside the recipients array
        const recipientEntry = invite.recipients.find(r => r.userId.toString() === recipientId);
        if (recipientEntry) recipientEntry.status = 'declined';

        // Remove the original activityInvite notification
        recipient.notifications = recipient.notifications.filter((notif) => {
            return !(
                notif.type === 'activityInvite' &&
                notif.relatedId.toString() === invite.senderId.toString()
            );
        });

        await recipient.save();

        // Lookup business name and format date
        const business = await Business.findOne({ placeId: invite.placeId });
        const dayjs = require('dayjs');
        const formattedDate = dayjs(invite.dateTime).format('MMMM D [at] h:mm A');
        const recipientName = recipient.firstName;

        // Sender gets notified
        const notificationToSender = {
            type: 'activityInviteDeclined',
            message: `${recipientName} declined your activity invite to ${business.businessName} on ${formattedDate}`,
            relatedId: recipient._id,
            typeRef: 'User',
            postType: 'activityInviteDeclined',
            createdAt: new Date(),
        };

        // Recipient gets confirmation
        const recipientConfirmation = {
            type: 'confirmation',
            message: `You declined the invite to ${business.businessName} on ${formattedDate}`,
            relatedId: invite._id,
            typeRef: 'Invite',
            postType: 'activityInviteDeclinedConfirmation',
            createdAt: new Date(),
        };

        await User.findByIdAndUpdate(invite.senderId, {
            $push: { notifications: notificationToSender },
        });

        await User.findByIdAndUpdate(recipientId, {
            $push: { notifications: recipientConfirmation },
        });

        // Enrich the updated invite
        const updatedRecipient = await User.findById(recipientId).select('activityInvites').lean();
        const updatedInvite = updatedRecipient.activityInvites.find(i => i._id.toString() === inviteId);

        // Enrich recipients with profile info
        const recipientIds = updatedInvite.recipients.map(r => r.userId);
        const recipientUsers = await User.find({ _id: { $in: recipientIds } })
            .select('_id firstName lastName profilePic')
            .lean();

        const enrichedRecipients = await Promise.all(
            updatedInvite.recipients.map(async (r) => {
                const user = recipientUsers.find(u => u._id.toString() === r.userId.toString());
                let presignedProfileUrl = null;
                if (user?.profilePic?.photoKey) {
                    presignedProfileUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
                }

                return {
                    ...r,
                    firstName: user?.firstName || '',
                    lastName: user?.lastName || '',
                    presignedProfileUrl,
                };
            })
        );

        // Generate business photo URL
        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        res.status(200).json({
            success: true,
            message: 'Invite declined, sender notified.',
            invite: {
                ...updatedInvite,
                recipients: enrichedRecipients,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        console.error('Error in /reject:', err);
        res.status(500).json({ error: 'Failed to decline invite', details: err.message });
    }
});

router.put('/edit', async (req, res) => {
    const { recipientId, inviteId, updates, recipientIds } = req.body;

    try {
        const sender = await User.findById(recipientId);
        const senderInvite = sender.activityInvites.id(inviteId);

        if (!senderInvite || senderInvite.status !== 'sent') {
            return res.status(400).json({ error: 'Only the sender can edit this invite' });
        }

        const originalRecipientIds = senderInvite.recipients.map(r => r.userId.toString());

        Object.assign(senderInvite, updates);
        senderInvite.recipients = recipientIds.map(id => ({ userId: id, status: 'pending' }));
        await sender.save();

        const newPlaceId = updates.placeId || senderInvite.placeId;
        const business = await Business.findOne({ placeId: newPlaceId }).lean();

        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        const dayjs = require('dayjs');
        const utc = require('dayjs/plugin/utc');
        const timezone = require('dayjs/plugin/timezone');
        dayjs.extend(utc);
        dayjs.extend(timezone);

        const formattedDateTime = dayjs(updates.dateTime || senderInvite.dateTime)
            .tz('America/Chicago')
            .format('MMMM D [at] h:mm A');

        const updatedMessage = `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`;

        await Promise.all(recipientIds.map(async (userId) => {
            const user = await User.findById(userId);
            if (!user) return;

            const existingInvite = user.activityInvites.find(inv => inv._id.toString() === inviteId);

            if (existingInvite) {
                if (existingInvite.status === 'pending') {
                    Object.assign(existingInvite, updates);

                    const notification = user.notifications.find(
                        n => n.type === 'activityInvite' &&
                            n.relatedId.toString() === recipientId &&
                            n.postType === 'activityInvite'
                    );

                    if (notification) {
                        notification.message = updatedMessage;
                        notification.createdAt = new Date();
                    }
                }
            } else {
                user.activityInvites.push({
                    _id: inviteId,
                    senderId: recipientId,
                    recipients: recipientIds.map(id => ({ userId: id, status: 'pending' })),
                    placeId: newPlaceId,
                    note: updates.note || '',
                    dateTime: updates.dateTime,
                    message: updates.message || '',
                    isPublic: updates.isPublic || false,
                    status: 'pending',
                    createdAt: new Date(),
                });

                user.notifications.push({
                    type: 'activityInvite',
                    message: updatedMessage,
                    relatedId: recipientId,
                    typeRef: 'User',
                    postType: 'activityInvite',
                    createdAt: new Date(),
                });
            }

            await user.save();
        }));

        const removedUserIds = originalRecipientIds.filter(originalId => !recipientIds.includes(originalId));

        await Promise.all(removedUserIds.map(async (removedId) => {
            const removedUser = await User.findById(removedId);
            if (!removedUser) return;

            removedUser.activityInvites = removedUser.activityInvites.filter(inv => inv._id.toString() !== inviteId);
            removedUser.notifications = removedUser.notifications.filter(
                n => !(n.type === 'activityInvite' &&
                    n.relatedId.toString() === recipientId &&
                    n.postType === 'activityInvite')
            );

            await removedUser.save();
        }));

        res.status(200).json({
            success: true,
            message: 'Invite and notifications updated for all recipients!',
            updatedInvite: {
                ...senderInvite.toObject(),
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        res.status(500).json({ error: 'Failed to edit invite', details: err.message });
    }
});

router.delete('/delete', async (req, res) => {
    const { senderId, inviteId, recipientIds } = req.body;

    try {
        // Convert senderId to ObjectId if needed
        const senderObjectId = new mongoose.Types.ObjectId(senderId);

        // 1. Remove invite from sender
        await User.findByIdAndUpdate(senderId, {
            $pull: { activityInvites: { _id: inviteId } }
        });

        // 2. Remove invite + matching notifications from each recipient
        const recipientUpdatePromises = recipientIds.map(recipientId =>
            User.findByIdAndUpdate(recipientId, {
                $pull: {
                    activityInvites: { _id: inviteId },
                    notifications: {
                        type: 'activityInvite',
                        relatedId: senderObjectId, // 💥 this ensures proper matching
                        postType: 'activityInvite'  // ✅ Optional if you want to narrow further
                    },
                },
            })
        );

        await Promise.all(recipientUpdatePromises);

        res.status(200).json({ success: true, message: 'Invite and related notifications deleted from all accounts.' });
    } catch (err) {
        console.error('❌ Error deleting invite:', err);
        res.status(500).json({ error: 'Failed to delete invite', details: err.message });
    }
});

module.exports = router;
