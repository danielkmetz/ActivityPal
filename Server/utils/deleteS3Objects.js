const { s3Client } = require('../s3Config');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const deleteS3Objects = async (keys = []) => {
    if (!keys.length) return;

    try {
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME_LOGOS,
            Delete: {
                Objects: keys.map(key => ({ Key: key })),
                Quiet: true,
            },
        };

        const response = await s3Client.send(new DeleteObjectsCommand(deleteParams));
    } catch (err) {
        console.error("❌ Failed to delete S3 segments:", err);
    }
};

module.exports = deleteS3Objects;