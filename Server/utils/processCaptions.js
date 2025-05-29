const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const waitForObjectReady = require('../utils/waitForObjectReady');
const axios = require('axios');

async function renderCaptionToPng(caption, localPath) {
    const { text,  fontSize = 24, backgroundColor = 'rgba(0,0,0,0.5)', color = '#fff' } = caption;
    const height = fontSize + 16;
    const width = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    console.log(`🖼️ Rendering caption to PNG`);
    console.log(`   Text: "${text}"`);
    console.log(`   Width: ${width}, Height: ${height}`);
    console.log(`   Font: ${fontSize}px sans-serif, Background: ${backgroundColor}, Color: ${color}`);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    fs.writeFileSync(localPath, canvas.toBuffer('image/png'));
    console.log(`✅ PNG written to ${localPath}`);
    return height;
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

            const height = await renderCaptionToPng(caption, localPath);
            const s3Uri = await uploadOverlayToS3(localPath, s3Key);

            console.log(`🎯 InsertableImage ready:`, {
                ImageInserterInput: s3Uri,
                Layer: 1,
                Opacity: 100,
                ImageX: 0,
                ImageY: caption.y ?? 100,
                StartTime: '00:00:00:00',
                Duration: 3600,
            });

            return {
                ImageInserterInput: s3Uri,
                Layer: 1,
                Opacity: 100,
                ImageX: 0,
                ImageY: 300,
                StartTime: '00:00:00:00',
                Duration: 3600,
            };
        })
    );

    console.log(`✅ All captions processed. Total: ${insertableImages.length}`);
    return insertableImages;
}

module.exports = { processCaptionsToInsertableImages };
