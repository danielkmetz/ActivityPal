const {
  MediaConvertClient,
} = require('@aws-sdk/client-mediaconvert');

const mediaConvertClient = new MediaConvertClient({
  region: 'us-east-2',
  endpoint: 'https://mediaconvert.us-east-1.amazonaws.com'
});

module.exports = mediaConvertClient
