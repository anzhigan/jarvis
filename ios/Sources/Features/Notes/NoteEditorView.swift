import SwiftUI
import PhotosUI

// Apple Notes-style editor with real rich-text rendering.
//
// Body uses `BodyEditor` (UITextView under the hood) so Bold/Italic
// actually render as bold/italic text instead of `**markers**`. SwiftUI
// stays out of the content observation loop: the host view doesn't bind
// to body text and doesn't observe an @Published formatter — that's what
// was producing AttributeGraph cycles in earlier rounds. The toolbar
// buttons just call methods on `EditorController`, which mutates the
// UITextView's attributedText directly.

struct NoteEditorView: View {
    @ObservedObject var vm: NotesViewModel
    @EnvironmentObject private var repos: Repositories
    @Environment(\.dismiss) private var dismiss

    let noteId: UUID

    @State private var title: String = ""
    @State private var initialHTML: String = ""
    @State private var initialLoadDone = false
    @State private var saveTask: Task<Void, Never>? = nil
    @State private var isSaving = false
    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var uploadError: String? = nil
    @State private var keyboardVisible: Bool = false
    @State private var promptingForLink = false
    @State private var pendingLinkURL = ""
    @State private var controller = EditorController()
    @State private var scrollOffset: CGFloat = 0
    @FocusState private var titleFocused: Bool

    private var note: Note? { vm.note(noteId) }

