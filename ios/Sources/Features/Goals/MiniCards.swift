import SwiftUI

// Compact representations of Goal / Step / Go / Routine. These are the same
// design we ship inside Goal-card expansions and (in Stage 8) inside Sprint
// disc-card item lists. Strikethrough + ochre tint when `done` is true.
//
// Each card is wrapped by the caller in a `m-mc`-equivalent container —
// these structs render only the body so the wrapper can decide whether to
// show a "kind" tag, expand-toggle, or nested children.

struct MiniGoalCardBody: View {
    let goal: Goal
    var body: some View {
        let pct = goal.progress
        let isDone = goal.isCompleted || goal.status == .done
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Text(goal.title)
                    .font(Theme.Font.uiMedium)
                    .foregroundStyle(Theme.Color.ink)
                    .strikethrough(isDone, color: Theme.Color.ochre)
                    .lineLimit(2)
                Spacer()
                priorityFlag(goal.priority)
            }
            HStack(spacing: 8) {
                progressBar(pct: pct, done: isDone)
                Text("\(pct)%")
                    .font(Theme.Font.monoSmall)
                    .foregroundStyle(Theme.Color.ink)
            }
            if let due = goal.dueDate {
                Text("Due \(due.string)")
                    .font(Theme.Font.uiCaption)
                    .foregroundStyle(Theme.Color.ink5)
            }
        }
    }

    private func priorityFlag(_ p: TaskPriority) -> some View {
        let pal = p.palette
        return Image(systemName: "flag.fill")
            .font(.system(size: 9))
            .foregroundStyle(pal.fg)
            .frame(width: 18, height: 18)
            .background(Circle().fill(pal.bg))
    }

    @ViewBuilder
    private func progressBar(pct: Int, done: Bool) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .fill(Theme.Color.cream)
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .fill(done ? Theme.Color.ochre : Theme.Color.indigo)
                    .frame(width: geo.size.width * Double(pct) / 100)
            }
        }
        .frame(height: 4)
    }
}

struct MiniStepCardBody: View {
    let step: Step
    let palette: Color
    var body: some View {
        let goCount = step.gos.count
        let goDone  = step.gos.filter { $0.isDoneToday }.count
        let isDone  = step.isCompleted

        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(step.title)
                    .font(Theme.Font.uiMedium)
                    .foregroundStyle(Theme.Color.ink)
                    .strikethrough(isDone, color: Theme.Color.ochre)
                    .lineLimit(2)
                Spacer()
                Text("\(step.startDate.string) — \(step.endDate.string)")
                    .font(Theme.Font.monoSmall)
                    .foregroundStyle(Theme.Color.ink4)
            }
            // Constellation: one node per go, highlighted if done.
            if goCount > 0 {
                HStack(spacing: 6) {
                    ForEach(Array(step.gos.enumerated()), id: \.element.id) { idx, go in
                        Circle()
                            .strokeBorder(palette, lineWidth: go.isDoneToday ? 0 : 1.5)
                            .background(Circle().fill(go.isDoneToday ? palette : .clear))
                            .frame(width: 12, height: 12)
                        if idx < step.gos.count - 1 {
                            Rectangle()
                                .fill(Theme.Color.hairlineStrong)
                                .frame(height: 1)
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
                .frame(height: 12)
            }
            HStack {
                Text(goCount > 0 ? "\(goDone)/\(goCount) done" : "No gos")
                    .font(Theme.Font.uiCaption)
                    .foregroundStyle(Theme.Color.ink4)
                Spacer()
            }
        }
    }
}

struct MiniGoCardBody: View {
    let go: Go
    var onLog: (() -> Void)? = nil

    var body: some View {
        let isDone = go.isDoneToday
        VStack(alignment: .leading, spacing: 8) {
            if let label = periodLabel {
                Text(label)
                    .font(Theme.Font.uiCaption)
                    .foregroundStyle(Theme.Color.ink5)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Theme.Color.cream))
            }
            Text(go.title)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)
                .strikethrough(isDone, color: Theme.Color.ochre)
                .lineLimit(2)

