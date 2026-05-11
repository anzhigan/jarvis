import SwiftUI

// 1-for-1 port of `routine-card` from frontend/src/styles/mobile.css.
// Three rows:
//   1. Header: title (display 16, -0.02em) + meta line "schedule · goal-pill or standalone"
//   2. History: 7-cell strip (oldest→today) + streak/comp stats on the right
//   3. Footer: selected-date label + Check / Skip action buttons
//
// Tapping a cell selects that day; the action buttons operate on the
// currently-selected date (default = today).

struct RoutineCard: View {
    let routine: Routine
    let parent: Goal?
    let todayKey: APIDate
    let onCheck: (APIDate) -> Void
    let onSkip:  (APIDate) -> Void
    let onTapEdit: () -> Void
    let onTapDelete: () -> Void

    @State private var selectedKey: APIDate

    init(
        routine: Routine,
        parent: Goal?,
        todayKey: APIDate,
        onCheck: @escaping (APIDate) -> Void,
        onSkip: @escaping (APIDate) -> Void,
        onTapEdit: @escaping () -> Void,
        onTapDelete: @escaping () -> Void
    ) {
        self.routine = routine
        self.parent = parent
        self.todayKey = todayKey
        self.onCheck = onCheck
        self.onSkip = onSkip
        self.onTapEdit = onTapEdit
        self.onTapDelete = onTapDelete
        _selectedKey = State(initialValue: todayKey)
    }

    private var entryByDate: [APIDate: RoutineEntry] {
        Dictionary(uniqueKeysWithValues: routine.entries.map { ($0.date, $0) })
    }

    /// Last 7 days, oldest → today.
    private var days: [(key: APIDate, state: RoutineHelpers.CellState, isToday: Bool)] {
        var out: [(APIDate, RoutineHelpers.CellState, Bool)] = []
        let cal = Calendar.current
        let now = Date()
        for i in stride(from: 6, through: 0, by: -1) {
            guard let d = cal.date(byAdding: .day, value: -i, to: now) else { continue }
            let key = APIDate(d)
            let state = RoutineHelpers.cellState(of: routine, entry: entryByDate[key])
            out.append((key, state, key == todayKey))
        }
        return out
    }

    private var selectedState: RoutineHelpers.CellState {
        RoutineHelpers.cellState(of: routine, entry: entryByDate[selectedKey])
    }

    private var streak: Int { RoutineHelpers.currentStreak(routine) }
    private var compRate: Int { RoutineHelpers.completionRate(routine, windowDays: 30) }

