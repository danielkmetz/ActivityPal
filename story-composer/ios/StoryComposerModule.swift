import Foundation
import AVFoundation
import UIKit
import CoreText
import React

@objc(StoryComposer)
class StoryComposer: RCTEventEmitter {

  override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { return ["StoryComposerProgress", "StoryComposerLog"] }

  private func log(_ m: String) {
    NSLog("[StoryComposer] %@", m)
    sendEvent(withName: "StoryComposerLog", body: ["message": m])
  }

  // MARK: - Stringify helpers (Swift-safe, no NSStringFrom*)
  private func str(_ size: CGSize) -> String { String(format: "(%.1f, %.1f)", size.width, size.height) }
  private func str(_ pt: CGAffineTransform) -> String {
    String(format: "CGAffineTransform(a: %.4f, b: %.4f, c: %.4f, d: %.4f, tx: %.1f, ty: %.1f)",
           pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty)
  }
  private func str(_ rect: CGRect) -> String {
    String(format: "(x: %.1f, y: %.1f, w: %.1f, h: %.1f)",
           rect.origin.x, rect.origin.y, rect.size.width, rect.size.height)
  }
  private func str(_ tr: CMTimeRange) -> String {
    let s = CMTimeGetSeconds(tr.start)
    let d = CMTimeGetSeconds(tr.duration)
    return String(format: "{start: %.3fs, dur: %.3fs}", s, d)
  }

  // MARK: - Geometry helpers

  /// Returns (renderSize, appliedTransform, naturalRect) by translating the track's preferredTransform
  /// so the transformed natural rect starts at (0,0). Works for any rotation/flip.
  private func normalizedRender(for track: AVAssetTrack) -> (CGSize, CGAffineTransform, CGRect) {
    let ns = track.naturalSize
    let t  = track.preferredTransform
    let naturalRect = CGRect(origin: .zero, size: ns).applying(t)
    let render = CGSize(width: abs(naturalRect.width), height: abs(naturalRect.height))
    let translate = CGAffineTransform(translationX: -naturalRect.minX, y: -naturalRect.minY)
    let applied = t.concatenating(translate)
    let rs = CGSize(width: floor(render.width), height: floor(render.height)) // avoid fractional pixels
    return (rs, applied, naturalRect)
  }

  // MARK: - Small helpers

