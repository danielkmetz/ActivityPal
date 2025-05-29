const {
    MediaConvertClient,
    CreateJobCommand
} = require('@aws-sdk/client-mediaconvert');
const waitForObjectReady = require('../utils/waitForObjectReady');

const REGION = 'us-east-2';
const MEDIA_CONVERT_ENDPOINT = 'https://mediaconvert.us-east-2.amazonaws.com';
const ROLE_ARN = 'arn:aws:iam::809863251179:role/Vybe_Media_Convert';
const BUCKET_NAME = 'activity-pal-pics'; // S3 bucket where your segments and final video live

const client = new MediaConvertClient({
    region: REGION,
    endpoint: MEDIA_CONVERT_ENDPOINT,
});

async function submitMediaConvertJob(segmentKeys, outputKey, insertableImages = []) {
    try {
        console.log('🖼️ Final insertableImages:', JSON.stringify(insertableImages, null, 2));
        const jobSettings = {
            Role: ROLE_ARN,
            Settings: {
                Inputs: segmentKeys.map(key => {
                    const input = {
                        FileInput: `s3://${BUCKET_NAME}/${key}`,
                        AudioSelectors: {
                            'Audio Selector 1': {
                                DefaultSelection: 'DEFAULT',
                            },
                        },
                        VideoSelector: {
                            Rotate: 'AUTO',
                        },
                    };

                    if (insertableImages.length > 0) {
                        input.ImageInserter = {
                            InsertableImages: insertableImages,
                        };
                    }

                    return input;
                }),
                OutputGroups: [
                    {
                        Name: 'File Group',
                        OutputGroupSettings: {
                            Type: 'FILE_GROUP_SETTINGS',
                            FileGroupSettings: {
                                Destination: `s3://${BUCKET_NAME}/${outputKey}`
                            }
                        },
                        Outputs: [
                            {
                                ContainerSettings: {
                                    Container: 'MP4'
                                },
                                VideoDescription: {
                                    RespondToAfd: 'NONE',
                                    ScalingBehavior: 'DEFAULT',
                                    Sharpness: 100,
                                    //Height: 1280, // force portrait resolution
                                    //Width: 720,
                                    CodecSettings: {
                                        Codec: 'H_264',
                                        H264Settings: {
                                            RateControlMode: 'CBR',
                                            Bitrate: 3000000, // ✅ Required
                                            QualityTuningLevel: 'SINGLE_PASS',
                                            GopSize: 90,
                                            GopSizeUnits: 'FRAMES',
                                            GopClosedCadence: 1,
                                            NumberBFramesBetweenReferenceFrames: 1,
                                            GopBReference: 'DISABLED',
                                            ParControl: 'INITIALIZE_FROM_SOURCE'
                                        }
                                    }
                                },
                                AudioDescriptions: [
                                    {
                                        AudioTypeControl: 'FOLLOW_INPUT',
                                        CodecSettings: {
                                            Codec: 'AAC',
                                            AacSettings: {
                                                Bitrate: 96000,
                                                CodingMode: 'CODING_MODE_2_0',
                                                SampleRate: 48000
                                            }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },

            // ✅ Explicit default queue ARN
            Queue: `arn:aws:mediaconvert:us-east-2:809863251179:queues/CBRQueue`, // or replace with your own queue ARN
            Priority: 0,
            UserMetadata: {
                job: 'ActivityPal Story Merge'
            }
        };
        const command = new CreateJobCommand(jobSettings);
        const response = await client.send(command);

        return response.Job;
    } catch (error) {
        console.error('❌ Failed to submit MediaConvert job:', error.message);
        console.error(error);
        throw new Error('MediaConvert job submission failed');
    }
}

module.exports = submitMediaConvertJob;