    var body: some View {
        VStack(spacing: 12) {
            header
            history
            actions
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .swipeActions(edge: .trailing) {
            Button { onTapEdit() } label: { Label("Edit", systemImage: "pencil") }
                .tint(Theme.Color.indigo)
            Button(role: .destructive, action: onTapDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        // CSS .rc-name: font-display 16/500, letter-spacing -0.02em.
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(routine.title)
                    .font(.system(size: 16, weight: .medium, design: .serif))
                    .tracking(-0.32)
                    .foregroundStyle(Theme.Color.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                metaLine
            }
            Spacer()
        }
    }

    private var metaLine: some View {
        HStack(spacing: 5) {
            Text(RoutineHelpers.scheduleLabel(routine))
                .foregroundStyle(Theme.Color.ink4)
            Text("·").foregroundStyle(Theme.Color.ink5)
            if let goal = parent {
                let c = GoalPalette.color(forHex: goal.color)
                HStack(spacing: 3) {
                    Circle().fill(c).frame(width: 5, height: 5)
                    Text(goal.title).foregroundStyle(c).fontWeight(.medium)
                }
            } else {
                Text("standalone")
                    .foregroundStyle(Theme.Color.ink5)
                    .italic()
            }
        }
        .font(.system(size: 11, weight: .regular))
    }

    // MARK: - History

    private var history: some View {
        HStack(spacing: 12) {
            cellsRow
            statsBlock
        }
    }

    private var cellsRow: some View {
        HStack(spacing: 2) {
            ForEach(days, id: \.key) { day in
                Button {
                    selectedKey = day.key
                } label: {
                    cellShape(state: day.state, isToday: day.isToday, isSelected: day.key == selectedKey)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 32)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(day.key.string) — \(label(for: day.state))")
            }
        }
    }

    @ViewBuilder
    private func cellShape(state: RoutineHelpers.CellState, isToday: Bool, isSelected: Bool) -> some View {
        ZStack {
            switch state {
            case .done:
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Theme.Color.moss)
            case .partial:
                // Top half moss, bottom half cream — mirrors the web 50/50 gradient.
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(LinearGradient(
                        stops: [
                            .init(color: Theme.Color.moss, location: 0.0),
                            .init(color: Theme.Color.moss, location: 0.5),
                            .init(color: Theme.Color.cream, location: 0.5),
                            .init(color: Theme.Color.cream, location: 1.0),
                        ],
                        startPoint: .top, endPoint: .bottom
                    ))
            case .skipped:
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Theme.Color.rust)
            case .empty:
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Theme.Color.cream)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Theme.Color.hairlineStrong,
                                          style: StrokeStyle(lineWidth: 1, dash: [2.5]))
                    )
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .scaleEffect(isSelected ? 1.08 : 1.0)
        .overlay(
            // Today: 1.5px indigo ring; selected: thicker 2px.
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .strokeBorder(
                    isSelected ? Theme.Color.indigo : (isToday ? Theme.Color.indigo : .clear),
                    lineWidth: isSelected ? 2 : (isToday ? 1.5 : 0)
                )
                .scaleEffect(isSelected ? 1.08 : 1.0)
        )
        .animation(.easeOut(duration: 0.1), value: isSelected)
    }

    private var statsBlock: some View {
        // CSS .rt-streak font-display 17/500 -0.02em; em.italic body 12.
        // .rt-comp font-mono 12/500 ink-2.
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(streak)")
                    .font(.system(size: 17, weight: .medium, design: .serif))
                    .tracking(-0.34)
                    .foregroundStyle(streakColor)
                    .monospacedDigit()
                Text("d")
                    .font(.system(size: 12, design: .serif))
                    .italic()
                    .foregroundStyle(Theme.Color.ink4)
            }
            Text("·").foregroundStyle(Theme.Color.ink5).font(.system(size: 12))
            Text("\(compRate)%")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(compColor)
                .monospacedDigit()
        }
    }

    private var streakColor: Color {
        if streak >= 7 { return Theme.Color.moss }
        if streak == 0 { return Theme.Color.ink5 }
        return Theme.Color.ink
    }
    private var compColor: Color {
        if compRate >= 80 { return Theme.Color.moss }
        if compRate < 50  { return Theme.Color.rust }
        return Theme.Color.ink2
    }

    // MARK: - Actions

    private var actions: some View {
        // CSS .rc-actions: gap 8; inline override on web sets gap 10 + label
        // pinned left via marginRight:auto. CSS .rc-action: flex 1, height 38,
        // border 1.5 hairline-strong, radius 8, color ink-4. Active: bg+border
        // moss/rust, color paper. Icon 16×16 with stroke ~2.5.
        HStack(spacing: 10) {
            Text(selectedLabel)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Theme.Color.ink4)
            Spacer(minLength: 0)
            actionButton(
                systemImage: "checkmark",
                isActive: selectedState == .done,
                activeColor: Theme.Color.moss,
                action: {
                    Haptics.notify(.success)
                    onCheck(selectedKey)
                }
            )
            actionButton(
                systemImage: "xmark",
                isActive: selectedState == .skipped,
                activeColor: Theme.Color.rust,
                action: {
                    Haptics.impact(.medium)
                    onSkip(selectedKey)
                }
            )
        }
    }

    private var selectedLabel: String {
        if selectedKey == todayKey { return "Today" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, d MMM"
        return formatter.string(from: selectedKey.date())
    }

    @ViewBuilder
    private func actionButton(
        systemImage: String,
        isActive: Bool,
        activeColor: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isActive ? Theme.Color.paper : Theme.Color.ink4)
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isActive ? activeColor : .clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(isActive ? activeColor : Theme.Color.hairlineStrong,
                                              lineWidth: 1.5)
                        )
                )
        }
        .buttonStyle(.plain)
    }

    private func label(for state: RoutineHelpers.CellState) -> String {
        switch state {
        case .done:    return "done"
        case .partial: return "partial"
        case .skipped: return "skipped"
        case .empty:   return "empty"
        }
    }
}