    var body: some View {
        // Header dim ramps from 0 → 1 over the first 60pt of scroll.
        let headerOpacity = min(1, max(0, scrollOffset / 60))

        return ZStack(alignment: .top) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    titleField
                    if initialLoadDone {
                        BodyEditor(
                            initialHTML: initialHTML,
                            controller: controller,
                            onChange: scheduleSave
                        )
                        .padding(.horizontal, 16)
                        .padding(.top, 14)
                        .padding(.bottom, 240)
                    } else {
                        Color.clear.frame(height: 240)
                    }
                }
                .background(
                    // UIKit-backed observer for reliable scroll offset.
                    ScrollOffsetObserver(offset: $scrollOffset)
                        .frame(width: 0, height: 0)
                )
            }
            .scrollDismissesKeyboard(.interactively)

            // Darkening fade strip — flush with the top edge of the
            // screen (covers the safe area too), dimming the text that
            // scrolls beneath it as the user scrolls.
            LinearGradient(
                colors: [
                    Theme.Color.ink.opacity(0.55 * headerOpacity),
                    Theme.Color.ink.opacity(0)
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 130)
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)

            floatingTopBar
        }
        .background(Theme.Color.paper.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if keyboardVisible {
                AppleNotesToolbar(controller: controller, onLink: {
                    pendingLinkURL = ""
                    promptingForLink = true
                })
                .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.18), value: keyboardVisible)
        .onAppear { initialLoadIfNeeded() }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await uploadAndInsert(item) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .alert("Insert link", isPresented: $promptingForLink) {
            TextField("https://…", text: $pendingLinkURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
            Button("Insert") {
                let url = pendingLinkURL.trimmingCharacters(in: .whitespaces)
                if !url.isEmpty { controller.insertLink(url: url) }
                pendingLinkURL = ""
            }
            Button("Cancel", role: .cancel) { pendingLinkURL = "" }
        } message: {
            Text("Wraps the selected text with a link, or inserts the URL itself if nothing is selected.")
        }
        .alert(
            "Image upload failed",
            isPresented: Binding(get: { uploadError != nil }, set: { if !$0 { uploadError = nil } }),
            presenting: uploadError
        ) { _ in
            Button("OK") { uploadError = nil }
        } message: { msg in Text(msg) }
    }

    // MARK: - Title

    private var titleField: some View {
        TextField("Title", text: $title)
            .font(.system(size: 24, weight: .semibold, design: .serif))
            .tracking(-0.6)
            .foregroundStyle(Theme.Color.ink)
            .textFieldStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 10)
            .focused($titleFocused)
            .onChange(of: titleFocused) { wasFocused, isFocused in
                guard wasFocused, !isFocused else { return }
                let trimmed = title.trimmingCharacters(in: .whitespaces)
                guard !trimmed.isEmpty, trimmed != note?.name else { return }
                Task { await vm.renameNote(noteId, name: trimmed) }
            }
    }

    // MARK: - Floating top bar

    private var floatingTopBar: some View {
        HStack(spacing: 8) {
            // Back — circular standalone disc.
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Color.indigo)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.Color.paper))
                    .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Spacer()

            if isSaving {
                HStack(spacing: 5) {
                    ProgressView().scaleEffect(0.6)
                    Text("saving…")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Color.ink5)
                }
                .padding(.horizontal, 6)
            }

            // Photo + ellipsis grouped in a single capsule.
            HStack(spacing: 2) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Image(systemName: "photo")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.Color.ink2)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }

                Menu {
                    Button {
                        Task { await vm.togglePin(noteId) }
                    } label: {
                        Label(note?.pinned == true ? "Unpin" : "Pin",
                              systemImage: note?.pinned == true ? "pin.slash" : "pin")
                    }
                    Button(role: .destructive) {
                        Task { await vm.deleteNote(noteId); dismiss() }
                    } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.Color.ink2)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
            }
            .background(Capsule().fill(Theme.Color.paper))
            .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }

    // MARK: - Lifecycle

    private func initialLoadIfNeeded() {
        guard !initialLoadDone, let note else { return }
        title = note.name
        initialHTML = note.content
        initialLoadDone = true
    }

    private func scheduleSave() {
        guard initialLoadDone else { return }
        saveTask?.cancel()
        // Serialise HTML only AFTER the debounce — earlier we built the
        // HTML on every keystroke and threw it away. UITextView's HTML
        // export is O(textLength) so this matters at scale.
        saveTask = Task { [noteId] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            if Task.isCancelled { return }
            let html = await MainActor.run { controller.currentHTML() }
            if Task.isCancelled { return }
            await MainActor.run { isSaving = true }
            _ = await vm.saveNoteContent(noteId, content: html)
            await MainActor.run { isSaving = false }
        }
    }

    // MARK: - Image upload

    private func uploadAndInsert(_ item: PhotosPickerItem) async {
        guard let raw = try? await item.loadTransferable(type: Data.self) else {
            await MainActor.run {
                pickerItem = nil
                uploadError = "Couldn't read the selected image."
            }
            return
        }
        let (data, mime) = resizeForUpload(raw)
        let uiImage = UIImage(data: data)
        do {
            let image = try await repos.notes.uploadNoteImage(
                noteId: noteId, data: data, filename: "image.jpg", mime: mime
            )
            await MainActor.run {
                if let uiImage {
                    controller.insertImage(uiImage, url: image.url)
                }
                pickerItem = nil
            }
        } catch {
            await MainActor.run {
                pickerItem = nil
                uploadError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            }
        }
    }

    private func resizeForUpload(_ data: Data, maxEdge: CGFloat = 1024, quality: CGFloat = 0.75) -> (Data, String) {
        guard let img = UIImage(data: data) else { return (data, "image/jpeg") }
        let longest = max(img.size.width, img.size.height)
        if longest <= maxEdge {
            return (img.jpegData(compressionQuality: quality) ?? data, "image/jpeg")
        }
        let scale = maxEdge / longest
        let newSize = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        let resized = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: newSize)) }
        return (resized.jpegData(compressionQuality: quality) ?? data, "image/jpeg")
    }
}

// MARK: - Scroll offset observer
//
// UIKit-backed observer that walks up the view hierarchy to find the
// hosting UIScrollView (the ScrollView's underlying view), then KVO's
// its contentOffset. PreferenceKey-based readers proved unreliable
// inside ScrollView in some iOS versions.

