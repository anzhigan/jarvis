import SwiftUI

// One node in the disc card's expanded tree. Renders the type-specific
// mini-card body inside a `MiniCardContainer`. If the node has children
// (Goal with steps/gos, Step with gos), shows a per-card "Show N items"
// dashed toggle that reveals the children indented under a gold left rail.

struct SprintNodeView: View {
    let node: SprintTreeNode
    let onToggleGoDone: (Go) -> Void
    let onToggleRoutineDone: (Routine, APIDate) -> Void
    @State private var open: Bool = false

    private var hasChildren: Bool { !node.children.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            MiniCardContainer(kind: node.kind.rawValue, done: node.done) {
                content
            }
            if hasChildren {
                toggle.padding(.top, 8)
            }
            if open && hasChildren {
                childrenSection.padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch node.kind {
        case .goal:    if let g = node.goal    { MiniGoalCardBody(goal: g) }
        case .step:    if let s = node.step    {
            let palette: Color = node.children.first.flatMap { $0.go }.map { _ in Theme.Color.ochre } ?? Theme.Color.ochre
            MiniStepCardBody(step: s, palette: palette)
        }
        case .go:      if let g = node.go      {
            MiniGoCardBody(go: g, onLog: { onToggleGoDone(g) })
        }
        case .routine: if let r = node.routine { MiniRoutineCardBody(routine: r) }
        }
    }

    private var toggle: some View {
        Button { open.toggle() } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .rotationEffect(.degrees(open ? 90 : 0))
                    .animation(.easeOut(duration: 0.14), value: open)
                Text(open
                     ? "Hide \(node.children.count) item\(node.children.count == 1 ? "" : "s")"
                     : "Show \(node.children.count) item\(node.children.count == 1 ? "" : "s")")
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.Color.ink3)
            .frame(maxWidth: .infinity).frame(height: 32)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
        }
        .buttonStyle(.plain)
    }

    private var childrenSection: some View {
        HStack(alignment: .top, spacing: 0) {
            // Gold left rail signals the items belong to the parent above.
            Rectangle().fill(Theme.Color.ochre).frame(width: 2)
                .padding(.vertical, 4)
            VStack(spacing: 6) {
                ForEach(node.children) { child in
                    SprintNodeView(
                        node: child,
                        onToggleGoDone: onToggleGoDone,
                        onToggleRoutineDone: onToggleRoutineDone
                    )
                }
            }
            .padding(.leading, 12)
        }
    }
}
