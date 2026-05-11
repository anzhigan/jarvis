import SwiftUI
import UIKit

// Rich-text body editor — actually renders bold/italic/headings instead of
// showing markdown markers. UITextView owns the attributedText; SwiftUI
// only knows about the initial HTML, the controller object, and a
// "content changed" callback. We deliberately do NOT mirror the text into
// a SwiftUI `@Binding` — earlier rounds did that, which roundtripped the
// HTML through @State every keystroke and produced AttributeGraph cycles.
//
// The toolbar buttons call methods on `EditorController` directly. The
// controller mutates the UITextView's attributedText synchronously; the
// view tree above isn't subscribed to anything the controller changes,
// so there's no publish/subscribe loop to detect.

struct BodyEditor: UIViewRepresentable {
    let initialHTML: String
    let controller: EditorController
    let onChange: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        tv.backgroundColor = UIColor(named: "Paper")
        tv.textColor = UIColor(named: "Ink")
        tv.font = EditorController.bodyFont
        tv.adjustsFontForContentSizeCategory = false
        tv.isEditable = true
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.dataDetectorTypes = []
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.typingAttributes = EditorController.bodyAttributes
        // One-shot import of the existing HTML body. After this, the
        // attributedText is the source of truth and nothing reaches into
        // it from SwiftUI state.
        if !initialHTML.isEmpty {
            tv.attributedText = HTMLImporter.import(initialHTML)
        }
        controller.bind(to: tv)

        // Tap recognizer for image attachments → opens resize/rotate menu.
        // Delegate's `shouldBegin` returns true only on attachments, so
        // regular taps (caret placement etc.) still reach the text view.
        let tap = UITapGestureRecognizer(target: context.coordinator,
                                          action: #selector(Coordinator.handleAttachmentTap(_:)))
        tap.delegate = context.coordinator
        tap.cancelsTouchesInView = false
        tv.addGestureRecognizer(tap)

        return tv
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // No-op. UITextView is the source of truth for body content from
        // makeUIView onward; updateUIView fires for unrelated SwiftUI
        // state changes (keyboard visibility, save status, etc.) and
        // must never touch attributedText.
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let proposed = proposal.width ?? 0
        let width = proposed > 1 ? proposed : UIScreen.main.bounds.width
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .infinity))
        return CGSize(width: width, height: max(fitted.height, 280))
    }

    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate {
        let parent: BodyEditor
        init(_ parent: BodyEditor) { self.parent = parent }

        func textViewDidChange(_ tv: UITextView) {
            // Notify the host (debounced save) without writing to any
            // SwiftUI state — that's where the previous editor lost its
            // mind. The closure captures `self` only as a fire-and-forget
            // signal.
            parent.onChange()
        }

        // MARK: - Image attachment tap

        nonisolated func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            MainActor.assumeIsolated {
                guard let tap = g as? UITapGestureRecognizer,
                      let tv = parent.controller.textView else { return false }
                let index = characterIndex(at: tap.location(in: tv), in: tv)
                guard index >= 0, index < tv.attributedText.length else { return false }
                return tv.attributedText.attribute(.attachment, at: index, effectiveRange: nil) is NSTextAttachment
            }
        }

        @objc func handleAttachmentTap(_ tap: UITapGestureRecognizer) {
            guard let tv = parent.controller.textView else { return }
            let index = characterIndex(at: tap.location(in: tv), in: tv)
            guard index >= 0, index < tv.attributedText.length else { return }
            parent.controller.showImageMenu(at: index)
        }

        @MainActor
        private func characterIndex(at point: CGPoint, in tv: UITextView) -> Int {
            let adjusted = CGPoint(
                x: point.x - tv.textContainerInset.left,
                y: point.y - tv.textContainerInset.top
            )
            var partial: CGFloat = 0
            let glyph = tv.layoutManager.glyphIndex(for: adjusted, in: tv.textContainer,
                                                   fractionOfDistanceThroughGlyph: &partial)
            return tv.layoutManager.characterIndexForGlyph(at: glyph)
        }
    }
}

// MARK: - EditorController

