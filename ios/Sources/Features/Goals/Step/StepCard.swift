import SwiftUI

// Constellation StepCard. Title + period header, dot-and-line constellation
// of gos (done filled, current ringed, pending hollow), footer with status
// pill + count.

struct StepCard: View {
    let step: Step
    let parent: Goal
    let onToggleGoDone: (Go) -> Void
    let onTapEdit: () -> Void
    let onTapDelete: () -> Void

    private var accent: Color { GoalPalette.color(forHex: parent.color) }

    private var status: Status {
        let today = APIDate.today()
        if step.isCompleted { return .done }
        if step.startDate > today { return .upcoming }
        if step.endDate < today  { return .atRisk }
        return .onTrack
    }
    enum Status { case onTrack, upcoming, atRisk, done
        var label: String {
            switch self {
            case .onTrack:  return "On track"
            case .upcoming: return "Upcoming"
            case .atRisk:   return "At risk"
            case .done:     return "Complete"
            }
        }
        var color: (bg: Color, fg: Color) {
            switch self {
            case .onTrack:  return (Theme.Color.indigo.opacity(0.10), Theme.Color.indigo)
            case .upcoming: return (Theme.Color.cream,                Theme.Color.ink4)
            case .atRisk:   return (Theme.Color.rust.opacity(0.10),   Theme.Color.rust)
            case .done:     return (Theme.Color.moss.opacity(0.16),   Theme.Color.moss)
            }
        }
    }

    private var goDone: Int  { step.gos.filter { $0.isDoneToday }.count }
    private var goCount: Int { step.gos.count }
    private var daysLeft: Int? {
        guard !step.isCompleted else { return nil }
        let today = APIDate.today()
        guard step.endDate >= today else { return nil }
        return Calendar.current.dateComponents([.day], from: Date(), to: step.endDate.date()).day
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if goCount > 0 { constellation } else { emptyMessage }
            footer
        }
        .padding(14)
        .padding(.leading, 4)             // room for the parent-color rail
        .background(
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.Color.paper)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                Rectangle()
                    .fill(accent)
                    .frame(width: 4)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        )
        .swipeActions(edge: .trailing) {
            Button { onTapEdit() } label: { Label("Edit", systemImage: "pencil") }
                .tint(Theme.Color.indigo)
            Button(role: .destructive, action: onTapDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            Text(step.title)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)
                .strikethrough(step.isCompleted, color: Theme.Color.ochre)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(step.startDate.string) — \(step.endDate.string)")
                .font(Theme.Font.monoSmall)
                .foregroundStyle(Theme.Color.ink4)
        }
    }

    private var constellation: some View {
        let currentIdx = step.gos.firstIndex { !$0.isDoneToday }
        let showLabels = goCount <= 4
        return HStack(alignment: .top, spacing: 4) {
            ForEach(Array(step.gos.enumerated()), id: \.element.id) { idx, go in
                Button(action: { onToggleGoDone(go) }) {
                    VStack(spacing: 6) {
                        node(go: go, isCurrent: idx == currentIdx)
                        if showLabels {
                            Text(firstWord(go.title))
                                .font(.system(size: 10.5, weight: .medium))
                                .tracking(0.3)
                                .foregroundStyle(go.isDoneToday ? Theme.Color.ink : Theme.Color.ink4)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                if idx < step.gos.count - 1 {
                    // Dotted connector
                    HStack(spacing: 2) {
                        ForEach(0..<5, id: \.self) { _ in
                            Circle()
                                .fill(Theme.Color.hairlineStrong)
                                .frame(width: 2, height: 2)
                        }
                    }
                    .padding(.top, 13)
                }
            }
        }
    }

    @ViewBuilder
    private func node(go: Go, isCurrent: Bool) -> some View {
        ZStack {
            if go.isDoneToday {
                Circle().fill(accent).frame(width: 28, height: 28)
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.white)
            } else if isCurrent {
                Circle().strokeBorder(accent, lineWidth: 2)
                    .background(Circle().fill(accent.opacity(0.18)))
                    .frame(width: 28, height: 28)
            } else {
                Circle().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 2)
                    .frame(width: 28, height: 28)
            }
        }
    }

    private var emptyMessage: some View {
        Text("No gos yet — swipe to edit and link some.")
            .font(Theme.Font.uiCaption)
            .foregroundStyle(Theme.Color.ink5)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
    }

    private var footer: some View {
        HStack {
            Text(status.label)
                .font(Theme.Font.uiCaption)
                .foregroundStyle(status.color.fg)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(Capsule().fill(status.color.bg))
            Spacer()
            Text(footerMeta)
                .font(Theme.Font.monoSmall)
                .foregroundStyle(Theme.Color.ink4)
        }
    }

    private var footerMeta: String {
        var parts = ["\(goDone)/\(goCount) done"]
        if let d = daysLeft, d > 0 { parts.append("\(d)d left") }
        return parts.joined(separator: " · ")
    }

    private func firstWord(_ s: String) -> String {
        let w = s.trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init) ?? ""
        return w.count > 8 ? w.prefix(7) + "…" : w
    }
}
