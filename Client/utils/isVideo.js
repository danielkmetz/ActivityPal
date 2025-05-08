export const isVideo = (file) => {
    const source = file?.type || file?.url || file?.photoKey || '';
    return typeof source === 'string' && (
        source.includes('.mp4') ||
        source.includes('.mov') ||
        source.startsWith('video/')
    );
};

