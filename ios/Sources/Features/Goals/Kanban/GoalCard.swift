import SwiftUI

// Full-size Goal card for the Kanban view. Shows: title + priority flag,
// description, progress bar with %, tags, two-up stats grid (Today / Deadline),
// and an expand toggle that reveals child steps + standalone gos as
// nested mini-cards.

struct GoalCard: View {
    let goal: Goal
    let steps: [Step]
    let standaloneGos: [Go]
    let onToggleGoDone: (Go) -> Void
    let onTapEdit: () -> Void
    let onTapDelete: () -> Void

    @State private var expanded = false
    private var accent: Color { GoalPalette.color(forHex: goal.color) }
    private var pct: Int { goal.progress }
    private var isDone: Bool { goal.isCompleted || goal.status == .done }

    private var totalChildren: Int { steps.count + standaloneGos.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if !goal.description.isEmpty {
                Text(goal.description)
                    .font(Theme.Font.bodySmall)
                    .foregroundStyle(Theme.Color.ink4)
                    .lineLimit(3)
            }
            progressRow
            if !goal.tags.isEmpty { tagRow }
            statsGrid

            if totalChildren > 0 {
                expandToggle
                if expanded { expandedContent }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .swipeActions(edge: .trailing) {
            Button { onTapEdit() } label: { Label("Edit", systemImage: "pencil") }
                .tint(Theme.Color.indigo)
            Button(role: .destructive, action: onTapDelete) { Label("Delete", systemImage: "trash") }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(goal.title)
                .font(Theme.Font.displaySmall)
                .foregroundStyle(Theme.Color.ink)
                .strikethrough(isDone, color: Theme.Color.ochre)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            priorityFlag
        }
    }

    private var priorityFlag: some View {
        let p = goal.priority.palette
        return Image(systemName: "flag.fill")
            .font(.system(size: 11))
            .foregroundStyle(p.fg)
            .frame(width: 22, height: 22)
            .background(Circle().fill(p.bg))
    }

    private var progressRow: some View {
        // CSS: bar height 6, bg cream, fill INDIGO (not goal accent), pct
        // font-mono 13/500 ink. Margin 12 0 4 in surrounding flex.
        HStack(alignment: .center, spacing: 10) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(Theme.Color.cream)
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(Theme.Color.indigo)
                        .frame(width: geo.size.width * Double(pct) / 100)
                }
            }
            .frame(height: 6)
            Text("\(pct)%")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.ink)
        }
    }

    private var tagRow: some View {
        // CSS inline: padding 5 12, radius 999, font-ui 13/500, bg color@14%,
        // inset boxShadow 0 0 0 1px color@40%, dot 8×8 radius 2, gap 6.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(goal.tags) { tag in
                    let c = GoalPalette.color(forHex: tag.color)
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(c)
                            .frame(width: 8, height: 8)
                        Text(tag.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(c)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(
                        Capsule().fill(c.opacity(0.08))
                            .overlay(Capsule().stroke(c.opacity(0.25), lineWidth: 1))
                    )
                }
            }
        }
    }

    private var statsGrid: some View {
        HStack(spacing: 8) {
            statBlock(title: "Today",    value: todayLabel,  tone: todayTone)
            statBlock(title: "Deadline", value: deadlineMain, tone: nil)
        }
    }

    private var todayLabel: String {
        let total = goal.gos.count
        guard total > 0 else { return "—" }
        let done = goal.gos.filter { $0.isDoneToday }.count
        return "\(done)/\(total)"
    }
    private var todayTone: Color? {
        let total = goal.gos.count
        guard total > 0 else { return nil }
        let done = goal.gos.filter { $0.isDoneToday }.count
        if done == total { return Theme.Color.moss }
        if done == 0     { return Theme.Color.ochre }
        return Theme.Color.indigo
    }
    private var deadlineMain: String {
        guard let due = goal.dueDate else { return "No deadline" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: due.date())
    }
    private var deadlineSub: String? {
        guard let due = goal.dueDate else { return nil }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: due.date()).day ?? 0
        if days == 0 { return "today" }
        if days < 0  { return "\(-days)d ago" }
        return "\(days)d"
    }

    @ViewBuilder
    private func statBlock(title: String, value: String, tone: Color?) -> some View {
        // CSS .gc-stat: bg cream, radius 8, padding 9 12, min-height 56, gap 3.
        // .gc-stat-lab: font-ui 11/500 ink-5 uppercase letter-spacing 0.08em.
        // .gc-stat-val: font-display 16/500 ink baseline gap 6.
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(0.88)
                .foregroundStyle(Theme.Color.ink5)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(value)
                    .font(.system(size: 16, weight: .medium, design: .serif))
                    .foregroundStyle(tone ?? Theme.Color.ink)
                if title.lowercased() == "deadline", let sub = deadlineSub {
                    Text(sub)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Color.ink4)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(tone == nil ? Theme.Color.cream : tone!.opacity(0.12))
        )
    }

    private var expandToggle: some View {
        // CSS inline: height 44, dashed hairline-strong border, radius 10,
        // font-ui 14/500 ink-3, gap 6, chevron 14.
        Button { expanded.toggle() } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .rotationEffect(.degrees(expanded ? 90 : 0))
                Text(expanded
                     ? "Hide \(totalChildren) item\(totalChildren == 1 ? "" : "s")"
                     : "Show \(totalChildren) item\(totalChildren == 1 ? "" : "s")")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(Theme.Color.ink3)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
        }
        .buttonStyle(.plain)
    }

    private var expandedContent: some View {
        VStack(spacing: 8) {
            ForEach(steps) { step in
                MiniCardContainer(kind: "Step", done: step.isCompleted) {
                    MiniStepCardBody(step: step, palette: accent)
                }
            }
            ForEach(standaloneGos) { go in
                MiniCardContainer(kind: "Go", done: go.isDoneToday) {
                    MiniGoCardBody(go: go, onLog: { onToggleGoDone(go) })
                }
            }
        }
        .padding(.top, 4)
    }
}