/// Plain reference type the toolbar talks to. No ObservableObject, no
/// @Observable — there's nothing to publish. Toolbar buttons call methods
/// on this controller and it mutates the bound UITextView's attributedText
/// directly. SwiftUI never observes any of those mutations.
@MainActor
final class EditorController {
    weak var textView: UITextView?

    /// Body font size matches Apple Notes — 18pt is slightly heavier than
    /// the SwiftUI default (17) and matches the eye-comfort of long-form
    /// note reading.
    static let bodyFont: UIFont = .systemFont(ofSize: 18)

    @MainActor static var bodyParagraph: NSMutableParagraphStyle {
        let p = NSMutableParagraphStyle()
        p.lineSpacing = 6
        // Visible gap after each paragraph (any line break) — matches the
        // "<p>…</p>" spacing on the web side and survives HTML round-trip.
        p.paragraphSpacing = 10
        return p
    }
    @MainActor static var bodyAttributes: [NSAttributedString.Key: Any] {
        [
            .font: bodyFont,
            .foregroundColor: UIColor(named: "Ink") ?? .label,
            .paragraphStyle: bodyParagraph,
        ]
    }

    func bind(to tv: UITextView) { self.textView = tv }

    // MARK: - Read

    /// Serialise the current attributedText to web-compatible HTML.
    func currentHTML() -> String {
        guard let tv = textView else { return "" }
        return HTMLExporter.export(tv.attributedText)
    }

    func dismissKeyboard() {
        textView?.resignFirstResponder()
    }

    // MARK: - Inline style toggles

    func toggleBold()   { toggleTrait(.traitBold) }
    func toggleItalic() { toggleTrait(.traitItalic) }

    func toggleUnderline() {
        toggleAttr(.underlineStyle, on: NSUnderlineStyle.single.rawValue)
    }
    func toggleStrikethrough() {
        toggleAttr(.strikethroughStyle, on: NSUnderlineStyle.single.rawValue)
    }

    // MARK: - Headings (line-scoped)

    func setHeading(_ level: Int) {
        guard let tv = textView else { return }
        let pointSize: CGFloat = level == 1 ? 28 : level == 2 ? 24 : level == 3 ? 20 : 18
        var font = UIFont.systemFont(ofSize: pointSize, weight: level == 0 ? .regular : .semibold)
        let lineRange = self.lineRange(in: tv)
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        // Preserve bold/italic on the line by re-applying any traits.
        mutable.enumerateAttribute(.font, in: lineRange, options: []) { value, sub, _ in
            let existing = (value as? UIFont)?.fontDescriptor.symbolicTraits ?? []
            if let descriptor = font.fontDescriptor.withSymbolicTraits(existing) {
                font = UIFont(descriptor: descriptor, size: pointSize)
            }
            mutable.addAttribute(.font, value: font, range: sub)
        }
        let savedOffset = tv.contentOffset
        tv.attributedText = mutable
        tv.selectedRange = lineRange
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }

    // MARK: - Lists / checklist (line-scoped, character markers)

    func toggleBulletList()  { toggleLinePrefix("• ") }
    func toggleChecklist()   { toggleLinePrefix("☐ ") }

    private func toggleLinePrefix(_ prefix: String) {
        guard let tv = textView else { return }
        let lineRange = self.lineRange(in: tv)
        let nsText = tv.text as NSString
        var line = nsText.substring(with: lineRange)
        let hadNewline = line.hasSuffix("\n")
        if hadNewline { line.removeLast() }
        let allMarkers = ["• ", "☐ ", "☑ "]
        var stripped = line
        for m in allMarkers where stripped.hasPrefix(m) {
            stripped.removeFirst(m.count)
            break
        }
        // If the line already had the requested marker, just strip it (toggle off).
        // Otherwise add it.
        let newLine = (stripped != line) && (line.hasPrefix(prefix))
            ? stripped + (hadNewline ? "\n" : "")
            : prefix + stripped + (hadNewline ? "\n" : "")
        let attrsAtLineStart = tv.attributedText.attributes(
            at: min(lineRange.location, max(0, (tv.attributedText.length - 1))),
            effectiveRange: nil
        )
        let replacement = NSAttributedString(string: newLine, attributes: attrsAtLineStart)
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        mutable.replaceCharacters(in: lineRange, with: replacement)
        let savedOffset = tv.contentOffset
        tv.attributedText = mutable
        let len = (tv.text as NSString).length
        let loc = min(lineRange.location + (newLine as NSString).length, len)
        tv.selectedRange = NSRange(location: loc, length: 0)
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }

