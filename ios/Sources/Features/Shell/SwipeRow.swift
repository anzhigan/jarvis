import SwiftUI
import UIKit

// SwipeRow — port of frontend `SwipeableRow.tsx`. Reveals two rounded
// action buttons (Edit / Delete) when the user swipes the card left.
//
// Implementation is UIKit-based because SwiftUI's gesture system can't
// reliably coexist with ScrollView for horizontal swipe-to-reveal: the
// ScrollView's internal pan recognizer steals the touch before our
// SwiftUI DragGesture has a chance to discriminate direction.
//
// Architecture:
// - A UIView with a custom UIPanGestureRecognizer that fails as soon as
//   the touch is mostly-vertical (so the ancestor scroll claims the
//   touch and vertical scroll keeps working).
// - The visible row content is rendered via UIHostingController and
//   slides horizontally based on the pan translation.
// - Underneath we draw the Edit / Delete buttons (laid out per the
//   web design: 56×rowHeight, 14pt corner radius, indigo / rust bg).

struct SwipeRow<Content: View>: View {
    let onEdit: (() -> Void)?
    let onDelete: (() -> Void)?
    let onTap: (() -> Void)?
    @ViewBuilder var content: () -> Content

    var body: some View {
        SwipeRowRepresentable(
            onEdit: onEdit,
            onDelete: onDelete,
            onTap: onTap,
            content: AnyView(content())
        )
        .frame(maxWidth: .infinity)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - UIViewRepresentable wrapper

private struct SwipeRowRepresentable: UIViewRepresentable {
    let onEdit: (() -> Void)?
    let onDelete: (() -> Void)?
    let onTap: (() -> Void)?
    let content: AnyView

    func makeUIView(context: Context) -> SwipeRowUIView {
        let v = SwipeRowUIView()
        v.setContent(content)
        v.onEdit = onEdit
        v.onDelete = onDelete
        v.onTap = onTap
        return v
    }

    func updateUIView(_ v: SwipeRowUIView, context: Context) {
        v.setContent(content)
        v.onEdit = onEdit
        v.onDelete = onDelete
        v.onTap = onTap
    }

    @MainActor
    static func dismantleUIView(_ v: SwipeRowUIView, coordinator: ()) {
        v.dismantle()
    }
}

// MARK: - The UIView

@MainActor
final class SwipeRowUIView: UIView {
    // Public callbacks
    var onEdit: (() -> Void)?
    var onDelete: (() -> Void)?
    var onTap: (() -> Void)?

    // Layout constants (mirror web `.m-swipe-actions` / `.m-swipe-action`)
    private let openOffset: CGFloat = 140
    private let threshold: CGFloat = 60
    private let overshoot: CGFloat = 30
    private let buttonWidth: CGFloat = 56
    private let buttonSpacing: CGFloat = 8

    // State
    private var committedOffset: CGFloat = 0
    private var isOpen: Bool = false
    private weak var lockedScrollView: UIScrollView?
    // intrinsicContentSize cache — recomputing systemLayoutSizeFitting on
    // every layout pass is the single biggest cost in this view.
    private var cachedFitWidth: CGFloat = -1
    private var cachedFitHeight: CGFloat = -1

    // Subviews
    private let contentHost = UIView()
    private var hostingController: UIHostingController<AnyView>?
    private let actionsBackground = UIView()
    private let editButton = UIButton(type: .system)
    private let deleteButton = UIButton(type: .system)

    private var contentLeading: NSLayoutConstraint!

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupLayout()
        setupGestures()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupLayout() {
        // Action buttons (back layer) — hidden by default so they don't
        // peek through the rounded corners of the foreground card.
        actionsBackground.alpha = 0
        actionsBackground.translatesAutoresizingMaskIntoConstraints = false
        addSubview(actionsBackground)
        NSLayoutConstraint.activate([
            actionsBackground.topAnchor.constraint(equalTo: topAnchor),
            actionsBackground.bottomAnchor.constraint(equalTo: bottomAnchor),
            actionsBackground.trailingAnchor.constraint(equalTo: trailingAnchor),
            actionsBackground.leadingAnchor.constraint(equalTo: trailingAnchor,
                                                       constant: -(buttonWidth * 2 + buttonSpacing + 12 + 8)),
        ])

        configureButton(editButton, title: "Edit",    icon: "pencil",
                        bg: UIColor(named: "Indigo") ?? .systemIndigo,
                        action: #selector(handleEdit))
        configureButton(deleteButton, title: "Delete", icon: "trash",
                        bg: UIColor(named: "Rust")   ?? .systemRed,
                        action: #selector(handleDelete))

        let stack = UIStackView(arrangedSubviews: [editButton, deleteButton])
        stack.axis = .horizontal
        stack.spacing = buttonSpacing
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        actionsBackground.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: actionsBackground.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: actionsBackground.bottomAnchor, constant: -4),
            stack.leadingAnchor.constraint(equalTo: actionsBackground.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: actionsBackground.trailingAnchor, constant: -12),
        ])

        // Content (front layer)
        contentHost.translatesAutoresizingMaskIntoConstraints = false
        contentHost.backgroundColor = .clear
        addSubview(contentHost)
        contentLeading = contentHost.leadingAnchor.constraint(equalTo: leadingAnchor)
        NSLayoutConstraint.activate([
            contentHost.topAnchor.constraint(equalTo: topAnchor),
            contentHost.bottomAnchor.constraint(equalTo: bottomAnchor),
            contentLeading,
            contentHost.widthAnchor.constraint(equalTo: widthAnchor),
        ])

        backgroundColor = .clear
    }

    private func configureButton(_ b: UIButton, title: String, icon: String,
                                 bg: UIColor, action: Selector) {
        var cfg = UIButton.Configuration.plain()
        cfg.image = UIImage(systemName: icon,
                            withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .medium))
        cfg.title = title
        cfg.imagePlacement = .top
        cfg.imagePadding = 4
        let paper = UIColor(named: "Paper") ?? .white
        cfg.baseForegroundColor = paper
        var titleAttr = AttributeContainer()
        titleAttr.font = .systemFont(ofSize: 11, weight: .medium)
        titleAttr.foregroundColor = paper
        cfg.attributedTitle = AttributedString(title, attributes: titleAttr)
        b.configuration = cfg
        b.backgroundColor = bg
        b.layer.cornerRadius = 14
        b.layer.cornerCurve = .continuous
        b.layer.masksToBounds = true
        b.addTarget(self, action: action, for: .touchUpInside)
    }

