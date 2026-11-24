// Renders each screens/*.html to renders/<name>.png at exactly 390x844 @1x using WKWebView.
// Usage: render <projectRoot> <outDir> name1 name2 ...   (names without .html)
import Cocoa
import WebKit

let args = CommandLine.arguments
let root = URL(fileURLWithPath: args[1], isDirectory: true)
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
var queue = Array(args.dropFirst(3))
let scale = Int(ProcessInfo.processInfo.environment["CREW_RENDER_SCALE"] ?? "1") ?? 1  // 1 = 390x844 px, 2 = 780x1688 px
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

final class R: NSObject, WKNavigationDelegate {
    let win: NSWindow
    let web: WKWebView
    var current = ""
    override init() {
        let cfg = WKWebViewConfiguration()
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844), configuration: cfg)
        win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 390, height: 844), styleMask: [.borderless], backing: .buffered, defer: false)
        win.contentView = web
        win.orderBack(nil)
        super.init()
        web.navigationDelegate = self
    }
    func next() {
        guard !queue.isEmpty else { NSApp.terminate(nil); return }
        current = queue.removeFirst()
        let u = root.appendingPathComponent("screens/\(current).html")
        web.loadFileURL(u, allowingReadAccessTo: root)
    }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            let c = WKSnapshotConfiguration()
            c.rect = CGRect(x: 0, y: 0, width: 390, height: 844)
            c.snapshotWidth = NSNumber(value: 390 * scale)
            w.takeSnapshot(with: c) { img, err in
                guard let img = img else { print("FAIL \(self.current): \(String(describing: err))"); self.next(); return }
                let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 390 * scale, pixelsHigh: 844 * scale, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
                img.draw(in: NSRect(x: 0, y: 0, width: 390 * scale, height: 844 * scale))
                NSGraphicsContext.restoreGraphicsState()
                let data = rep.representation(using: .png, properties: [:])!
                try? data.write(to: self.outDir.appendingPathComponent("\(self.current).png"))
                print("ok \(self.current)")
                self.next()
            }
        }
    }
    var outDir: URL { outDir_ }
}
let outDir_ = outDir
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let r = R()
DispatchQueue.main.async { r.next() }
app.run()