    // MARK: - Link

    func insertLink(url: String) {
        guard let tv = textView, !url.isEmpty else { return }
        let range = tv.selectedRange
        let nsText = tv.attributedText.string as NSString
        let selected = range.length > 0 ? nsText.substring(with: range) : ""
        let display = selected.isEmpty ? url : selected
        var attrs = Self.bodyAttributes
        attrs[.link] = URL(string: url) as Any
        attrs[.foregroundColor] = UIColor(named: "Indigo") ?? .systemBlue
        attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
        let link = NSAttributedString(string: display, attributes: attrs)
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        mutable.replaceCharacters(in: range, with: link)
        let savedOffset = tv.contentOffset
        tv.attributedText = mutable
        tv.selectedRange = NSRange(location: range.location + display.count, length: 0)
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }

    // MARK: - Image menu (resize / rotate)

    /// Presents an action sheet with size + rotate options for the
    /// attachment at `index`. Called when the user taps an inline image.
    func showImageMenu(at index: Int) {
        guard let tv = textView,
              index < tv.attributedText.length,
              tv.attributedText.attribute(.attachment, at: index, effectiveRange: nil) is NSTextAttachment,
              let presenter = Self.topViewController(near: tv)
        else { return }

        let alert = UIAlertController(title: "Image", message: nil, preferredStyle: .actionSheet)
        alert.addAction(UIAlertAction(title: "Smaller",   style: .default) { [weak self] _ in
            self?.resizeAttachment(at: index, scale: 0.75)
        })
        alert.addAction(UIAlertAction(title: "Larger",    style: .default) { [weak self] _ in
            self?.resizeAttachment(at: index, scale: 1.33)
        })
        alert.addAction(UIAlertAction(title: "Fit width", style: .default) { [weak self] _ in
            self?.resizeAttachment(at: index, scale: -1)
        })
        alert.addAction(UIAlertAction(title: "Rotate left",  style: .default) { [weak self] _ in
            self?.rotateAttachment(at: index, degrees: -90)
        })
        alert.addAction(UIAlertAction(title: "Rotate right", style: .default) { [weak self] _ in
            self?.rotateAttachment(at: index, degrees: 90)
        })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))

        if let pop = alert.popoverPresentationController {
            pop.sourceView = tv
            pop.sourceRect = CGRect(x: tv.bounds.midX, y: tv.bounds.midY, width: 1, height: 1)
        }
        presenter.present(alert, animated: true)
    }

    func resizeAttachment(at index: Int, scale: CGFloat) {
        guard let tv = textView,
              index < tv.attributedText.length,
              let attachment = tv.attributedText.attribute(.attachment, at: index, effectiveRange: nil) as? NSTextAttachment
        else { return }
        let containerWidth = max(80, tv.bounds.width
            - tv.textContainerInset.left
            - tv.textContainerInset.right
            - 2 * tv.textContainer.lineFragmentPadding)
        let cur = attachment.bounds.size
        let aspect = cur.height / max(cur.width, 1)
        let newWidth: CGFloat
        if scale < 0 {
            newWidth = containerWidth
        } else {
            newWidth = min(containerWidth, max(80, cur.width * scale))
        }
        attachment.bounds = CGRect(x: 0, y: 0, width: newWidth, height: newWidth * aspect)
        refreshAttachment(at: index, in: tv)
    }

    func rotateAttachment(at index: Int, degrees: CGFloat) {
        guard let tv = textView,
              index < tv.attributedText.length,
              let attachment = tv.attributedText.attribute(.attachment, at: index, effectiveRange: nil) as? NSTextAttachment,
              let image = attachment.image
        else { return }
        let radians = degrees * .pi / 180
        attachment.image = Self.rotateImage(image, by: radians)
        let b = attachment.bounds
        attachment.bounds = CGRect(x: b.origin.x, y: b.origin.y, width: b.height, height: b.width)
        refreshAttachment(at: index, in: tv)
    }

    private func refreshAttachment(at index: Int, in tv: UITextView) {
        // Swap the attachment range with itself via textStorage — that
        // tells UITextView's layout manager to re-measure the cell
        // without rebuilding the entire attributed string (which was
        // O(textLength)).
        let r = NSRange(location: index, length: 1)
        let same = tv.attributedText.attributedSubstring(from: r)
        tv.textStorage.beginEditing()
        tv.textStorage.replaceCharacters(in: r, with: same)
        tv.textStorage.endEditing()
        tv.delegate?.textViewDidChange?(tv)
    }

    private static func rotateImage(_ image: UIImage, by radians: CGFloat) -> UIImage {
        let original = image.size
        let rotatedRect = CGRect(origin: .zero, size: original)
            .applying(CGAffineTransform(rotationAngle: radians))
        let newSize = CGSize(width: abs(rotatedRect.width), height: abs(rotatedRect.height))
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { ctx in
            ctx.cgContext.translateBy(x: newSize.width / 2, y: newSize.height / 2)
            ctx.cgContext.rotate(by: radians)
            image.draw(in: CGRect(x: -original.width / 2, y: -original.height / 2,
                                  width: original.width, height: original.height))
        }
    }

    /// Walks up from `view` to find the owning UIViewController. Falls
    /// back to the foreground scene's key window when the view isn't yet
    /// in a controller hierarchy. Works correctly with multi-window iPad.
    private static func topViewController(near view: UIView) -> UIViewController? {
        // 1. Walk responder chain — most reliable when view is on-screen.
        var next: UIResponder? = view
        while let r = next {
            if let vc = r as? UIViewController {
                var top: UIViewController = vc
                while let p = top.presentedViewController { top = p }
                return top
            }
            next = r.next
        }
        // 2. Fallback: scene the view's window belongs to.
        if let window = view.window, let root = window.rootViewController {
            var top: UIViewController = root
            while let p = top.presentedViewController { top = p }
            return top
        }
        // 3. Last resort: any foreground active scene.
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard let key = scene?.keyWindow ?? scene?.windows.first,
              var top = key.rootViewController else { return nil }
        while let p = top.presentedViewController { top = p }
        return top
    }

    // MARK: - Image inline (real NSTextAttachment)

    /// Inserts the picked image inline as an NSTextAttachment so it
    /// actually renders in the editor (instead of showing a clickable
    /// placeholder). The `url` is stored alongside as a custom attribute
    /// so HTMLExporter can emit `<img src="…"/>` for the web side.
    static let imageURLAttribute = NSAttributedString.Key("jarvImageURL")

    func insertImage(_ image: UIImage, url: String) {
        guard let tv = textView else { return }

        // Scale attachment so it fits inside the text container width.
        let containerWidth = max(80, tv.bounds.width
            - tv.textContainerInset.left
            - tv.textContainerInset.right
            - 2 * tv.textContainer.lineFragmentPadding)
        let aspect = image.size.width > 0 ? image.size.height / image.size.width : 1
        let displayWidth = min(image.size.width, containerWidth)
        let displayHeight = displayWidth * aspect

        let attachment = NSTextAttachment()
        attachment.image = image
        attachment.bounds = CGRect(x: 0, y: 0, width: displayWidth, height: displayHeight)

        let attachmentString = NSMutableAttributedString(attachment: attachment)
        let fullRange = NSRange(location: 0, length: attachmentString.length)
        attachmentString.addAttribute(Self.imageURLAttribute, value: url, range: fullRange)
        attachmentString.addAttribute(.font, value: Self.bodyFont, range: fullRange)

        // Surround with newlines so the image sits on its own line.
        let range = tv.selectedRange
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        let needsLeadingNewline = range.location > 0
            && (tv.text as NSString).substring(with: NSRange(location: range.location - 1, length: 1)) != "\n"
        let leading  = needsLeadingNewline ? NSAttributedString(string: "\n", attributes: Self.bodyAttributes) : NSAttributedString()
        let trailing = NSAttributedString(string: "\n", attributes: Self.bodyAttributes)

        let block = NSMutableAttributedString()
        block.append(leading)
        block.append(attachmentString)
        block.append(trailing)

        let insertLoc = range.location + range.length
        let savedOffset = tv.contentOffset
        mutable.insert(block, at: insertLoc)
        tv.attributedText = mutable
        tv.selectedRange = NSRange(location: insertLoc + block.length, length: 0)
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }

    // MARK: - Lower-level helpers

    private func lineRange(in tv: UITextView) -> NSRange {
        let nsText = tv.text as NSString
        return nsText.lineRange(
            for: NSRange(location: min(tv.selectedRange.location, nsText.length), length: 0)
        )
    }

    private func toggleTrait(_ trait: UIFontDescriptor.SymbolicTraits) {
        guard let tv = textView else { return }
        let range = tv.selectedRange
        if range.length == 0 {
            // Just adjust typingAttributes for the caret — next-typed chars
            // get the new trait.
            let baseFont = (tv.typingAttributes[.font] as? UIFont) ?? Self.bodyFont
            var traits = baseFont.fontDescriptor.symbolicTraits
            if traits.contains(trait) { traits.remove(trait) } else { traits.insert(trait) }
            let descriptor = baseFont.fontDescriptor.withSymbolicTraits(traits) ?? baseFont.fontDescriptor
            tv.typingAttributes[.font] = UIFont(descriptor: descriptor, size: baseFont.pointSize)
            return
        }
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        // Read trait at first character of range to decide whether we're
        // turning the trait on (most of the range was off) or off.
        let firstFont = (mutable.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont)
            ?? Self.bodyFont
        let currentlyOn = firstFont.fontDescriptor.symbolicTraits.contains(trait)
        mutable.enumerateAttribute(.font, in: range, options: []) { value, sub, _ in
            let f = (value as? UIFont) ?? Self.bodyFont
            var traits = f.fontDescriptor.symbolicTraits
            if currentlyOn { traits.remove(trait) } else { traits.insert(trait) }
            let desc = f.fontDescriptor.withSymbolicTraits(traits) ?? f.fontDescriptor
            mutable.addAttribute(.font, value: UIFont(descriptor: desc, size: f.pointSize), range: sub)
        }
        let savedOffset = tv.contentOffset
        tv.attributedText = mutable
        tv.selectedRange = range
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }

    private func toggleAttr(_ key: NSAttributedString.Key, on onValue: Int) {
        guard let tv = textView else { return }
        let range = tv.selectedRange
        if range.length == 0 {
            let current = (tv.typingAttributes[key] as? Int) ?? 0
            tv.typingAttributes[key] = current == 0 ? onValue : 0
            return
        }
        let mutable = NSMutableAttributedString(attributedString: tv.attributedText)
        let cur = (mutable.attribute(key, at: range.location, effectiveRange: nil) as? Int) ?? 0
        let next = cur == 0 ? onValue : 0
        mutable.addAttribute(key, value: next, range: range)
        let savedOffset = tv.contentOffset
        tv.attributedText = mutable
        tv.selectedRange = range
        tv.setContentOffset(savedOffset, animated: false)
        tv.delegate?.textViewDidChange?(tv)
    }
}

