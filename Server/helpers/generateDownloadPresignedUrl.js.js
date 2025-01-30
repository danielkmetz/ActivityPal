const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Client } = require("../s3Config");

const generateDownloadPresignedUrl = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: 'activity-pal-pics', // Adjust bucket name as needed
      Key: key,
    });

    // Generate pre-signed URL
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // Expires in 1 hour
    return url;
  } catch (error) {
    console.error("Error generating download pre-signed URL:", error);
    throw error;
  }
};

module.exports = { generateDownloadPresignedUrl };
