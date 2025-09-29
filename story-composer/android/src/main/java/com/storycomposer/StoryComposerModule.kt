package com.storycomposer

import android.graphics.Color
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.OverlaySettings
import androidx.media3.effect.TextOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

class StoryComposerModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  override fun getName() = "StoryComposer"

  private val progressPolling = Executors.newSingleThreadExecutor()

  @ReactMethod
  fun compose(options: ReadableMap, promise: Promise) {
    val debug = options.hasKey("debug") && options.getBoolean("debug")
    fun log(msg: String) { sendLog(if (debug) msg else msg) ; if (debug) Log.d("StoryComposer", msg) }

    try {
      val segments = options.getArray("segments") ?: run {
        promise.reject("E_BAD_ARGS", "segments[] is required"); return
      }
      val captions = options.getArray("captions") ?: Arguments.createArray()
      val outFileName = options.getString("outFileName") ?: "story_${System.currentTimeMillis()}.mp4"
      val outFile = File(reactCtx.cacheDir, outFileName).apply { if (exists()) delete() }

      log("compose(): segments=${segments.size()} captions=${captions.size()} out=$outFile")

      // Build EditedMediaItems (concat)
      val editedList = mutableListOf<EditedMediaItem>()
      for (i in 0 until segments.size()) {
        val seg = segments.getMap(i) ?: continue
        val uriStr = seg.getString("uri") ?: continue
        val startMs = seg.getDoubleOr("startMs", 0.0)
        val endMs = seg.getDoubleOr("endMs", -1.0)
        log("segment[$i]: uri=$uriStr startMs=$startMs endMs=$endMs")

        val miBuilder = MediaItem.Builder().setUri(Uri.parse(uriStr))
        if (startMs > 0.0 || endMs > 0.0) {
          val clipBuilder = MediaItem.ClippingConfiguration.Builder()
          if (startMs > 0.0) clipBuilder.setStartPositionMs(startMs.toLong())
          if (endMs > 0.0) clipBuilder.setEndPositionMs(endMs.toLong())
          miBuilder.setClippingConfiguration(clipBuilder.build())
        }
        editedList.add(EditedMediaItem.Builder(miBuilder.build()).build())
      }
      if (editedList.isEmpty()) { promise.reject("E_BAD_ARGS", "No valid segments"); return }

      val videoSequence = EditedMediaItemSequence(editedList)
      val compositionBuilder = Composition.Builder(listOf(videoSequence))

      // Captions
      val overlays = mutableListOf<TextOverlay>()
      for (i in 0 until captions.size()) {
        val cap = captions.getMap(i) ?: continue
        val text = cap.getString("text")?.trim() ?: ""
        if (text.isEmpty()) continue
        val x = cap.getDoubleOr("x", 0.5)
        val y = cap.getDoubleOr("y", 0.5)
        val startMs = cap.getDoubleOr("startMs", 0.0)
        val endMs = cap.getDoubleOr("endMs", 9_999_000.0)
        val fontSize = cap.getDoubleOr("fontSize", 24.0)
        val colorStr = cap.getString("color") ?: "#FFFFFF"
        val ndcX = (x * 2.0 - 1.0).toFloat()
        val ndcY = (1.0 - y * 2.0).toFloat()
        val settings = OverlaySettings.Builder()
          .setOverlayFrameAnchor(0f, 0f)
          .setBackgroundFrameAnchor(ndcX, ndcY)
          .build()
        val span = SpannableString(text).apply {
          setSpan(RelativeSizeSpan((fontSize / 100.0).toFloat()), 0, length, 0)
          setSpan(ForegroundColorSpan(parseColorCompat(colorStr)), 0, length, 0)
        }
        overlays.add(TimedTextOverlay(span, settings, (startMs * 1000).toLong(), (endMs * 1000).toLong()))
        log("caption[$i]: '$text' xy=($x,$y) ndc=($ndcX,$ndcY) window=$startMs..$endMs font=$fontSize")
      }

      val effects: Effects = if (overlays.isNotEmpty()) Effects(listOf(OverlayEffect(overlays)), emptyList()) else Effects.EMPTY
      val composition = compositionBuilder.setEffects(effects).build()

      val listenerResolved = AtomicBoolean(false)

      val transformer = Transformer.Builder(reactCtx)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: Transformer.ExportResult) {
            if (!listenerResolved.getAndSet(true)) {
              val sizeBytes = outFile.length()
              val meta = readMeta(outFile)
              log("onCompleted: file=${outFile.path} size=${sizeBytes}B meta=$meta")
              val result = Arguments.createMap().apply {
                putString("uri", Uri.fromFile(outFile).toString())
                putInt("width", meta.width)
                putInt("height", meta.height)
                putInt("durationMs", meta.durationMs)
              }
              promise.resolve(result)
            }
          }
          override fun onError(
            composition: Composition,
            exportResult: Transformer.ExportResult,
            exportException: Transformer.ExportException
          ) {
            if (!listenerResolved.getAndSet(true)) {
              log("onError: $exportException")
              promise.reject("E_EXPORT", exportException.localizedMessage, exportException)
            }
          }
        })
        .build()

      transformer.start(composition, outFile.path)
      log("transformer.start -> ${outFile.path}")

      // progress poll
      val holder = ProgressHolder()
      progressPolling.execute {
        try {
          while (!listenerResolved.get()) {
            val state = transformer.getProgress(holder)
            if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
              val p = min(1.0, max(0.0, holder.progress / 100f.toDouble()))
              sendProgress(p)
            }
            Thread.sleep(100)
          }
        } catch (_: Throwable) {}
      }

    } catch (e: Exception) {
      sendLog("compose() exception: ${e.message}")
      promise.reject("E_COMPOSE_FAILED", e)
    }
  }

  private fun readMeta(outFile: File): Meta {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(outFile.path)
      val w = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) ?: "-1").toInt()
      val h = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT) ?: "-1").toInt()
      val d = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION) ?: "0").toInt()
      Meta(w, h, d)
    } catch (_: Throwable) { Meta(-1, -1, 0) } finally { r.release() }
  }
  private data class Meta(val width: Int, val height: Int, val durationMs: Int)

  private fun sendProgress(p: Double) {
    val params = Arguments.createMap().apply { putDouble("progress", p) }
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("StoryComposerProgress", params)
  }
  private fun sendLog(msg: String) {
    val params = Arguments.createMap().apply { putString("message", msg) }
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("StoryComposerLog", params)
  }

  private fun ReadableMap.getDoubleOr(key: String, fallback: Double) =
    if (this.hasKey(key) && !this.isNull(key)) this.getDouble(key) else fallback

  private fun parseColorCompat(s: String): Int {
    val str = s.trim()
    return if (str.startsWith("rgba", true)) {
      val parts = str.substringAfter("(").substringBefore(")").split(",").map { it.trim() }
      val r = parts.getOrNull(0)?.toIntOrNull() ?: 255
      val g = parts.getOrNull(1)?.toIntOrNull() ?: 255
      val b = parts.getOrNull(2)?.toIntOrNull() ?: 255
      val aFloat = parts.getOrNull(3)?.toFloatOrNull() ?: 1f
      Color.argb((aFloat * 255).toInt().coerceIn(0, 255), r, g, b)
    } else Color.parseColor(str)
  }

  private class TimedTextOverlay(
    private val text: SpannableString,
    private val settings: OverlaySettings,
    private val startUs: Long,
    private val endUs: Long
  ) : TextOverlay() {
    override fun getText(presentationTimeUs: Long) =
      if (presentationTimeUs in startUs until endUs) text else SpannableString("")
    override fun getOverlaySettings(presentationTimeUs: Long) = settings
  }
}
