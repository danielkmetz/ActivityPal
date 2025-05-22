const { HeadObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../s3Config');

async function waitForObjectReady(bucket, key, maxAttempts = 8, delayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true; // ✅ Object is ready
    } catch (err) {
      if (err.name === 'NotFound') {
        console.log(`⏳ Waiting for S3 object: attempt ${attempt}/${maxAttempts}`);
        await new Promise(res => setTimeout(res, delayMs * attempt));
      } else {
        throw err; // ❌ Unexpected error
      }
    }
  }
  return false; // ❌ Timeout
}

module.exports = waitForObjectReady;