            if go.kind == .numeric {
                numericBlock
            } else {
                booleanBlock
            }
        }
    }

    private var periodLabel: String? {
        let s = go.startDate?.string
        let d = go.dueDate?.string
        switch (s, d) {
        case (let a?, let b?): return "\(a) – \(b)"
        case (_, let b?):      return "due \(b)"
        case (let a?, _):      return "from \(a)"
        default: return nil
        }
    }

    private var numericBlock: some View {
        let value = go.entries.first { $0.date == APIDate.today() }?.value ?? 0
        let target = go.targetValue ?? 1
        return HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(stringify(value))
                .font(Theme.Font.displaySmall)
                .foregroundStyle(Theme.Color.ink)
            Text("/")
                .font(Theme.Font.displaySmall)
                .foregroundStyle(Theme.Color.ink5)
            Text(stringify(target))
                .font(Theme.Font.displaySmall)
                .foregroundStyle(Theme.Color.ink)
            if !go.unit.isEmpty {
                Text(go.unit)
                    .font(Theme.Font.uiCaption)
                    .foregroundStyle(Theme.Color.ink4)
            }
        }
    }

    private var booleanBlock: some View {
        Button(action: { onLog?() }) {
            HStack(spacing: 6) {
                ZStack {
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 1.5)
                        .frame(width: 14, height: 14)
                    if go.isDoneToday {
                        Image(systemName: "checkmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(Theme.Color.ochre)
                    }
                }
                Text(go.isDoneToday ? "Done" : "Mark as done")
                    .font(Theme.Font.uiSmall)
                    .foregroundStyle(go.isDoneToday ? Color.white : Theme.Color.ink3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                Capsule().fill(go.isDoneToday ? Theme.Color.ochre : Theme.Color.cream)
            )
        }
        .buttonStyle(.plain)
        .disabled(onLog == nil)
    }

    private func stringify(_ d: Double) -> String {
        let rounded = (d * 10).rounded() / 10
        if rounded == rounded.rounded() {
            return "\(Int(rounded))"
        }
        return String(format: "%.1f", rounded)
    }
}

struct MiniRoutineCardBody: View {
    let routine: Routine
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(routine.title)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)
                .lineLimit(2)
            Text("\(scheduleLabel) · \(streak)d streak")
                .font(Theme.Font.uiCaption)
                .foregroundStyle(Theme.Color.ink4)
            heatmap
        }
    }

    private var scheduleLabel: String {
        switch routine.scheduleType {
        case .daily:         return "DAILY"
        case .weeklyOnDays:  return "WEEKLY"
        case .everyNDays:    return "EVERY \(routine.scheduleNDays)D"
        case .timesPerWeek:
            let p = routine.schedulePeriod == .week ? "WK" : "MO"
            return "\(routine.scheduleCountPerPeriod)× / \(p)"
        }
    }

    private var heatmap: some View {
        // Last 14 days, oldest first. ochre when done, cream otherwise.
        let now = Date()
        let cells: [(date: APIDate, on: Bool)] = (0..<14).reversed().map { offset in
            let d = Calendar.current.date(byAdding: .day, value: -offset, to: now) ?? now
            let key = APIDate(d)
            let on = (routine.entries.first { $0.date == key }?.value ?? 0) > 0
            return (key, on)
        }
        return HStack(spacing: 3) {
            ForEach(cells, id: \.date) { cell in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(cell.on ? Theme.Color.ochre : Theme.Color.cream)
                    .frame(maxWidth: .infinity)
                    .frame(height: 10)
            }
        }
    }

    private var streak: Int {
        let entries = Dictionary(uniqueKeysWithValues: routine.entries.map { ($0.date, $0.value) })
        var n = 0
        var cursor = Date()
        for i in 0..<60 {
            let key = APIDate(cursor)
            if (entries[key] ?? 0) > 0 { n += 1 }
            else if i > 0 { break }
            cursor = Calendar.current.date(byAdding: .day, value: -1, to: cursor) ?? cursor
        }
        return n
    }
}

/// Wrapper that draws the gold-tinted "done" background and the small
/// uppercase "kind" label in the corner — used when mini-cards live inside
/// an expansion section.
struct MiniCardContainer<Content: View>: View {
    let kind: String
    let done: Bool
    @ViewBuilder var content: () -> Content
    var body: some View {
        ZStack(alignment: .topTrailing) {
            content()
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(done
                              ? Theme.Color.ochre.opacity(0.14)
                              : Theme.Color.paper)
                        .stroke(done ? .clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
            Text(kind.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(done ? Theme.Color.ochre : Theme.Color.ink5)
                .padding(.top, 8).padding(.trailing, 10)
        }
    }
}
