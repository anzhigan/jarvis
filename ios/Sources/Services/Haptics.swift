import UIKit

// Centralised tactile feedback. The Apple HIG splits feedback into three
// generators with distinct meanings — keep call-sites semantic ("toggle",
// "success", "error") rather than spelling out impact strengths.
//
// Generators are intentionally re-instantiated per call. Re-using a single
// generator with `.prepare()` is faster but keeps the haptic engine warm,
// which costs battery; for the cadence we use (a few per minute, not
// per-frame), the cold-start cost is invisible to the user.

enum Haptics {

    /// A light selection tick. Suitable for tab switches, item selection,
    /// segmented control changes — anything where the user is making a
    /// non-committal choice.
    static func selection() {
        let g = UISelectionFeedbackGenerator()
        g.selectionChanged()
    }

    /// A light/medium/heavy "thump". Light for inert UI tap acks (e.g. an
    /// add button that opens a sheet), medium for state changes (toggle,
    /// pull-to-refresh trigger), heavy for the start of a destructive
    /// confirmation flow.
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        let g = UIImpactFeedbackGenerator(style: style)
        g.impactOccurred()
    }

    /// Distinct success / warning / error notifications. Use sparingly and
    /// only after a meaningful event the user is awaiting (create-saved,
    /// delete-failed, login-error).
    static func notify(_ kind: UINotificationFeedbackGenerator.FeedbackType) {
        let g = UINotificationFeedbackGenerator()
        g.notificationOccurred(kind)
    }
}
