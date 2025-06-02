const { Video } = require('@mux/mux-node');
const dotenv = require('dotenv');
dotenv.config();

const mux = new Video({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

/**
 * Submit a video job to Mux using the provided video segment URL and PNG overlay.
 * @param {string[]} segmentUrls - Public URLs to the video segments (only the first one is used)
 * @param {string} overlayUrl - Public URL to the PNG caption overlay
 * @returns {Promise<object>} The created Mux asset
 */
async function submitMuxJob(segmentUrls, overlayUrl) {
  try {
    console.log('\n=== ✨ MUX JOB SUBMISSION START ===');
    console.log(`📹 Segment URL: ${segmentUrls[0]}`);
    console.log(`🖼️ Overlay URL: ${overlayUrl}`);

    const asset = await mux.assets.create({
      input: [
        {
          url: segmentUrls[0],
          overlays: [
            {
              url: overlayUrl,
              type: 'image',
              opacity: 1.0,
              vertical_align: 'bottom',
              horizontal_align: 'center',
              width: '60%',
              offset_y: '10%',
            },
          ],
        },
      ],
      playback_policy: ['public'],
      mp4_support: 'standard',
    });

    console.log('\n✅ Mux asset created successfully!');
    console.log(`🔑 Asset ID: ${asset.id}`);
    console.log(`🔗 Playback URL: https://stream.mux.com/${asset.playback_ids[0].id}.m3u8`);
    console.log('=== ✅ END JOB SUBMISSION ===\n');

    return asset;
  } catch (error) {
    console.error('\n❌ MUX JOB SUBMISSION FAILED');
    console.error('🧵 Error message:', error.message);
    console.error('📜 Full error:', error);
    throw new Error('Mux job submission failed');
  }
}

module.exports = submitMuxJob;
