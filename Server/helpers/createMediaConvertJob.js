const {
    MediaConvertClient,
    CreateJobCommand
} = require('@aws-sdk/client-mediaconvert');

const REGION = 'us-east-2';
const MEDIA_CONVERT_ENDPOINT = 'https://mediaconvert.us-east-2.amazonaws.com';
const ROLE_ARN = 'arn:aws:iam::809863251179:role/Vybe_Media_Convert';
const BUCKET_NAME = 'activity-pal-pics'; // S3 bucket where segments and output go

const client = new MediaConvertClient({
    region: REGION,
    endpoint: MEDIA_CONVERT_ENDPOINT,
});

async function submitMediaConvertJob(segmentKeys, outputKey, insertableImages = []) {
    try {
        console.log('\n=== 🧠 MEDIA CONVERT JOB SUBMISSION START ===');
        console.log(`🪵 Segment keys:`, JSON.stringify(segmentKeys, null, 2));
        console.log(`📦 Output key: s3://${BUCKET_NAME}/${outputKey}`);
        console.log(`🖼️ Insertable Images:`);
        insertableImages.forEach((img, i) => {
            console.log(`  ➤ Image ${i + 1}:`);
            console.log(JSON.stringify(img, null, 2));
        });

        const inputs = segmentKeys.map((key, index) => {
            const baseInput = {
                FileInput: `s3://${BUCKET_NAME}/${key}`,
                AudioSelectors: {
                    'Audio Selector 1': { DefaultSelection: 'DEFAULT' },
                },
                //VideoSelector: { Rotate: 'AUTO' },
                TimecodeSource: 'ZEROBASED',
            };

            if (insertableImages.length > 0 && index === 0) {
                baseInput.ImageInserter = {
                    InsertableImages: insertableImages.map((img, idx) => {
                        const imgConfig = {
                            ...img,
                            StartTime: img.StartTime || '00:00:00:00',
                            Duration: img.Duration || 3600,
                        };
                        console.log(`🔍 Attached overlay [${idx}]:`, JSON.stringify(imgConfig, null, 2));
                        return imgConfig;
                    })
                };
            }

            return baseInput;
        });

        const jobSettings = {
            Role: ROLE_ARN,
            Settings: {
                Inputs: inputs,
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
                                    CodecSettings: {
                                        Codec: 'H_264',
                                        H264Settings: {
                                            RateControlMode: 'CBR',
                                            Bitrate: 3000000,
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
            Queue: `arn:aws:mediaconvert:us-east-2:809863251179:queues/CBRQueue`,
            Priority: 0,
            UserMetadata: {
                job: 'ActivityPal Story Merge'
            }
        };

        console.log('\n🧾 Final MediaConvert Job Settings:\n');
        console.dir(jobSettings, { depth: null });

        const command = new CreateJobCommand(jobSettings);
        const response = await client.send(command);

        console.log('\n✅ MediaConvert job submitted successfully!');
        console.log(`   🆔 Job ID: ${response?.Job?.Id}`);
        console.log(`   🪣 Output S3 URI: s3://${BUCKET_NAME}/${outputKey}`);
        console.log('=== ✅ END JOB SUBMISSION ===\n');

        return response.Job;
    } catch (error) {
        console.error('\n❌ MEDIA CONVERT JOB SUBMISSION FAILED');
        console.error('🧵 Error message:', error.message);
        console.error('📜 Full error:', error);
        throw new Error('MediaConvert job submission failed');
    }
}

module.exports = submitMediaConvertJob;