// MARK: - HTMLImporter / HTMLExporter

/// Lightweight HTML ↔ NSAttributedString converters used by BodyEditor.
/// Both are @MainActor because they touch UIKit types
/// (UIFont/UIColor/NSAttributedString attribute defaults) and are only
/// ever called from the main thread anyway (delegate methods, view setup).
@MainActor
enum HTMLImporter {
    static func `import`(_ html: String) -> NSAttributedString {
        guard let data = html.data(using: .utf8) else {
            return NSAttributedString(string: "")
        }
        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
        ]
        guard let parsed = try? NSMutableAttributedString(data: data, options: opts,
                                                         documentAttributes: nil) else {
            return NSAttributedString(string: html)
        }
        // The HTML parser injects Times New Roman at 12pt for body text
        // (and proportionally tiny sizes for headings). Re-bucket every
        // run into our own design-system sizes: body 18, H3 20, H2 24,
        // H1 28. Without this re-bucketing the editor renders existing
        // notes at 12pt which looks almost unreadable on phone displays.
        let full = NSRange(location: 0, length: parsed.length)
        parsed.enumerateAttribute(.font, in: full, options: []) { value, sub, _ in
            let traits = (value as? UIFont)?.fontDescriptor.symbolicTraits ?? []
            let original = (value as? UIFont)?.pointSize ?? 18
            // Foundation's HTML parser uses 12pt as base; anything larger
            // signals a heading. Map relative sizes back to our bucket.
            let bucketed: CGFloat
            if original >= 22 { bucketed = 28 }
            else if original >= 18 { bucketed = 24 }
            else if original >= 14 { bucketed = 20 }
            else { bucketed = 18 }
            let base = UIFont.systemFont(ofSize: bucketed,
                                         weight: traits.contains(.traitBold) ? .semibold : .regular)
            let desc = base.fontDescriptor.withSymbolicTraits(traits) ?? base.fontDescriptor
            parsed.addAttribute(.font, value: UIFont(descriptor: desc, size: bucketed), range: sub)
        }
        parsed.addAttribute(.foregroundColor,
                            value: UIColor(named: "Ink") ?? .label,
                            range: full)
        parsed.addAttribute(.paragraphStyle,
                            value: EditorController.bodyParagraph,
                            range: full)
        return parsed
    }
}

