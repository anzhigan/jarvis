import SwiftUI

// Today's-target card. Boolean: large "Done" / "Mark as done" button.
// Numeric: stepper +/- around current value, progress bar, status pill.

struct TgCard: View {
    let go: Go
    let parent: (text: String, color: Color, isStep: Bool)
    let onLog: (Double) -> Void
    let onTapEdit: () -> Void
    let onTapDelete: () -> Void

    private var todayValue: Double {
        go.entries.first { $0.date == APIDate.today() }?.value ?? 0
    }
    private var target: Double { go.targetValue ?? 1 }
    private var targetMet: Bool {
        go.kind == .numeric
            ? (go.targetValue != nil && todayValue >= go.targetValue!)
            : todayValue > 0
    }
    private var partial: Bool { !targetMet && todayValue > 0 }
    private var pct: Int {
        guard go.kind == .numeric, let t = go.targetValue, t > 0 else {
            return todayValue > 0 ? 100 : 0
        }
        return min(100, Int((todayValue / t * 100).rounded()))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            metaRow
            Text(go.title)
                .font(Theme.Font.displaySmall)
                .foregroundStyle(Theme.Color.ink)
                .strikethrough(targetMet, color: Theme.Color.ochre)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            if go.kind == .numeric {
                numericBlock
                progressRow
            } else {
                booleanBlock
            }
        }
        .padding(14)
        .background(
            ZStack {
                // Opaque paper base so swipe-action layer / scroll bg can't bleed through.
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.Color.paper)
                if targetMet {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Color.ochre.opacity(0.14))
                }
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(targetMet ? Color.clear : Theme.Color.hairlineStrong,
                                  lineWidth: 1)
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

    private var metaRow: some View {
        HStack(spacing: 6) {
            HStack(spacing: 5) {
                if parent.isStep {
                    Image(systemName: "square.stack.3d.up").font(.system(size: 9))
                } else {
                    Circle().fill(parent.color).frame(width: 6, height: 6)
                }
                Text(parent.text).lineLimit(1)
            }
            .font(Theme.Font.uiSmall)
            .foregroundStyle(parent.color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(
                Capsule().fill(parent.color.opacity(0.10))
                    .overlay(Capsule().stroke(parent.color.opacity(0.30), lineWidth: 1))
            )

            if let label = periodLabel {
                Text(label)
                    .font(Theme.Font.monoSmall)
                    .foregroundStyle(Theme.Color.ink4)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(Theme.Color.cream))
            }
        }
    }

    private var periodLabel: String? {
        if let s = go.startDate?.string, let d = go.dueDate?.string { return "\(s) – \(d)" }
        if let d = go.dueDate?.string { return "due \(d)" }
        if let s = go.startDate?.string { return "from \(s)" }
        return nil
    }

    private var numericBlock: some View {
        HStack {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(stringify(todayValue))
                    .font(Theme.Font.displayLarge)
                    .foregroundStyle(Theme.Color.ink)
                Text("/")
                    .font(Theme.Font.displayMedium)
                    .foregroundStyle(Theme.Color.ink5)
                Text(stringify(target))
                    .font(Theme.Font.displayMedium)
                    .foregroundStyle(Theme.Color.ink)
                if !go.unit.isEmpty {
                    Text(go.unit)
                        .font(Theme.Font.uiSmall)
                        .foregroundStyle(Theme.Color.ink4)
                }
            }
            Spacer()
            stepper
        }
    }

    private var stepper: some View {
        HStack(spacing: 8) {
            stepButton(systemImage: "minus") {
                onLog(max(0, todayValue - stepIncrement))
            }
            stepButton(systemImage: "plus") {
                onLog(todayValue + stepIncrement)
            }
        }
    }
    private var stepIncrement: Double {
        // Integer targets get integer steps, fractional ones use 0.1.
        guard let t = go.targetValue else { return 1 }
        return t == t.rounded() ? 1 : 0.1
    }

    private func stepButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 36, height: 36)
                .foregroundStyle(Theme.Color.ink2)
                .background(Circle().fill(Theme.Color.cream))
        }
        .buttonStyle(.plain)
    }

    private var progressRow: some View {
        HStack(spacing: 10) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(Theme.Color.cream)
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(targetMet ? Theme.Color.ochre : Theme.Color.indigo)
                        .frame(width: geo.size.width * Double(pct) / 100)
                }
            }
            .frame(height: 6)
            Text("\(pct)%")
                .font(Theme.Font.monoSmall)
                .foregroundStyle(Theme.Color.ink)
        }
    }

    private var booleanBlock: some View {
        Button {
            onLog(targetMet ? 0 : 1)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                Text(targetMet ? "Done" : "Mark as done")
                    .font(Theme.Font.uiMedium)
            }
            .foregroundStyle(targetMet ? Color.white : Theme.Color.ink3)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(targetMet ? Theme.Color.ochre : Theme.Color.cream)
            )
        }
        .buttonStyle(.plain)
    }

    private func stringify(_ d: Double) -> String {
        let r = (d * 10).rounded() / 10
        return r == r.rounded() ? "\(Int(r))" : String(format: "%.1f", r)
    }
}
