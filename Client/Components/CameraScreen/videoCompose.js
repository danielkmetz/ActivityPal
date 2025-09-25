// utils/video/composeOnePass.js
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

const q = (p) => `'${String(p).replace(/'/g, "'\\''")}'`;
const toLocal = (uri) => uri?.replace(/^file:\/\//, '');

// ---------- drawtext helpers ----------
function escDrawtext(s='') {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

function captionToDrawtext(c, defaultFont, screenH) {
  const esc = escDrawtext(c.text || '');
  const yRatio = typeof c.y === 'number' && screenH
    ? Math.max(0, Math.min(1, c.y / screenH))
    : null;

  const yExpr = c.yExpr ||
    (yRatio != null
      ? `max(0,min(h-text_h-10,h*${yRatio.toFixed(5)}-text_h/2))`
      : (c.y || 'h-200'));

  const xExpr = c.x || '(w-text_w)/2';

  const fontsize   = c.fontSize ?? 48;
  const fontcolor  = c.color ?? 'white';
  const boxcolor   = c.boxcolor ?? 'black@0.5';
  const boxborderw = c.boxborderw ?? 16;

  const timeEnable = (c.start != null || c.end != null)
    ? `:enable='between(t\\,${c.start ?? 0}\\,${c.end ?? 9999})'`
    : '';

  return [
    `drawtext=fontfile=${q(defaultFont)}`,
    `text=${q(esc)}`,
    `fontsize=${fontsize}`,
    `fontcolor=${fontcolor}`,
    `box=1`,
    `boxcolor=${boxcolor}`,
    `boxborderw=${boxborderw}`,
    `x=${xExpr}`,
    `y=${yExpr}${timeEnable}`
  ].join(':');
}

// ---------- FAST PATH (no captions): concat demuxer with stream copy ----------
/**
 * Fastest path: concat demuxer + -c copy (no re-encode).
 * Works only when all segments share identical codecs/params and all have (or all lack) audio.
 * Returns a "file://..." path.
 */
export async function fastConcatNoCaptions(segments, opts = {}) {
  if (!segments?.length) throw new Error('No segments');
  const outPath = `${FileSystem.cacheDirectory || ''}compose_${Date.now()}.mp4`;
  const listPath = `${FileSystem.cacheDirectory || ''}concat_${Date.now()}.txt`;

  // concat demuxer expects lines like: file '/abs/path.mp4'
  const listBody = segments.map(s => `file ${q(toLocal(s.uri))}`).join('\n');
  await FileSystem.writeAsStringAsync(listPath, listBody);

  const cmd = [
    '-y',
    '-f concat', '-safe 0',
    `-i ${q(toLocal(listPath))}`,
    '-c copy',
    '-movflags +faststart',
    q(toLocal(outPath)),
  ].join(' ');

  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();
  if (!ReturnCode.isSuccess(rc)) {
    const logs = await session.getAllLogsAsString();
    throw new Error(`fastConcat failed: ${rc} ${logs || ''}`);
  }
  return outPath; // includes "file://"
}

// ---------- RE-ENCODE PATH (captions and/or non-uniform segments) ----------
/**
 * Compose N segments -> 1 file and (optionally) burn multiple captions.
 * Returns a "file://..." path.
 */
export async function composeOnePassNoList(segments, opts = {}) {
  if (!segments?.length) throw new Error('No segments');

  const {
    // single fallback text if captions[] not provided
    text,
    x = '(w-text_w)/2',
    y = 'h-200',
    start = 0,
    end = 9999,
    fontsize = 48,
    fontcolor = 'white',
    boxcolor = 'black@0.5',
    boxborderw = 16,
    captions,
    screenHeight,
    crf = 22,                 // slightly higher for speed/size balance
    preset = 'superfast',     // faster for stories
    reencodeAudio = true,
    fontfile,
    // optional sizing: e.g. 1280x? to keep stories snappy
    targetMaxWidth,           // e.g., 1280 (720p) or 1080
    outPath = `${FileSystem.cacheDirectory || ''}compose_${Date.now()}.mp4`,
  } = opts;

  const inputArgs = segments.map(s => `-i ${q(toLocal(s.uri))}`).join(' ');
  const n = segments.length;

  // concat filter expects [i:v][i:a] for each input (audio must exist on all)
  const pairs = Array.from({ length: n }, (_, i) => `[${i}:v:0][${i}:a:0]`).join('');
  const concat = `${pairs}concat=n=${n}:v=1:a=1[v][a]`;

  const defaultFont =
    fontfile ||
    (Platform.OS === 'ios'
      ? '/System/Library/Fonts/Supplemental/Arial.ttf'
      : '/system/fonts/Roboto-Regular.ttf');

  const vFilters = [];

  // Normalize to even dimensions + optional downscale for speed
  if (targetMaxWidth) {
    vFilters.push(`scale='min(${targetMaxWidth},iw)':-2`);
  } else {
    vFilters.push(`scale=trunc(iw/2)*2:trunc(ih/2)*2`);
  }

  if (Array.isArray(captions) && captions.length) {
    captions.forEach(c => vFilters.push(captionToDrawtext(c, defaultFont, screenHeight)));
  } else if (text) {
    const escText = escDrawtext(text);
    vFilters.push(
      `drawtext=fontfile=${q(defaultFont)}:text=${q(escText)}:fontsize=${fontsize}:fontcolor=${fontcolor}:` +
      `box=1:boxcolor=${boxcolor}:boxborderw=${boxborderw}:x=${x}:y=${y}:enable='between(t\\,${start}\\,${end})'`
    );
  }

  const postVFilters = vFilters.join(',');
  const filterComplex = `${concat};[v]${postVFilters}[v2]`;
  const audioArgs = reencodeAudio ? '-c:a aac -b:a 128k' : '-c:a copy';

  const cmd = [
    '-y',
    inputArgs,
    `-filter_complex ${q(filterComplex)}`,
    `-map "[v2]" -map "[a]"`,
    '-c:v libx264',
    `-preset ${preset}`,
    `-crf ${crf}`,
    '-pix_fmt yuv420p',
    audioArgs,
    '-movflags +faststart',
    '-threads 0',
    q(toLocal(outPath)),
  ].join(' ');

  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();
  if (!ReturnCode.isSuccess(rc)) {
    const logs = await session.getAllLogsAsString();
    throw new Error(`FFmpeg compose failed: ${rc} ${logs || ''}`);
  }
  return outPath;
}

// ---------- SMART WRAPPER (choose fastest viable path) ----------
/**
 * Decide the best route:
 * - 1 segment & no captions -> return the original path
 * - >1 segment & no captions -> try fastConcatNoCaptions, fallback to composeOnePassNoList
 * - captions present -> composeOnePassNoList
 *
 * Returns a "file://..." path.
 */
export async function composeSmart(segments, opts = {}) {
  if (!segments?.length) throw new Error('No segments');

  const hasCaptions = Array.isArray(opts.captions) && opts.captions.length > 0;

  // Single segment & no captions: just use original file
  if (!hasCaptions && segments.length === 1) {
    const uri = segments[0]?.uri;
    if (!uri) throw new Error('Missing segment uri');
    // Ensure it’s a file:// path for FileSystem.uploadAsync
    return uri.startsWith('file://') ? uri : `file://${toLocal(uri)}`;
  }

  // Multiple segments & no captions -> FAST PATH
  if (!hasCaptions && segments.length > 1) {
    try {
      return await fastConcatNoCaptions(segments, opts);
    } catch (e) {
      console.warn('[composeSmart] fast concat failed, falling back to re-encode:', e?.message || e);
      // Reasonable fallback with speed-focused settings
      return await composeOnePassNoList(segments, {
        ...opts,
        preset: opts.preset ?? 'superfast',
        crf: opts.crf ?? 22,
        targetMaxWidth: opts.targetMaxWidth ?? 1280,
      });
    }
  }

  // Captions present -> must re-encode
  return await composeOnePassNoList(segments, {
    ...opts,
    preset: opts.preset ?? 'superfast',
    crf: opts.crf ?? 22,
    targetMaxWidth: opts.targetMaxWidth ?? 1280,
  });
}
