const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const axios = require('axios');

const VIDEO_WIDTH = 1080;

async function renderCaptionToPng(caption, localPath) {
    const { text, fontSize = 24, backgroundColor = '#000000', color = '#ffffff' } = caption;

    const padding = 40;
    const height = fontSize + 16;

    const tempCanvas = createCanvas(VIDEO_WIDTH, height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `${fontSize}px sans-serif`;
    const textMetrics = tempCtx.measureText(text);
    const textActualWidth = textMetrics.actualBoundingBoxLeft + textMetrics.actualBoundingBoxRight;

    const finalWidth = Math.ceil(textActualWidth + padding);
    const canvas = createCanvas(finalWidth, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, finalWidth, height);

    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, finalWidth / 2, height / 2);

    fs.writeFileSync(localPath, canvas.toBuffer('image/png'));
    fs.copyFileSync(localPath, path.join(__dirname, '..', 'debug', path.basename(localPath)));
    console.log(`✅ PNG written to ${localPath}`);

    return { scaledOverlayWidth: finalWidth };
}

async function uploadOverlayToS3(localPath, s3Key) {
    try {
        console.log(`⬆️ Uploading ${localPath} to S3 at key ${s3Key}`);
        const uploadUrl = await generatePresignedUrl(s3Key);
        const file = fs.readFileSync(localPath);

        await axios.put(uploadUrl, file, {
            headers: { 'Content-Type': 'image/png' },
        });

        console.log(`✅ Upload successful for ${s3Key}`);
        fs.unlinkSync(localPath);

        return `s3://${process.env.AWS_BUCKET_NAME_LOGOS}/${s3Key}`; // ✅ Direct bucket URI
    } catch (err) {
        console.error(`❌ Upload failed for ${s3Key}:`, err.message);
        throw err;
    }
}

async function processCaptionsToInsertableImages(captions, storyId) {
    console.log(`🔧 Processing captions for story ID: ${storyId}`);
    console.log(`📝 Total captions: ${captions.length}`);

    const insertableImages = await Promise.all(
        captions.map(async (caption, i) => {
            const fileName = `caption_${storyId}_${i}.png`;
            const localPath = path.join(__dirname, '..', 'tmp', fileName);
            const s3Key = `captions/${fileName}`;

            console.log(`🖼️ Generating image for caption ${i}`);
            console.log(`   Caption object:`, caption);

            const {scaledOverlayWidth} = await renderCaptionToPng(caption, localPath);
            await uploadOverlayToS3(localPath, s3Key);
            const scaleFactor = VIDEO_WIDTH / caption.width;
            
            console.log(`🎯 InsertableImage ready:`, {
                s3Key,
                Layer: 10,
                Opacity: 70,
                ImageX: Math.floor((VIDEO_WIDTH - scaledOverlayWidth) / 2),
                ImageY: caption.y,
                StartTime: '00:00:00:00',
                FadeIn: 0,
                FadeOut: 0,
                Duration: 86400,
            });

            return {
                s3Key,
                Layer: 10,
                Opacity: 70,
                ImageX:  Math.floor((VIDEO_WIDTH - scaledOverlayWidth) / 2),
                ImageY: caption.y,
                StartTime: '00:00:00:00',
                FadeIn: 0,
                FadeOut: 0,
                Duration: 86400,
            };
        })
    );

    console.log(`✅ All captions processed. Total: ${insertableImages.length}`);
    return insertableImages;
}

module.exports = { processCaptionsToInsertableImages };