@MainActor
enum HTMLExporter {
    static func export(_ attr: NSAttributedString) -> String {
        guard attr.length > 0 else { return "" }
        var out = ""
        let lines = attr.string.components(separatedBy: "\n")
        var cursor = 0
        for (i, line) in lines.enumerated() {
            let lineLen = (line as NSString).length
            if line.isEmpty {
                out += "<p></p>"
                cursor += 1
                continue
            }
            let lineRange = NSRange(location: cursor, length: lineLen)
            // Determine the wrapping tag: detect a heading size at line start.
            let firstFont = (attr.attribute(.font, at: lineRange.location, effectiveRange: nil) as? UIFont)
            let openTag: String
            let closeTag: String
            if let size = firstFont?.pointSize {
                if size >= 28 { openTag = "<h1>"; closeTag = "</h1>" }
                else if size >= 24 { openTag = "<h2>"; closeTag = "</h2>" }
                else if size >= 20 { openTag = "<h3>"; closeTag = "</h3>" }
                else { openTag = "<p>"; closeTag = "</p>" }
            } else {
                openTag = "<p>"; closeTag = "</p>"
            }
            out += openTag
            attr.enumerateAttributes(in: lineRange, options: []) { attrs, sub, _ in
                let substring = (attr.string as NSString).substring(with: sub)
                out += renderRun(substring, attrs: attrs)
            }
            out += closeTag
            cursor += lineLen + (i < lines.count - 1 ? 1 : 0)
        }
        return out
    }

