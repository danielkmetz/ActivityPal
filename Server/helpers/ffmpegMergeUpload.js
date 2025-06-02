const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { Upload } = require('@aws-sdk/lib-storage');
const { PassThrough } = require('stream');
const { generateDownloadPresignedUrl } = require('./generateDownloadPresignedUrl');
const { s3Client } = require('../s3Config')

ffmpeg.setFfmpegPath(ffmpegPath);

const BUCKET_NAME = 'activity-pal-pics';

async function mergeSegmentsWithOverlays({ segments = [], overlays = [], outputKey }) {
    console.log('🔍 Raw segmentKeys received:', segments);
    console.log('🔍 overlayImages received:', overlays);
    console.log('outputKey', outputKey);
    if (segments.length === 0) throw new Error('No segments provided');

    const segmentUrls = await Promise.all(segments.map(({ mediaKey }) => generateDownloadPresignedUrl(mediaKey)));
    const overlayUrls = await Promise.all(overlays.map(({ s3Key }) => generateDownloadPresignedUrl(s3Key)));

    return new Promise((resolve, reject) => {
        const passThrough = new PassThrough(); // ✅ create before ffmpeg starts
        const command = ffmpeg();

        command.on('start', cmd => {
            console.log('🎬 FFmpeg started with full command:\n', cmd);
        });

        segmentUrls.forEach(url => command.input(url));
        overlayUrls.forEach(url => command.input(url));

        overlayUrls.forEach((url, i) => {
            console.log(`🖼️ Overlay #${i}:`);
            console.log(`    ➤ S3 URL: ${url}`);
            console.log(`    ➤ Width: ${overlays[i].Width}`);
            console.log(`    ➤ X: ${overlays[i].ImageX}`);
        });


        const filterGraph = overlayUrls.map((_, i) => {
            const width = overlays[i].Width || 1080;
            const x = overlays[i].ImageX || 0;
            const y = overlays[i].ImageY || 0;
            const start = overlays[i].StartTimeSeconds || 0;
            const end = start + (overlays[i].Duration || 86400);

            console.log(`🎯 FFmpeg overlay #${i}`);
            console.log(`    ➤ Scale: ${width}:-1`);
            console.log(`    ➤ Position: x=${x}, y=${y}`);
            console.log(`    ➤ Time window: between(t,${start},${end})`);

            return (
                `[${i + 1}:v]setpts=PTS-STARTPTS[ol${i}];` +
                `[base${i}][ol${i}]overlay=x=${x}:y=${y}:enable='between(t,${start},${end})'[base${i + 1}]`
            );
        }).join(';');

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: outputKey,
                Body: passThrough,
                ContentType: 'video/mp4',
            },
            queueSize: 4,
            partSize: 5 * 1024 * 1024,
        });

        upload.on('httpUploadProgress', progress => {
            console.log('Upload progress:', progress);
        });

        upload.done()
            .then(res => {
                console.log('✅ Upload to S3 complete');
                resolve({ key: outputKey, response: res });
            })
            .catch(err => {
                console.error('❌ S3 Upload failed:', err);
                reject(err);
            });

        command
            .complexFilter([
                `[0:v]format=rgba[base0]`,
                ...filterGraph.split(';')
            ])
            .outputOptions([
                '-map', `[base${overlayUrls.length}]`,
                '-movflags', 'frag_keyframe+empty_moov',
                '-preset', 'ultrafast',
                '-f', 'mp4',
                '-loglevel', 'verbose',
            ])
            .noAudio()
            .on('start', cmd => console.log('🎬 FFmpeg started:', cmd))
            .on('error', err => {
                if (err.message.includes('Output stream closed')) {
                    console.warn('⚠️ FFmpeg closed the output stream early, assuming success');
                    // do nothing, let S3 upload handle the resolve
                } else {
                    console.error('❌ FFmpeg error:', err);
                    reject(err);
                }
            })
            .on('end', () => {
                console.log('✅ FFmpeg processing complete');
                // no need to call resolve here again, already handled after upload.done()
            })
            .output(passThrough)
            .run();
    });
}

module.exports = { mergeSegmentsWithOverlays };
