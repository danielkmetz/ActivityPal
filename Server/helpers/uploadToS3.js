const { Upload } = require("@aws-sdk/lib-storage");
const { s3Client } = require("../s3Config"); // Import the configured S3 client

const bucket = process.env.AWS_BUCKET_NAME_LOGOS;

const uploadToS3 = async (file, key) => {
  if (!file || !file.buffer) {
    throw new Error("Invalid file object. Ensure the file comes from Multer.");
  }

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype, // Optional: Set the content type for S3
    },
  });

  try {
    const result = await upload.done();
    console.log("Upload result:", result);
    return key;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
};

module.exports = { uploadToS3 };