private struct ScrollOffsetObserver: UIViewRepresentable {
    @Binding var offset: CGFloat

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        let binding = $offset
        let onChange: @MainActor (CGFloat) -> Void = { newOffset in
            binding.wrappedValue = newOffset
        }
        DispatchQueue.main.async {
            context.coordinator.attachIfNeeded(to: uiView, onChange: onChange)
        }
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.detach()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject {
        weak var scrollView: UIScrollView?
        var kvo: NSKeyValueObservation?
        var onChange: ((CGFloat) -> Void)?
        private var lastReported: CGFloat = 0

        func attachIfNeeded(to view: UIView, onChange: @escaping @MainActor (CGFloat) -> Void) {
            self.onChange = onChange
            guard scrollView == nil else { return }
            var cur: UIView? = view.superview
            while cur != nil, !(cur is UIScrollView) {
                cur = cur?.superview
            }
            guard let sv = cur as? UIScrollView else { return }
            scrollView = sv
            // UIScrollView mutates contentOffset on the main thread, so
            // the KVO observation also fires on main. Skip the Task hop
            // and call onChange synchronously — saves ~120 task allocs
            // per second of scrolling.
            kvo = sv.observe(\.contentOffset, options: [.new]) { [weak self] _, change in
                guard let self, let new = change.newValue else { return }
                MainActor.assumeIsolated {
                    let dy = abs(new.y - self.lastReported)
                    guard dy > 0.5 else { return }
                    self.lastReported = new.y
                    self.onChange?(new.y)
                }
            }
        }

        func detach() {
            kvo?.invalidate()
            kvo = nil
            scrollView = nil
            onChange = nil
        }
    }
}

// MARK: - Apple Notes-style toolbar

/// Visual match for the iOS Notes keyboard accessory: a single flat row
/// of icon buttons over a soft tinted bar. Buttons are square (44×44)
/// with a barely-there gray hover background — no pill grouping, no
/// hairline-stroked segments. Apple Notes' real toolbar groups things by
/// SPACING between sections rather than by visible borders, so we do the
/// same with slightly wider gaps before each new function area.
private struct AppleNotesToolbar: View {
    let controller: EditorController
    let onLink: () -> Void

    private let barHeight: CGFloat = 50

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    headingMenu

                    spacer

                    flatBtn("bold")          { controller.toggleBold() }
                    flatBtn("italic")        { controller.toggleItalic() }
                    flatBtn("underline")     { controller.toggleUnderline() }
                    flatBtn("strikethrough") { controller.toggleStrikethrough() }

                    spacer

                    flatBtn("list.bullet") { controller.toggleBulletList() }
                    flatBtn("checklist")   { controller.toggleChecklist() }
                    flatBtn("link")        { onLink() }
                }
                .padding(.horizontal, 8)
            }

            Button {
                controller.dismissKeyboard()
            } label: {
                Image(systemName: "keyboard.chevron.compact.down")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.Color.ink2)
                    .frame(width: 48, height: barHeight)
            }
            .buttonStyle(.plain)
            .background(Theme.Color.cream)
        }
        .frame(height: barHeight)
        .background(Theme.Color.cream)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
        }
    }

    private var spacer: some View {
        Color.clear.frame(width: 12)
    }

    /// "Aa ⌄" — same affordance as Apple Notes' typography popover.
    private var headingMenu: some View {
        Menu {
            Button { controller.setHeading(1) } label: { Label("Title",      systemImage: "textformat.size.larger") }
            Button { controller.setHeading(2) } label: { Label("Heading",    systemImage: "textformat") }
            Button { controller.setHeading(3) } label: { Label("Subheading", systemImage: "textformat.alt") }
            Button { controller.setHeading(0) } label: { Label("Body",       systemImage: "text.alignleft") }
        } label: {
            HStack(spacing: 4) {
                Text("Aa")
                    .font(.system(size: 19, weight: .semibold, design: .serif))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .opacity(0.55)
            }
            .foregroundStyle(Theme.Color.ink)
            .frame(width: 56, height: 36)
            .contentShape(Rectangle())
        }
    }

    private func flatBtn(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(Theme.Color.ink)
                .frame(width: 44, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
