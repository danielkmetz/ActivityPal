// const { parentPort, workerData } = require('worker_threads');
// const ffmpeg = require('fluent-ffmpeg');
// const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// const { PassThrough } = require('stream');
// const { Upload } = require('@aws-sdk/lib-storage');
// const { s3Client } = require('../s3Config');
// const fs = require('fs');
// const os = require('os');

// ffmpeg.setFfmpegPath(ffmpegPath);

// (async () => {
//   const { concatListPath, outputFileName } = workerData;
//   const finalMediaKey = `stories/${outputFileName}`;
//   const timeoutMs = 30000;

//   console.log(`🚀 Will upload to S3 as: ${finalMediaKey}`);
//   console.log(`📄 Concat List Content:\n`, fs.readFileSync(concatListPath, 'utf-8'));

//   const passThroughStream = new PassThrough();
//   let ffmpegEnded = false;

//   try {
//     const upload = new Upload({
//       client: s3Client,
//       params: {
//         Bucket: process.env.AWS_BUCKET_NAME_LOGOS,
//         Key: finalMediaKey,
//         Body: passThroughStream,
//         ContentType: 'video/mp4',
//       },
//     });

//     const streamFinished = new Promise((resolve, reject) => {
//       passThroughStream.on('finish', resolve);
//       passThroughStream.on('error', reject);
//     });

//     const command = ffmpeg()
//       .input(concatListPath)
//       .inputOptions(['-f', 'concat', '-safe', '0', '-analyzeduration', '100M', '-probesize', '100M'])
//       .outputOptions([
//         '-c', 'copy',
//         '-c:a', 'aac',
//         '-preset', 'ultrafast',
//         '-threads', `${os.cpus().length}`,
//         '-movflags', 'frag_keyframe+empty_moov',
//       ])
//       .format('mp4')
//       .on('start', cmd => {
//         console.log('▶️ FFmpeg started with command:', cmd);
//         setTimeout(() => {
//           if (!ffmpegEnded) {
//             console.error('⏰ FFmpeg timeout — forcing kill');
//             command.kill('SIGKILL');
//           }
//         }, timeoutMs);
//       })
//       .on('progress', p => console.log(`📈 Progress: ${JSON.stringify(p)}`))
//       .on('stderr', line => console.log('🖨️ FFmpeg output:', line))
//       .on('error', err => {
//       if (ffmpegEnded) return;
//       console.error('❌ FFmpeg error:', err.message);
//       parentPort.postMessage({ success: false, error: err.message });
//     });

//     passThroughStream.on('close', () => {
//       if (!ffmpegEnded) {
//         ffmpegEnded = true;
//         console.log('✅ PassThrough stream closed — assuming FFmpeg is done');
//         parentPort.postMessage({ success: true, mediaKey: finalMediaKey });
//       }
//     });

//     command.pipe(passThroughStream, { end: true });

//     await Promise.all([
//       upload.done().catch(err => {
//         if (!ffmpegEnded) throw err;
//       }),
//       streamFinished,
//     ]);

//     console.log('✅ Upload to S3 completed');

//     try {
//       fs.unlinkSync(concatListPath);
//     } catch (err) {
//       console.warn('⚠️ Failed to clean up concat list:', err.message);
//     }

//     parentPort.postMessage({ success: true, mediaKey: finalMediaKey });
//   } catch (err) {
//     console.error('❌ Worker error:', err.message);
//     parentPort.postMessage({ success: false, error: err.message });
//   }
// })();
