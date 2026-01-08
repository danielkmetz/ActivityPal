const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');

const oid = (v) => (isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : v);

async function buildMediaFromPhotos(photos = [], uploadedBy) {
  return Promise.all(
    photos.map(async (p) => {
      const formattedTagged = Array.isArray(p.taggedUsers)
        ? p.taggedUsers.map((tag) => ({
          userId: oid(tag.userId),
          x: tag.x,
          y: tag.y,
        }))
        : [];
      return {
        photoKey: p.photoKey,
        uploadedBy: oid(uploadedBy),
        description: p.description || null,
        taggedUsers: formattedTagged,
        uploadDate: new Date(),
      };
    })
  );
}

module.exports = { buildMediaFromPhotos }