    private static func renderRun(_ text: String, attrs: [NSAttributedString.Key: Any]) -> String {
        // Image attachments serialised as a standalone <img> tag.
        if let attachment = attrs[.attachment] as? NSTextAttachment,
           let imageURL = attrs[EditorController.imageURLAttribute] as? String {
            let w = Int(attachment.bounds.width.rounded())
            let h = Int(attachment.bounds.height.rounded())
            return "<img src=\"\(escape(imageURL))\" alt=\"image\" width=\"\(w)\" height=\"\(h)\" />"
        }
        var opens: [String] = []
        var closes: [String] = []
        if let font = attrs[.font] as? UIFont {
            let traits = font.fontDescriptor.symbolicTraits
            if traits.contains(.traitBold)   { opens.append("<strong>"); closes.append("</strong>") }
            if traits.contains(.traitItalic) { opens.append("<em>");     closes.append("</em>") }
        }
        if (attrs[.underlineStyle] as? Int) ?? 0 != 0 {
            opens.append("<u>"); closes.append("</u>")
        }
        if (attrs[.strikethroughStyle] as? Int) ?? 0 != 0 {
            opens.append("<s>"); closes.append("</s>")
        }
        let escaped = escape(text)
        if let url = attrs[.link] as? URL {
            return "<a href=\"\(escape(url.absoluteString))\">" + opens.joined() + escaped + closes.reversed().joined() + "</a>"
        }
        return opens.joined() + escaped + closes.reversed().joined()
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
         .replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;")
         .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
