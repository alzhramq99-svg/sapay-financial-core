import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

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
guard let cgContext = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                                bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
  fatalError("Cannot initialize opaque RGB graphics context")
}
let context = NSGraphicsContext(cgContext: cgContext, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
cgContext.scaleBy(x: scale, y: scale)

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
guard let image = cgContext.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
  fatalError("Cannot create PNG image")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
  fatalError("Cannot write PNG image")
}
print("Generated opaque RGB SApay icon: \\(output.path)")