  private func number(from any: Any?) -> Double? {
    if let n = any as? NSNumber { return n.doubleValue }
    if let s = any as? String, let d = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) { return d }
    return nil
  }

  private func weight(from name: String) -> UIFont.Weight {
    switch name.lowercased() {
    case "ultralight": return .ultraLight
    case "thin": return .thin
    case "light": return .light
    case "regular", "normal": return .regular
    case "medium": return .medium
    case "semibold", "semi-bold": return .semibold
    case "bold": return .bold
    case "heavy": return .heavy
    case "black": return .black
    default: return .semibold
    }
  }

  // MARK: - API

  @objc(compose:resolver:rejecter:)
  func compose(options: NSDictionary,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {

    let debug = (options["debug"] as? Bool) ?? false
    func dlog(_ s: String) { if debug { log(s) } }

    guard let segments = options["segments"] as? [NSDictionary], segments.count > 0 else {
      reject("E_BAD_ARGS", "segments[] is required", nil); return
    }
    let captions = (options["captions"] as? [NSDictionary]) ?? []
    let outFileName = (options["outFileName"] as? String) ?? "story_\(Int(Date().timeIntervalSince1970)).mp4"

    // Global style defaults (each caption can override)
    let globalFontSize = CGFloat(number(from: options["fontSize"]) ?? 32) // points (preview units)
    let globalPaddingX = CGFloat(number(from: options["padding"])  ?? 20) // horizontal padding (X)
    let globalVPadD = number(from: options["vPadding"]) ?? number(from: options["paddingY"]) ?? Double(globalPaddingX)
    let globalPaddingY = CGFloat(globalVPadD) // vertical padding (Y)
    let globalMinBar   = CGFloat(number(from: options["minBannerHeight"]) ?? 56)
    let globalSide     = CGFloat(number(from: options["sideMargin"]) ?? 0)
    let globalFg       = (options["color"] as? String) ?? "#FFFFFF"
    let globalBg       = (options["bgColor"] as? String) ?? "rgba(0,0,0,0.55)"
    let globalFontFamily = options["fontFamily"] as? String
    let globalFontWeight = (options["fontWeight"] as? String) ?? "semibold"

    // Optional preview width (points). Used to scale geometry to pixel render space.
    let jsScreenWidth = CGFloat(number(from: options["screenWidth"]) ?? 0)

    // Write to Caches (stable for session)
    let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    let outURL = cachesDir.appendingPathComponent(outFileName)
    try? FileManager.default.removeItem(at: outURL)

    dlog("compose(): segments=\(segments.count) captions=\(captions.count) out=\(outURL.path) fontSize(default)=\(Int(globalFontSize)) paddingX=\(Int(globalPaddingX)) paddingY=\(Int(globalPaddingY))")

    // Build composition
    let mix = AVMutableComposition()
    guard let compVideo = mix.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { reject("E_COMPOSE", "Could not create video track", nil); return }
    let compAudio = mix.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)

    var cursor = CMTime.zero
    var renderSize = CGSize(width: 1080, height: 1920)
    var appliedTransform: CGAffineTransform = .identity
    var insertedVideo = false

    // Load & insert
    for (idx, seg) in segments.enumerated() {
      guard let uri = seg["uri"] as? String,
            let url = URL(string: uri) ?? URL(string: uri.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""),
            url.isFileURL else {
        dlog("segment[\(idx)] bad uri"); continue
      }

      let asset = AVURLAsset(url: url)
      let keys = ["tracks", "duration", "playable"]
      let group = DispatchGroup()
      group.enter()
      asset.loadValuesAsynchronously(forKeys: keys) { group.leave() }
      group.wait()

      var loadOk = true
      for k in keys {
        var err: NSError?
        let status = asset.statusOfValue(forKey: k, error: &err)
        if status != .loaded {
          dlog("segment[\(idx)] key \(k) not loaded: \(status) \(err?.localizedDescription ?? "")")
          loadOk = false
        }
      }
      if !loadOk { continue }

      let timeRange = CMTimeRange(start: .zero, duration: asset.duration)

      if let vTrack = asset.tracks(withMediaType: .video).first {
        // Diagnostics
        let ns = vTrack.naturalSize
        let pt = vTrack.preferredTransform
        let rect = CGRect(origin: .zero, size: ns).applying(pt)
        let fps = vTrack.nominalFrameRate
        let dataRate = vTrack.estimatedDataRate // bits/sec
        dlog(String(format: "seg[%d] video ns=%@ pt=%@ rect=%@ fps=%.2f dataRate=%.0f",
                    idx, str(ns), str(pt), str(rect), fps, dataRate))

        if idx == 0 {
          let (rs, at, nRect) = normalizedRender(for: vTrack)
          renderSize = rs
          appliedTransform = at
          dlog("first video: naturalSize=\(str(ns)) srcTransform=\(str(pt)) naturalRect=\(str(nRect)) -> renderSize=\(str(renderSize)) applied=\(str(appliedTransform))")
        } else {
          let (_, _, nRect2) = normalizedRender(for: vTrack)
          dlog("seg[\(idx)] naturalRect(after pt)=\(str(nRect2))")
        }

        do {
          try compVideo.insertTimeRange(timeRange, of: vTrack, at: cursor)
          insertedVideo = true
          dlog(String(format: "insert video seg[%d] dur=%.3fs at=%.3fs", idx, asset.duration.seconds, cursor.seconds))
        } catch {
          dlog("insert video seg[\(idx)] failed: \(error.localizedDescription)")
        }
      } else {
        dlog("segment[\(idx)] has no video track")
      }

      if let aTrack = asset.tracks(withMediaType: .audio).first {
        do {
          try compAudio?.insertTimeRange(timeRange, of: aTrack, at: cursor)
          dlog("insert audio seg[\(idx)]")
        } catch {
          dlog("insert audio seg[\(idx)] failed: \(error.localizedDescription)")
        }
      }

      cursor = CMTimeAdd(cursor, asset.duration)
    }

    if !insertedVideo {
      reject("E_NO_VIDEO_TRACKS", "No video tracks could be inserted", nil)
      return
    }

    // Composition diagnostics
    dlog("compVideo: segments=\(compVideo.segments.count) timeRange=\(str(CMTimeRange(start: .zero, duration: cursor)))")
    if compVideo.segments.count > 0 {
      for (i, s) in compVideo.segments.enumerated() {
        dlog("compVideo.seg[\(i)] timeMapping: src=\(str(s.timeMapping.source)) -> tgt=\(str(s.timeMapping.target))")
      }
    }

    // Video composition with layer instruction (apply transform)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: cursor)

    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideo)
    layerInstruction.setTransform(appliedTransform, at: .zero)
    instruction.layerInstructions = [layerInstruction]

    let vcomp = AVMutableVideoComposition()
    vcomp.renderSize = renderSize
    vcomp.frameDuration = CMTime(value: 1, timescale: 30)
    vcomp.instructions = [instruction]
    dlog("vcomp: renderSize=\(str(renderSize)) frameDuration=\(vcomp.frameDuration.value)/\(vcomp.frameDuration.timescale) instr=\(vcomp.instructions.count)")

    // --- Geometry scale (preview points -> export pixels) ---
    let baseScreenWidth = jsScreenWidth > 0 ? jsScreenWidth : UIScreen.main.bounds.width
    let geomScale = renderSize.width / max(1, baseScreenWidth)
    dlog(String(format: "geometryScale: screenWidth=%.1f renderWidth=%.1f -> scale=%.3f",
                baseScreenWidth, renderSize.width, geomScale))

    // Overlays (CoreAnimation tool only if captions present)
    if !captions.isEmpty {
      let parentLayer = CALayer()
      let videoLayer = CALayer()
      parentLayer.frame = CGRect(origin: .zero, size: renderSize)
      videoLayer.frame = parentLayer.frame
      parentLayer.addSublayer(videoLayer)

      // ✅ Make CA use top-left origin so Y matches RN/UIView coordinates
      parentLayer.isGeometryFlipped = true

      for (i, cap) in captions.enumerated() {
        guard let text = (cap["text"] as? String)?
          .trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { continue }

        // Inputs (keep y; ignore x for full-width banner)
        _ = number(from: cap["x"]) // x ignored for full-width
        let y = number(from: cap["y"]) ?? 0.5
        let startMs = number(from: cap["startMs"]) ?? 0
        let endMs = number(from: cap["endMs"]) ?? 9_999_000

        // Style with per-caption override, falling back to global defaults
        let providedFontSize = CGFloat(number(from: cap["fontSize"]) ?? 0)
        let rawFontSize = providedFontSize > 0 ? providedFontSize : globalFontSize
        let scaledFontSize = rawFontSize * geomScale

        // Independent X/Y padding (Y can be smaller to reduce banner thickness)
        let capPadXRaw = CGFloat(number(from: cap["padding"]) ?? Double(globalPaddingX))
        let capPadYRawD = number(from: cap["vPadding"]) ?? number(from: cap["paddingY"]) ?? Double(globalPaddingY)
        let capPadYRaw = CGFloat(capPadYRawD)

        let padX = capPadXRaw * geomScale
        let padY = capPadYRaw * geomScale

        let rawMinBannerHeight = CGFloat(number(from: cap["minBannerHeight"]) ?? Double(globalMinBar))
        let minBannerHeight = rawMinBannerHeight * geomScale

        let fg = (cap["color"] as? String) ?? globalFg
        let textColor = colorFromString(fg)

        let bg = (cap["bgColor"] as? String) ?? globalBg

        // Optional font family / weight
        let capFontFamily = (cap["fontFamily"] as? String) ?? globalFontFamily
        let capFontWeight = (cap["fontWeight"] as? String) ?? globalFontWeight
        let uiWeight = weight(from: capFontWeight)
        let uiFont: UIFont = {
          if let fam = capFontFamily, let f = UIFont(name: fam, size: scaledFontSize) { return f }
          return UIFont.systemFont(ofSize: scaledFontSize, weight: uiWeight)
        }()

        // Snapchat-style: full-width banner; sideMargin optional
        let sideMargin = CGFloat(number(from: cap["sideMargin"]) ?? Double(globalSide)) * geomScale
        let availableWidth = max(1, renderSize.width - sideMargin * 2)

        // ---------- Robust text measurement with CATextLayer ----------
        // Build the text layer FIRST using the exact font/size we will render with.
        let textLayer = CATextLayer()
        textLayer.contentsScale = UIScreen.main.scale
        textLayer.isWrapped = true
        textLayer.truncationMode = .none
        textLayer.alignmentMode = .center
        textLayer.foregroundColor = textColor.cgColor

        let ctFont = CTFontCreateWithName(uiFont.fontName as CFString, uiFont.pointSize, nil)
        textLayer.font = ctFont
        textLayer.fontSize = uiFont.pointSize
        textLayer.string = text

        // Constrain wrapping width and ask the layer for its preferred height.
        let textWidth = max(1, availableWidth - padX * 2)
        textLayer.frame = CGRect(x: 0, y: 0, width: textWidth, height: 0)
        let prefSize = textLayer.preferredFrameSize()
        let textHeight = ceil(prefSize.height)

        // Banner height uses vertical padding; enforce minimum
        let bannerHeight = max(minBannerHeight, textHeight + padY * 2)
        let bannerFrame = CGRect(x: 0, y: 0, width: availableWidth, height: bannerHeight)

        let bgLayer = CALayer()
        bgLayer.backgroundColor = colorFromString(bg).cgColor
        bgLayer.cornerRadius = min(24 * geomScale, bannerHeight / 2) // pleasant pill on single line
        bgLayer.frame = bannerFrame

        // Container spans full width; x is sideMargin, y is normalized center
        let container = CALayer()
        let normY = max(0, min(1, CGFloat(y))) // clamp normalized y
        var cy = normY * renderSize.height - bannerHeight / 2
        cy = max(0, min(renderSize.height - bannerHeight, cy)) // keep fully on screen
        container.frame = CGRect(x: sideMargin, y: cy,
                                 width: bannerFrame.width, height: bannerFrame.height)

        // Vertically center the text inside the padded area
        let innerHeight = bannerHeight - padY * 2
        let yCenterOffset = (innerHeight - textHeight) / 2
        textLayer.frame = CGRect(x: padX, y: padY + yCenterOffset, width: textWidth, height: textHeight)

        // Visibility window
        let start = CMTime(seconds: startMs / 1000.0, preferredTimescale: 1000)
        let end   = CMTime(seconds: endMs / 1000.0, preferredTimescale: 1000)

        let show = CABasicAnimation(keyPath: "opacity")
        show.fromValue = 0.0; show.toValue = 1.0
        show.beginTime = AVCoreAnimationBeginTimeAtZero + start.seconds
        show.duration = 0.001; show.fillMode = .both; show.isRemovedOnCompletion = false

        let hide = CABasicAnimation(keyPath: "opacity")
        hide.fromValue = 1.0; hide.toValue = 0.0
        hide.beginTime = AVCoreAnimationBeginTimeAtZero + end.seconds
        hide.duration = 0.001; hide.fillMode = .both; hide.isRemovedOnCompletion = false

        container.opacity = 0.0
        container.addSublayer(bgLayer)
        container.addSublayer(textLayer)
        container.add(show, forKey: "show")
        container.add(hide, forKey: "hide")

        parentLayer.addSublayer(container)

        dlog(String(format: "caption[%d]: '%@' FULL-WIDTH w=%.0f h=%.0f side=%.0f y=%.2f font(raw=%.0f,px=%.0f) padX=%.0f padY=%.0f textH=%.0f window=%.0f..%.0f",
                    i, text, availableWidth, bannerHeight, sideMargin, y, rawFontSize, scaledFontSize, padX, padY, textHeight, startMs, endMs))
      }

      vcomp.animationTool = AVVideoCompositionCoreAnimationTool(
        postProcessingAsVideoLayer: videoLayer,
        in: parentLayer
      )
      dlog("vcomp.animationTool enabled (captions=\(captions.count))")
    } else {
      dlog("vcomp.animationTool disabled (no captions)")
    }

    // Use a consistent preset to avoid extremely low bitrates on some devices
    let preset = AVAssetExportPreset1920x1080
    guard let exporter = AVAssetExportSession(asset: mix, presetName: preset) else {
      reject("E_EXPORT", "Could not create AVAssetExportSession", nil); return
    }
    exporter.outputFileType = .mp4
    exporter.outputURL = outURL
    exporter.videoComposition = vcomp
    exporter.shouldOptimizeForNetworkUse = true
    dlog("exporter: preset=\(preset) type=\(String(describing: exporter.outputFileType?.rawValue)) output=\(outURL.path)")

    dlog("exporter.start -> \(outURL.path)")
    exporter.exportAsynchronously { [weak self] in
      guard let self = self else { return }
      switch exporter.status {
      case .completed:
        let metaAsset = AVURLAsset(url: outURL)
        let vTracks = metaAsset.tracks(withMediaType: .video)
        let aTracks = metaAsset.tracks(withMediaType: .audio)

        var width = Int(vcomp.renderSize.width)
        var height = Int(vcomp.renderSize.height)
        if let tv = vTracks.first {
          let natural = tv.naturalSize.applying(tv.preferredTransform)
          width = Int(abs(natural.width)); height = Int(abs(natural.height))
          let fps = tv.nominalFrameRate
          let rate = tv.estimatedDataRate
          self.log(String(format: "output track[video]: ns=%@ pt=%@ fps=%.2f dataRate=%.0f",
                          self.str(tv.naturalSize), self.str(tv.preferredTransform), fps, rate))
        }
        if let ta = aTracks.first {
          self.log(String(format: "output track[audio]: rate=%.0f", ta.estimatedDataRate))
        }

        let durationMs = Int((metaAsset.duration.seconds * 1000.0).rounded())
        let attrs = (try? FileManager.default.attributesOfItem(atPath: outURL.path)) ?? [:]
        let sizeBytes = (attrs[.size] as? NSNumber)?.intValue ?? 0
        self.log("completed: file=\(outURL.path) size=\(sizeBytes)B width=\(width) height=\(height) durationMs=\(durationMs) tracks(video=\(vTracks.count),audio=\(aTracks.count))")

        if vTracks.count == 0 || sizeBytes < 300_000 {
          self.log("⚠️ output suspicious: videoTracks=\(vTracks.count) size=\(sizeBytes)B (expected MBs). Check transform/renderSize logs above.")
        }

        resolve(["uri": outURL.absoluteString, "width": width, "height": height, "durationMs": durationMs])

      case .failed, .cancelled:
        let err = exporter.error
        self.log("exporter failed: \(err?.localizedDescription ?? "unknown")")
        reject("E_EXPORT", err?.localizedDescription ?? "Export failed", err)

      default: break
      }
    }
  }

  // MARK: helpers

  // (Kept for completeness; not used for vertical measurement anymore.)
  private func measure(text: String, font: UIFont, maxWidth: CGFloat) -> CGSize {
    let rect = (text as NSString).boundingRect(
      with: CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin], // deliberately NOT using .usesFontLeading
      attributes: [.font: font],
      context: nil
    )
    return CGSize(width: ceil(rect.width), height: ceil(rect.height))
  }

  private func colorFromString(_ str: String) -> UIColor {
    let s = str.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if s.hasPrefix("#") {
      let hex = String(s.dropFirst())
      var rgb: UInt64 = 0
      Scanner(string: hex).scanHexInt64(&rgb)
      if hex.count == 6 {
        return UIColor(
          red: CGFloat((rgb & 0xFF0000) >> 16)/255.0,
          green: CGFloat((rgb & 0x00FF00) >> 8)/255.0,
          blue: CGFloat(rgb & 0x0000FF)/255.0,
          alpha: 1.0)
      } else if hex.count == 8 { // RRGGBBAA
        return UIColor(
          red: CGFloat((rgb & 0xFF000000) >> 24)/255.0,
          green: CGFloat((rgb & 0x00FF0000) >> 16)/255.0,
          blue: CGFloat((rgb & 0x0000FF00) >> 8)/255.0,
          alpha: CGFloat(rgb & 0x000000FF)/255.0)
      }
    }
    if s.hasPrefix("rgba") {
      let nums = s.replacingOccurrences(of: "rgba", with: "")
        .replacingOccurrences(of: "(", with: "")
        .replacingOccurrences(of: ")", with: "")
        .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
      if nums.count == 4,
         let r = Double(nums[0]), let g = Double(nums[1]),
         let b = Double(nums[2]), let a = Double(nums[3]) {
        return UIColor(red: r/255.0, green: g/255.0, blue: b/255.0, alpha: CGFloat(a))
      }
    }
    return .white
  }
}
