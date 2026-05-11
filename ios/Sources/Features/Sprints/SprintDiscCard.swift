import SwiftUI

// 1-for-1 port of `sprint-disc` from `frontend/src/styles/mobile.css`.
//
// Layout:
//   ╭─ accent strip (sprint.color, height 4) ─╮
//   │ ┌─ disc 130×130 ─┐ ┌─ side ─────────┐ │
//   │ │  outer ring    │ │  Sprint        │ │
//   │ │  inner ring    │ │  TITLE         │ │
//   │ │  N days left   │ │  period        │ │
//   │ └────────────────┘ │  ● Time  N%   │ │
//   │                    │  ● Done  N%   │ │
//   ├──────────── footer ────────────────┤ │
//   │ status pill           ↗ pace label  │ │
//   ├──────── Show N items toggle ────────┤ │
//   ╰─────────────────────────────────────╯
//
// Two concentric rings rendered with SwiftUI's Path: outer = % time elapsed
// (sprint colour), inner = % items completed (ochre). Days-remaining number
// sits in the centre.

struct SprintDiscCard: View {
    let row: SprintWithProgress
    let tree: [SprintTreeNode]
    let total: Int
    let done: Int
    let onAddItems: () -> Void
    let onToggleGoDone: (Go) -> Void
    let onToggleRoutineDone: (Routine, APIDate) -> Void

    @State private var expanded: Bool = false

    private var sprintColor: Color { GoalPalette.color(forHex: row.sprint.color) }
    private var elapsedPct: Int { Int((row.progress * 100).rounded()) }
    private var itemsPct:   Int { total > 0 ? Int((Double(done) / Double(total) * 100).rounded()) : 0 }

    private var paceDays: Int {
        guard row.daysTotal > 0 else { return 0 }
        return Int((Double(itemsPct - elapsedPct) / 100 * Double(row.daysTotal)).rounded())
    }
    private var paceLabel: String {
        if row.daysRemaining == 0 { return "Closed" }
        if paceDays >= 1   { return "↗ \(paceDays)d ahead of pace" }
        if paceDays <= -1  { return "↘ \(abs(paceDays))d behind pace" }
        return "On pace"
    }
    private var status: String {
        if row.daysRemaining == 0 { return "Closed" }
        if paceDays >= -1 { return "On track" }
        if paceDays <= -3 { return "At risk" }
        return "Closing soon"
    }
    private var statusColors: (bg: Color, fg: Color) {
        switch status {
        case "Closed":      return (Theme.Color.moss.opacity(0.16),  Theme.Color.moss)
        case "On track":    return (Theme.Color.indigo.opacity(0.10), Theme.Color.indigo)
        case "At risk":     return (Theme.Color.rust.opacity(0.10),   Theme.Color.rust)
        default:            return (Theme.Color.cream,                Theme.Color.ink4)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Accent strip (sd-accent)
            Rectangle()
                .fill(sprintColor)
                .frame(height: 4)
                .padding(.horizontal, -18).padding(.top, -18)
                .padding(.bottom, 8)

            HStack(alignment: .center, spacing: 14) {
                disc
                sideInfo
            }

            footer
                .padding(.top, 12)

            toggleButton
                .padding(.top, 12)

            if expanded { expandedContent }
        }
        .padding(18)
        .padding(.top, 0)        // accent eats the top padding
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
    }

    // MARK: - Disc with two concentric rings

    private var disc: some View {
        ZStack {
            // Outer ring background + fill (time)
            ringView(radius: 46,
                     fill: sprintColor,
                     fillFraction: Double(elapsedPct) / 100)
            // Inner ring background + fill (items, ochre)
            ringView(radius: 34,
                     fill: Theme.Color.ochre,
                     fillFraction: Double(itemsPct) / 100)

            VStack(spacing: 4) {
                Text("\(row.daysRemaining)")
                    .font(.system(size: 34, weight: .medium, design: .serif))
                    .tracking(-1.4)
                    .foregroundStyle(Theme.Color.ink)
                    .monospacedDigit()
                Text("DAYS LEFT")
                    .font(.system(size: 9, design: .monospaced))
                    .tracking(1.3)
                    .foregroundStyle(Theme.Color.ink4)
            }
        }
        .frame(width: 130, height: 130)
    }

