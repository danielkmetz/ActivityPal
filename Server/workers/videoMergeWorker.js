const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { PassThrough } = require('stream');
const { Upload } = require('@aws-sdk/lib-storage');
const { s3Client } = require('../s3Config');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const axios = require('axios');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegPath);

const streamSegmentFromS3 = async (mediaKey) => {
  const url = await getPresignedUrl(mediaKey);
  const response = await axios.get(url, { responseType: 'stream' });
  return response.data; // This is a readable stream
};

async function mergeStreamsToS3(mediaKeys, outputFileName) {
  const finalMediaKey = `stories/${outputFileName}`;
  const passThroughStream = new PassThrough();

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.AWS_BUCKET_NAME_LOGOS,
      Key: finalMediaKey,
      Body: passThroughStream,
      ContentType: 'video/mp4',
    },
  });

  const ffmpegCmd = ffmpeg();

  // 👉 Step 1: Load each S3 stream as input
  const inputLabels = [];
  for (let i = 0; i < mediaKeys.length; i++) {
    const stream = await streamSegmentFromS3(mediaKeys[i]);
    ffmpegCmd.input(stream)
      .inputFormat('mp4') // ← Tell FFmpeg each stream is MP4 format
      .inputOptions(['-thread_queue_size 512']);
    inputLabels.push(`[${i}:v:0][${i}:a:0]`);
  }

  // 👉 Step 2: Build concat filter
  const filter = `${inputLabels.join('')}concat=n=${mediaKeys.length}:v=1:a=1[outv][outa]`;

  ffmpegCmd
    .complexFilter([filter])
    .outputOptions([
      '-map', '[outv]',
      '-map', '[outa]',
      '-preset', 'ultrafast',
      '-movflags', 'frag_keyframe+empty_moov',
    ])
    .format('mp4')
    .on('start', cmd => console.log('▶️ FFmpeg started:', cmd))
    .on('stderr', line => console.log('🖨️', line))
    .on('end', () => console.log('✅ FFmpeg stream ended'))
    .on('error', err => console.error('❌ FFmpeg error:', err.message))
    .pipe(passThroughStream, { end: true });

  await upload.done();
  console.log('✅ Uploaded to S3 as:', finalMediaKey);
  return finalMediaKey;
}


module.exports = mergeStreamsToS3;