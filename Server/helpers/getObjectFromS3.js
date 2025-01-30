const { s3Client } = require("../s3Config"); // Import the configured S3 client
const { GetObjectCommand } = require("@aws-sdk/client-s3");

const getObjectFromS3 = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME_LOGOS,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("No object stream found in response");
    }

    return {
      body: response.Body, // Stream for the object
      contentType: response.ContentType, // Content-Type of the object
    };
  } catch (error) {
    console.error("Error fetching object from S3:", error);
    throw error;
  }
};
  
  module.exports = { getObjectFromS3 };