    private func setupGestures() {
        let pan = HorizontalOnlyPan(target: self, action: #selector(handlePan(_:)))
        pan.delegate = self
        pan.cancelsTouchesInView = false
        addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tap.delegate = self
        tap.cancelsTouchesInView = false
        contentHost.addGestureRecognizer(tap)
    }

    // MARK: Content (SwiftUI hosting)

    func setContent(_ view: AnyView) {
        if let host = hostingController {
            host.rootView = view
            invalidateSizeCache()
            return
        }
        let host = UIHostingController(rootView: view)
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        // Lock the hosting view horizontally to the contentHost so its
        // intrinsic content size never pushes the row wider than the
        // parent. Vertical size is driven by SwiftUI via sizingOptions.
        host.view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        host.view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        contentHost.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: contentHost.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: contentHost.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: contentHost.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: contentHost.trailingAnchor),
        ])
        host.sizingOptions = [.intrinsicContentSize]
        hostingController = host
    }

    override var intrinsicContentSize: CGSize {
        guard let host = hostingController?.view else { return .zero }
        let w = bounds.width > 0 ? bounds.width : UIScreen.main.bounds.width
        if abs(cachedFitWidth - w) < 0.5, cachedFitHeight > 0 {
            return CGSize(width: UIView.noIntrinsicMetric, height: cachedFitHeight)
        }
        let fit = host.systemLayoutSizeFitting(
            CGSize(width: w, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        )
        cachedFitWidth = w
        cachedFitHeight = fit.height
        return CGSize(width: UIView.noIntrinsicMetric, height: fit.height)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Only invalidate when width changes (rotation, list reflow) —
        // unconditional invalidation here causes layout thrash.
        if abs(cachedFitWidth - bounds.width) > 0.5 {
            invalidateSizeCache()
        }
    }

    private func invalidateSizeCache() {
        cachedFitWidth = -1
        cachedFitHeight = -1
        invalidateIntrinsicContentSize()
    }

    func dismantle() {
        // Safety: if the row is recycled mid-swipe, restore scroll.
        lockedScrollView?.isScrollEnabled = true
        lockedScrollView = nil
        hostingController?.view.removeFromSuperview()
        hostingController = nil
    }

    // MARK: Gestures

    @objc private func handlePan(_ g: UIPanGestureRecognizer) {
        let dx = g.translation(in: self).x
        switch g.state {
        case .began:
            // Pin the ancestor scroll view so the user can't drag the
            // list up or down while they're committed to a horizontal swipe.
            if let sv = ancestorScrollView() {
                sv.isScrollEnabled = false
                lockedScrollView = sv
            }
            applyOffset(dx)
        case .changed:
            applyOffset(dx)
        case .ended, .cancelled, .failed:
            lockedScrollView?.isScrollEnabled = true
            lockedScrollView = nil
            let final = committedOffset + dx
            if final < -threshold {
                openActions(animated: true)
            } else {
                closeActions(animated: true)
            }
        default: break
        }
    }

    private func applyOffset(_ dx: CGFloat) {
        let raw = committedOffset + dx
        let clamped = min(0, max(-openOffset - overshoot, raw))
        contentLeading.constant = clamped
        actionsBackground.alpha = min(1, abs(clamped) / openOffset)
    }

    private func ancestorScrollView() -> UIScrollView? {
        var v: UIView? = self.superview
        while v != nil, !(v is UIScrollView) {
            v = v?.superview
        }
        return v as? UIScrollView
    }

    @objc private func handleTap() {
        if isOpen {
            closeActions(animated: true)
        } else {
            onTap?()
        }
    }

    @objc private func handleEdit() {
        closeActions(animated: true)
        onEdit?()
    }
    @objc private func handleDelete() {
        closeActions(animated: true)
        onDelete?()
    }

    private func openActions(animated: Bool) {
        committedOffset = -openOffset
        isOpen = true
        animate(animated) {
            self.contentLeading.constant = -self.openOffset
            self.actionsBackground.alpha = 1
            self.layoutIfNeeded()
        }
    }
    private func closeActions(animated: Bool) {
        committedOffset = 0
        isOpen = false
        animate(animated) {
            self.contentLeading.constant = 0
            self.actionsBackground.alpha = 0
            self.layoutIfNeeded()
        }
    }
    private func animate(_ animated: Bool, _ block: @escaping () -> Void) {
        if animated {
            UIView.animate(withDuration: 0.22,
                           delay: 0,
                           usingSpringWithDamping: 0.92,
                           initialSpringVelocity: 0,
                           options: [.allowUserInteraction, .curveEaseOut],
                           animations: block)
        } else {
            block()
        }
    }
}

// MARK: - Gesture delegates

extension SwipeRowUIView: UIGestureRecognizerDelegate {
    nonisolated func gestureRecognizer(_ g: UIGestureRecognizer,
                                       shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        // Allow the ancestor scroll view's pan to recognize alongside
        // our pan; our HorizontalOnlyPan fails itself on vertical motion
        // so the two never both produce visible movement.
        return true
    }
}

// MARK: - Pan recognizer with horizontal-only direction filter

private final class HorizontalOnlyPan: UIPanGestureRecognizer {
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        // Only check at the very start; once we're tracking horizontal
        // motion we want every subsequent translation, even if the
        // user briefly moves vertically.
        guard state == .began else { return }
        let t = translation(in: view)
        if abs(t.y) > abs(t.x) {
            state = .failed
        }
    }
}
