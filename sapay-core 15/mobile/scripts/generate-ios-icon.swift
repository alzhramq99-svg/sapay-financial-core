import AppKit
import Foundation

// Faithful native rasterization of the existing SApay SVG icon:
// public/icons/sapay-512.svg. No external renderer or binary asset required.
let size = 1024
let scale = CGFloat(size) / 512
let output = URL(fileURLWithPath: "resources/AppIcon-1024.png")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)

func rgb(_ hex: UInt32) -> NSColor {
  NSColor(calibratedRed: CGFloat((hex >> 16) & 255) / 255,
          green: CGFloat((hex >> 8) & 255) / 255,
          blue: CGFloat(hex & 255) / 255, alpha: 1)
}
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                    bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false,
                                    isPlanar: false, colorSpaceName: .deviceRGB,
                                    bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
  fatalError("Cannot initialize RGB icon bitmap")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
context.cgContext.scaleBy(x: scale, y: scale)

rgb(0x102a43).setFill()
NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 512, height: 512), xRadius: 112, yRadius: 112).fill()

let circle = NSBezierPath(ovalIn: NSRect(x: 80, y: 80, width: 352, height: 352))
circle.lineWidth = 22
rgb(0x35b879).setStroke()
circle.stroke()

// SVG text uses x=256, y=296 (SVG top-down). AppKit's origin is bottom-up.
let font = NSFont(name: "Arial-BoldMT", size: 145) ?? NSFont.boldSystemFont(ofSize: 145)
let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
let text = "SA" as NSString
let dimensions = text.size(withAttributes: attributes)
text.draw(at: NSPoint(x: 256 - dimensions.width / 2, y: 512 - 296), withAttributes: attributes)

let dash = NSBezierPath()
dash.move(to: NSPoint(x: 326, y: 512 - 344))
dash.line(to: NSPoint(x: 388, y: 512 - 344))
dash.lineWidth = 8
dash.lineCapStyle = .round
rgb(0x35b879).setStroke()
dash.stroke()

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Cannot encode icon as PNG")
}
try png.write(to: output)
print("Generated RGB SApay app icon: \\(output.path)")
