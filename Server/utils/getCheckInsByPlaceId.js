const User  = require('../models/User'); // adjust as needed
const { resolveTaggedUsers, resolveTaggedPhotoUsers } = require('./userPosts'); // assuming shared helpers
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js'); // adjust path to your AWS utility

async function getCheckInsByPlaceId(placeId) {
  try {
    const usersWithCheckIns = await User.find({ 'checkIns.placeId': placeId })
      .select('firstName lastName profilePic checkIns')
      .lean();

    const allCheckIns = [];

    for (const user of usersWithCheckIns) {
      const profilePicUrl = user.profilePic?.photoKey
        ? await generateDownloadPresignedUrl(user.profilePic.photoKey)
        : null;

      const matchingCheckIns = user.checkIns.filter(checkIn => checkIn.placeId === placeId);

      for (const checkIn of matchingCheckIns) {
        const taggedUsers = await resolveTaggedUsers(checkIn.taggedUsers || []);
        const photos = await resolveTaggedPhotoUsers(checkIn.photos || []);

        allCheckIns.push({
          __typename: 'CheckIn',
          _id: checkIn._id,
          userId: user._id,
          fullName: `${user.firstName} ${user.lastName}`,
          message: checkIn.message,
          date: new Date(checkIn.date).toISOString(),
          sortDate: new Date(checkIn.date).toISOString(),
          profilePic: user.profilePic || null,
          profilePicUrl,
          placeId: checkIn.placeId,
          businessName: '', // can be filled in by parent resolver if needed
          taggedUsers,
          photos,
          likes: checkIn.likes || [],
          comments: checkIn.comments || [],
          type: 'check-in',
        });
      }
    }

    return allCheckIns;
  } catch (err) {
    console.error('❌ Error in getCheckInsByPlaceId:', err);
    return [];
  }
}

module.exports = {getCheckInsByPlaceId}
