import SwiftUI

// Goal/Step/Go/Routine accent palette — same six muted tones the web side
// landed on after the indigo redesign. Selected from Goal.color (an arbitrary
// hex string), with a fallback to ink-3 for legacy goals saved with values
// outside this palette.

enum GoalPalette {
    struct Swatch: Identifiable, Hashable {
        let id: String      // hex
        let name: String
        var hex: String { id }
    }

    static let swatches: [Swatch] = [
        .init(id: "#2C4A60", name: "Indigo"),
        .init(id: "#5A6B78", name: "Slate"),
        .init(id: "#6B7A4F", name: "Moss"),
        .init(id: "#A18030", name: "Ochre"),
        .init(id: "#A04A39", name: "Rust"),
        .init(id: "#4A3A2D", name: "Walnut"),
    ]

    static let `default` = swatches[0].hex

    /// Convert a stored hex string (`#RRGGBB`) to a SwiftUI Color, falling
    /// back to ink-3 if the value can't be parsed.
    static func color(forHex raw: String) -> Color {
        var s = raw
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let rgb = UInt32(s, radix: 16) else {
            return Theme.Color.ink3
        }
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8)  & 0xFF) / 255
        let b = Double( rgb        & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}

// Status / priority palette helpers used by Kanban + StepCard.
extension TaskStatus {
    var displayName: String {
        switch self {
        case .active:  return "Active"
        case .backlog: return "Backlog"
        case .paused:  return "Paused"
        case .done:    return "Done"
        }
    }
}

extension TaskPriority {
    /// (background, foreground) pair for the priority pill.
    var palette: (bg: Color, fg: Color) {
        switch self {
        case .high:   return (Theme.Color.rust.opacity(0.14),  Theme.Color.rust)
        case .medium: return (Theme.Color.ochre.opacity(0.14), Theme.Color.ochre)
        case .low:    return (Theme.Color.cream,               Theme.Color.ink5)
        }
    }
}
