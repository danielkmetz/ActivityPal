const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

const presignedUrlCache = new Map();

const getPresignedUrl = async (photoKey) => {
  if (!photoKey) return null;
  if (presignedUrlCache.has(photoKey)) return presignedUrlCache.get(photoKey);
  const url = await generateDownloadPresignedUrl(photoKey);
  presignedUrlCache.set(photoKey, url);
  return url;
};

module.exports = { getPresignedUrl };