    @ViewBuilder
    private func ringView(radius: CGFloat, fill: Color, fillFraction: Double) -> some View {
        ZStack {
            Circle()
                .stroke(Theme.Color.cream, lineWidth: 6)
                .frame(width: radius * 2, height: radius * 2)
            Circle()
                .trim(from: 0, to: max(0, min(1, fillFraction)))
                .stroke(fill, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: radius * 2, height: radius * 2)
        }
    }

    // MARK: - Side info

    private var sideInfo: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("SPRINT")
                .font(.system(size: 9, design: .monospaced))
                .tracking(1.3)
                .foregroundStyle(Theme.Color.ink5)
                .padding(.bottom, 4)
            Text(row.sprint.title)
                .font(.system(size: 22, weight: .medium, design: .serif))
                .tracking(-0.55)
                .foregroundStyle(Theme.Color.ink)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 4)
            Text(periodLabel)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Theme.Color.ink4)
                .padding(.bottom, 12)
            legendRow(swatch: sprintColor,
                      label: "Time",
                      value: "\(elapsedPct)%",
                      em: "\(row.daysElapsed)/\(row.daysTotal)d")
                .padding(.bottom, 7)
            legendRow(swatch: Theme.Color.ochre,
                      label: "Done",
                      value: "\(itemsPct)%",
                      em: "\(done)/\(total)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var periodLabel: String {
        // Web shows "MMM d - MMM d" (e.g. "May 5 - May 25"), not raw ISO.
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return "\(f.string(from: row.sprint.startDate.date())) — \(f.string(from: row.sprint.endDate.date()))"
    }

    private func legendRow(swatch: Color, label: String, value: String, em: String) -> some View {
        HStack(spacing: 9) {
            Circle().fill(swatch).frame(width: 10, height: 10)
            HStack {
                Text(label.uppercased())
                    .font(.system(size: 10.5, weight: .medium))
                    .tracking(0.95)
                    .foregroundStyle(Theme.Color.ink5)
                Spacer()
                HStack(spacing: 4) {
                    Text(value).foregroundStyle(Theme.Color.ink)
                    Text(em).foregroundStyle(Theme.Color.ink4).font(.system(size: 11, design: .monospaced))
                }
                .font(.system(size: 12, design: .monospaced))
            }
        }
    }

    // MARK: - Footer (status + pace)

    private var footer: some View {
        HStack {
            Text(status)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(statusColors.fg)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(Capsule().fill(statusColors.bg))
            Spacer()
            Text(paceLabel)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.ink)
        }
        .padding(.top, 12)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
        }
    }

    // MARK: - Toggle / expand

    @ViewBuilder
    private var toggleButton: some View {
        if total == 0 {
            // Solid indigo CTA when sprint has no items yet.
            Button(action: onAddItems) {
                HStack(spacing: 6) {
                    Image(systemName: "plus").font(.system(size: 14, weight: .regular))
                    Text("Add items").font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(Theme.Color.indigo)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Color.indigo.opacity(0.10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(Theme.Color.indigo, lineWidth: 1)
                        )
                )
            }
            .buttonStyle(.plain)
        } else {
            Button { expanded.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14))
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                        .animation(.easeOut(duration: 0.14), value: expanded)
                    Text(expanded
                         ? "Hide \(total) item\(total == 1 ? "" : "s")"
                         : "Show \(total) item\(total == 1 ? "" : "s")")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(Theme.Color.ink3)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                        .foregroundStyle(Theme.Color.hairlineStrong)
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Expanded items list

    @ViewBuilder
    private var expandedContent: some View {
        if tree.isEmpty {
            Text("Loading items…")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.ink4)
                .frame(maxWidth: .infinity)
                .padding(14)
                .padding(.top, 12)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                        .foregroundStyle(Theme.Color.hairlineStrong)
                )
        } else {
            VStack(spacing: 6) {
                ForEach(tree) { node in
                    SprintNodeView(
                        node: node,
                        onToggleGoDone: onToggleGoDone,
                        onToggleRoutineDone: onToggleRoutineDone
                    )
                }
                Button(action: onAddItems) {
                    HStack(spacing: 6) {
                        Image(systemName: "plus").font(.system(size: 13, weight: .semibold))
                        Text("Add item").font(.system(size: 12.5, weight: .medium))
                    }
                    .foregroundStyle(Theme.Color.indigo)
                    .frame(maxWidth: .infinity).frame(height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.Color.indigo.opacity(0.10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Theme.Color.indigo, lineWidth: 1)
                            )
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 12)
        }
    }
}
