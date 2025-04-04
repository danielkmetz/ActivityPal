const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Business = require('../models/Business');
const ActivityInvite = require('../models/ActivityInvites.js')
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

        // 1️⃣ Fetch full invite documents from ActivityInvite collection
        const invites = await ActivityInvite.find({ _id: { $in: user.activityInvites } }).lean();

        const enrichedInvites = await Promise.all(
            invites.map(async (invite) => {
                // 2️⃣ Fetch and enrich business
                const business = await Business.findOne({ placeId: invite.placeId }).lean();
                let presignedBusinessUrl = null;
                if (business?.logoKey) {
                    presignedBusinessUrl = await generateDownloadPresignedUrl(business.logoKey);
                }

                // 3️⃣ Enrich recipients
                const recipientIds = invite.recipients.map(r => r.userId);
                const recipientUsers = await User.find({ _id: { $in: recipientIds } })
                    .select('_id firstName lastName profilePic')
                    .lean();

                const enrichedRecipients = await Promise.all(
                    invite.recipients.map(async (r) => {
                        const user = recipientUsers.find(u => u._id.toString() === r.userId.toString());
                        let profileUrl = null;
                        if (user?.profilePic?.photoKey) {
                            profileUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
                        }

                        return {
                            userId: r.userId?.toString() || user?._id?.toString(),
                            status: r.status,
                            firstName: user?.firstName || '',
                            lastName: user?.lastName || '',
                            presignedProfileUrl: profileUrl,
                        };
                    })
                );

                // 4️⃣ Enrich sender
                const sender = await User.findById(invite.senderId)
                    .select('_id firstName lastName profilePic')
                    .lean();

                let senderProfileUrl = null;
                if (sender?.profilePic?.photoKey) {
                    senderProfileUrl = await generateDownloadPresignedUrl(sender.profilePic.photoKey);
                }

                const enrichedSender = {
                    userId: sender?._id?.toString(),
                    firstName: sender?.firstName || '',
                    lastName: sender?.lastName || '',
                    presignedProfileUrl: senderProfileUrl,
                };

                // 5️⃣ Return fully enriched invite
                return {
                    ...invite,
                    id: invite._id?.toString(),
                    recipients: enrichedRecipients,
                    sender: enrichedSender,
                    business: {
                        ...business,
                        presignedPhotoUrl: presignedBusinessUrl,
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
    const { senderId, recipientIds, placeId, dateTime, message, isPublic, note, businessName } = req.body;

    try {
        const sender = await User.findById(senderId);
        if (!sender) {
            return res.status(404).json({ error: 'Sender not found' });
        }

        let business = await Business.findOne({ placeId }).lean();
        if (!business) {
            const newBusiness = new Business({
                placeId,
                businessName: businessName || "Unknown Business",
                location: "N/A", // make sure `location` exists in req.body if needed
                firstName: "N/A",
                lastName: "N/A",
                email: "N/A",
                password: "N/A",
                events: [],
                reviews: [],
            });
        
            await newBusiness.save(); // ✅ persist it to MongoDB
            business = newBusiness.toObject(); // to match `.lean()` format from the previous path
        }

        const formattedDateTime = dayjs(dateTime).format('MMMM D [at] h:mm A');

        // 1️⃣ Create the shared invite in ActivityInvite collection
        const invite = await ActivityInvite.create({
            senderId,
            recipients: recipientIds.map(id => ({ userId: id, status: 'pending' })),
            placeId,
            dateTime,
            message,
            isPublic,
            note,
        });

        // 2️⃣ Prepare notification for each recipient
        const notification = {
            type: 'activityInvite',
            message: `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`,
            relatedId: sender._id,
            targetId: invite._id,
            typeRef: 'User',
            postType: 'activityInvite',
            createdAt: new Date(),
        };

        // 3️⃣ Update all recipients with invite ID + notification
        const recipientUpdates = recipientIds.map(recipientId => {
            return User.findByIdAndUpdate(recipientId, {
                $push: {
                    activityInvites: invite._id,
                    notifications: notification,
                },
            });
        });

        // 4️⃣ Update sender with invite ID only
        const senderUpdate = User.findByIdAndUpdate(senderId, {
            $push: {
                activityInvites: invite._id,
            },
        });

        await Promise.all([...recipientUpdates, senderUpdate]);

        // 5️⃣ Generate presigned image
        let presignedPhotoUrl = null;
        if (business.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        };

        // 5️⃣ Enrich sender
        const presignedSenderProfileUrl = sender?.profilePic?.photoKey
        ? await generateDownloadPresignedUrl(sender.profilePic.photoKey)
        : null;

        const enrichedSender = {
        userId: sender._id.toString(),
        firstName: sender.firstName,
        lastName: sender.lastName,
        presignedProfileUrl: presignedSenderProfileUrl,
        };

        // 6️⃣ Enrich recipients
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

        res.status(200).json({
            success: true,
            message: 'Invite sent!',
            invite: {
                ...invite.toObject(),
                sender: enrichedSender,
                recipients: enrichedRecipients,
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

        const invite = await ActivityInvite.findById(inviteId);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        // 🧠 Update global invite status based on all recipient responses
        const allAccepted = invite.recipients.every(r => r.status === 'accepted');
        const anyDeclined = invite.recipients.some(r => r.status === 'declined');
        const anyPending = invite.recipients.some(r => r.status === 'pending');

        if (allAccepted) {
            invite.status = 'accepted';
        } else if (anyDeclined && !anyPending) {
            invite.status = 'declined';
        } else {
            invite.status = 'pending';
        }

        // Update the specific recipient's status inside the invite
        const recipientEntry = invite.recipients.find(r => r.userId.toString() === recipientId);
        if (recipientEntry) recipientEntry.status = 'accepted';

        await invite.save();

        // Remove original invite notification from recipient
        recipient.notifications = recipient.notifications.filter(notif => {
            return !(
                notif.type === 'activityInvite' &&
                notif.relatedId.toString() === invite.senderId.toString()
            );
        });

        await recipient.save();

        // Format for notification
        const business = await Business.findOne({ placeId: invite.placeId }).lean();
        const dayjs = require('dayjs');
        const formattedDate = dayjs(invite.dateTime).format('MMMM D [at] h:mm A');
        const recipientName = recipient.firstName;

        // Notifications
        const senderNotification = {
            type: 'activityInviteAccepted',
            message: `${recipientName} accepted your activity invite to ${business.businessName} on ${formattedDate}`,
            relatedId: recipient._id,
            typeRef: 'User',
            postType: 'activityInviteAccepted',
            createdAt: new Date(),
        };

        const recipientConfirmation = {
            type: 'activityInviteAccepted',
            message: `You accepted the invite to ${business.businessName} on ${formattedDate}`,
            relatedId: invite._id,
            typeRef: 'ActivityInvite',
            postType: 'activityInviteConfirmed',
            createdAt: new Date(),
        };

        await Promise.all([
            User.findByIdAndUpdate(invite.senderId, { $push: { notifications: senderNotification } }),
            User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
        ]);

        // Enrich recipients
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

        // Enrich sender
        const sender = await User.findById(invite.senderId)
            .select('_id firstName lastName profilePic')
            .lean();

        let presignedSenderProfileUrl = null;
        if (sender?.profilePic?.photoKey) {
            presignedSenderProfileUrl = await generateDownloadPresignedUrl(sender.profilePic.photoKey);
        }

        const enrichedSender = {
            userId: sender?._id?.toString(),
            firstName: sender?.firstName || '',
            lastName: sender?.lastName || '',
            presignedProfileUrl: presignedSenderProfileUrl,
        };

        // Business logo URL
        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        res.status(200).json({
            success: true,
            message: 'Invite accepted!',
            invite: {
                ...invite.toObject(),
                recipients: enrichedRecipients,
                sender: enrichedSender,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        console.error('❌ Error in /accept:', err);
        res.status(500).json({ error: 'Failed to accept invite', details: err.message });
    }
});

router.post('/reject', async (req, res) => {
    const { recipientId, inviteId } = req.body;

    try {
        const recipient = await User.findById(recipientId);
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

        const invite = await ActivityInvite.findById(inviteId);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        // 🧠 Update global invite status based on all recipient responses
        const allAccepted = invite.recipients.every(r => r.status === 'accepted');
        const anyDeclined = invite.recipients.some(r => r.status === 'declined');
        const anyPending = invite.recipients.some(r => r.status === 'pending');

        if (allAccepted) {
            invite.status = 'accepted';
        } else if (anyDeclined && !anyPending) {
            invite.status = 'declined';
        } else {
            invite.status = 'pending';
        }

        // Update status inside the recipients array
        const recipientEntry = invite.recipients.find(r => r.userId.toString() === recipientId);
        if (recipientEntry) recipientEntry.status = 'declined';

        await invite.save();

        // Remove original activityInvite notification
        recipient.notifications = recipient.notifications.filter(notif =>
            !(notif.type === 'activityInvite' && notif.relatedId.toString() === invite.senderId.toString())
        );

        await recipient.save();

        // Lookup business and format
        const business = await Business.findOne({ placeId: invite.placeId }).lean();
        const dayjs = require('dayjs');
        const formattedDate = dayjs(invite.dateTime).format('MMMM D [at] h:mm A');
        const recipientName = recipient.firstName;

        // Notifications
        const senderNotification = {
            type: 'activityInviteDeclined',
            message: `${recipientName} declined your activity invite to ${business.businessName} on ${formattedDate}`,
            relatedId: recipient._id,
            typeRef: 'User',
            postType: 'activityInviteDeclined',
            createdAt: new Date(),
        };

        const recipientConfirmation = {
            type: 'activityInviteDeclined',
            message: `You declined the invite to ${business.businessName} on ${formattedDate}`,
            relatedId: invite._id,
            typeRef: 'ActivityInvite',
            postType: 'activityInviteDeclinedConfirmation',
            createdAt: new Date(),
        };

        await Promise.all([
            User.findByIdAndUpdate(invite.senderId, { $push: { notifications: senderNotification } }),
            User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
        ]);

        // Enrich recipients
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

        // Enrich sender
        const sender = await User.findById(invite.senderId)
            .select('_id firstName lastName profilePic')
            .lean();

        let presignedSenderProfileUrl = null;
        if (sender?.profilePic?.photoKey) {
            presignedSenderProfileUrl = await generateDownloadPresignedUrl(sender.profilePic.photoKey);
        }

        const enrichedSender = {
            userId: sender?._id?.toString(),
            firstName: sender?.firstName || '',
            lastName: sender?.lastName || '',
            presignedProfileUrl: presignedSenderProfileUrl,
        };

        // Business photo
        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        res.status(200).json({
            success: true,
            message: 'Invite declined, sender notified.',
            invite: {
                ...invite.toObject(),
                recipients: enrichedRecipients,
                sender: enrichedSender,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        console.error('❌ Error in /reject:', err);
        res.status(500).json({ error: 'Failed to decline invite', details: err.message });
    }
});

router.put('/edit', async (req, res) => {
    const { recipientId, inviteId, updates, recipientIds } = req.body;

    try {
        const invite = await ActivityInvite.findById(inviteId);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        if (invite.senderId.toString() !== recipientId) {
            return res.status(400).json({ error: 'Only the sender can edit this invite' });
        }

        const sender = await User.findById(recipientId);
        if (!sender) return res.status(404).json({ error: 'Sender not found' });

        const originalRecipientIds = invite.recipients.map(r => r.userId.toString());

        // ✅ Update the invite document
        Object.assign(invite, updates);
        invite.recipients = recipientIds.map(id => ({ userId: id, status: 'pending' }));
        invite.status = 'sent'; // reset status
        await invite.save();

        let business = await Business.findOne({ placeId: invite.placeId }).lean();
        if (!business) {
            const newBusiness = new Business({
                placeId: invite.placeId,
                businessName: updates.businessName || "Unknown Business",
                location: "N/A", // make sure `location` exists in req.body if needed
                firstName: "N/A",
                lastName: "N/A",
                email: "N/A",
                password: "N/A",
                events: [],
                reviews: [],
            });
        
            await newBusiness.save(); // ✅ persist it to MongoDB
            business = newBusiness.toObject(); // to match `.lean()` format from the previous path
        }

        let presignedPhotoUrl = null;
        if (business?.logoKey) {
            presignedPhotoUrl = await generateDownloadPresignedUrl(business.logoKey);
        }

        // Format notification message
        const dayjs = require('dayjs');
        const utc = require('dayjs/plugin/utc');
        const timezone = require('dayjs/plugin/timezone');
        dayjs.extend(utc);
        dayjs.extend(timezone);

        const formattedDateTime = dayjs(invite.dateTime).tz('America/Chicago').format('MMMM D [at] h:mm A');
        const updatedMessage = `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`;

        // ✅ Add/update invite reference and notification for each recipient
        await Promise.all(recipientIds.map(async (userId) => {
            const user = await User.findById(userId);
            if (!user) return;

            const hasInvite = user.activityInvites.some(id => id.toString() === inviteId);

            if (!hasInvite) {
                user.activityInvites.push(invite._id);
            }

            const existingNotif = user.notifications.find(n =>
                n.type === 'activityInvite' &&
                n.relatedId.toString() === sender._id.toString() &&
                n.postType === 'activityInvite'
            );

            if (existingNotif) {
                existingNotif.message = updatedMessage;
                existingNotif.createdAt = new Date();
            } else {
                user.notifications.push({
                    type: 'activityInvite',
                    message: updatedMessage,
                    relatedId: sender._id,
                    typeRef: 'User',
                    postType: 'activityInvite',
                    createdAt: new Date(),
                });
            }

            await user.save();
        }));

        // ✅ Remove invite reference + notification from removed users
        const removedUserIds = originalRecipientIds.filter(id => !recipientIds.includes(id));
        await Promise.all(removedUserIds.map(async (removedId) => {
            const removedUser = await User.findById(removedId);
            if (!removedUser) return;

            removedUser.activityInvites = removedUser.activityInvites.filter(i => i.toString() !== inviteId);
            removedUser.notifications = removedUser.notifications.filter(n =>
                !(n.type === 'activityInvite' &&
                    n.relatedId.toString() === sender._id.toString() &&
                    n.postType === 'activityInvite')
            );

            await removedUser.save();
        }));

        // Enrich sender info for response
        const presignedSenderProfileUrl = sender?.profilePic?.photoKey
            ? await generateDownloadPresignedUrl(sender.profilePic.photoKey)
            : null;

        const enrichedSender = {
            userId: sender._id.toString(),
            firstName: sender.firstName,
            lastName: sender.lastName,
            profilePicUrl: presignedSenderProfileUrl,
        };

        // Enrich recipients
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
                    userId: r.userId.toString(),
                    status: r.status,
                    firstName: user?.firstName || '',
                    lastName: user?.lastName || '',
                    profilePicUrl: presignedProfileUrl,
                };
            })
        );

        res.status(200).json({
            success: true,
            message: 'Invite and notifications updated for all recipients!',
            updatedInvite: {
                ...invite.toObject(),
                recipients: enrichedRecipients,
                sender: enrichedSender,
                business: {
                    ...business,
                    presignedPhotoUrl,
                },
            },
        });

    } catch (err) {
        console.error('❌ Error editing invite:', err);
        res.status(500).json({ error: 'Failed to edit invite', details: err.message });
    }
});

router.delete('/delete', async (req, res) => {
    const { senderId, inviteId, recipientIds } = req.body;

    try {
        const senderObjectId = new mongoose.Types.ObjectId(senderId);
        const inviteObjectId = new mongoose.Types.ObjectId(inviteId);

        // 1️⃣ Delete the invite document
        await ActivityInvite.findByIdAndDelete(inviteObjectId);

        // 2️⃣ Remove invite from sender
        await User.findByIdAndUpdate(senderObjectId, {
            $pull: { activityInvites: inviteObjectId },
        });

        // 3️⃣ Remove invite + invite notifications from recipients
        const recipientUpdatePromises = recipientIds.map(recipientId =>
            User.findByIdAndUpdate(recipientId, {
                $pull: {
                    activityInvites: inviteObjectId,
                    notifications: {
                        type: 'activityInvite',
                        relatedId: senderObjectId,
                        postType: 'activityInvite',
                    },
                },
            })
        );

        await Promise.all(recipientUpdatePromises);

        // 4️⃣ Remove "accepted" or "declined" notifications from sender
        await User.findByIdAndUpdate(senderObjectId, {
            $pull: {
                notifications: {
                    type: { $in: ['activityInviteAccepted', 'activityInviteDeclined'] },
                    postType: { $in: ['activityInviteAccepted', 'activityInviteDeclined'] },
                    relatedId: { $in: recipientIds.map(id => new mongoose.Types.ObjectId(id)) },
                },
            },
        });

        res.status(200).json({
            success: true,
            message: 'Invite and related notifications deleted from all accounts.',
        });

    } catch (err) {
        console.error('❌ Error deleting invite:', err);
        res.status(500).json({
            error: 'Failed to delete invite',
            details: err.message,
        });
    }
});

router.post('/request', async (req, res) => {
    const { userId, inviteId } = req.body;
  
    try {
      const invite = await ActivityInvite.findById(inviteId);
      if (!invite) return res.status(404).json({ error: 'Invite not found' });
  
      const alreadyRequested = invite.requests?.some(r => r.userId.toString() === userId);
      const alreadyInvited = invite.recipients?.some(r => r.userId.toString() === userId);
  
      if (alreadyRequested || alreadyInvited) {
        return res.status(400).json({ error: 'You have already requested or been invited' });
      }
  
      invite.requests.push({ userId });
      await invite.save();
  
      res.status(200).json({ success: true, message: 'Request sent!' });
    } catch (err) {
      console.error('❌ Failed to request invite:', err);
      res.status(500).json({ error: 'Failed to request invite' });
    }
});

module.exports = router;
