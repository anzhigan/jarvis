import SwiftUI

// 1-for-1 port of MobileRoutinesScreen.tsx. Three blocks stacked:
//   1. rt-summary (3 cells: Done today / Best streak / 30d overall)
//   2. status-pills + "+ Routine" button
//   3. List of RoutineCards filtered by the selected pill.

struct RoutinesTabRoot: View {
    @EnvironmentObject private var auth: AuthService
    @StateObject private var vm: RoutinesViewModel
    @State private var filter: Filter = .all
    @State private var sheet: ActiveSheet? = nil
    @State private var deleting: Routine? = nil

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: RoutinesViewModel(repos: repos))
    }

    private var avatarInitial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }
    private var subtitleText: String {
        let s = summary
        if vm.routines.isEmpty { return "No routines yet" }
        return "\(s.doneToday) of \(s.scheduledToday) done today"
    }

    enum Filter: Hashable { case all, today, slipping, paused
        var title: String {
            switch self {
            case .all: return "All"; case .today: return "Due today"
            case .slipping: return "Slipping"; case .paused: return "On hold"
            }
        }
    }
    enum ActiveSheet: Identifiable {
        case create
        case edit(Routine)
        var id: String { switch self { case .create: return "c"; case .edit(let r): return "e-\(r.id)" } }
    }

    private let today = Date()
    private var todayKey: APIDate { APIDate(today) }

    private var counts: (total: Int, dueToday: Int, slipping: Int, paused: Int) {
        var t = 0, due = 0, slip = 0, paused = 0
        for r in vm.routines {
            t += 1
            if r.isPaused { paused += 1; continue }
            if RoutineHelpers.isScheduledOn(r, date: today) { due += 1 }
            if RoutineHelpers.completionRate(r, windowDays: 30) < 50 { slip += 1 }
        }
        return (t, due, slip, paused)
    }

    private var summary: (doneToday: Int, scheduledToday: Int, bestEver: Int, overall: Int) {
        var done = 0, sched = 0, best = 0, sum = 0, denom = 0
        for r in vm.routines {
            switch RoutineHelpers.todayState(r, today: today) {
            case .pending, .done: sched += 1
            default: break
            }
            if RoutineHelpers.todayState(r, today: today) == .done { done += 1 }
            best = max(best, RoutineHelpers.bestStreak(r))
            sum += RoutineHelpers.completionRate(r, windowDays: 30)
            denom += 1
        }
        let overall = denom == 0 ? 0 : Int((Double(sum) / Double(denom)).rounded())
        return (done, sched, best, overall)
    }

    private var filtered: [Routine] {
        vm.routines.filter { r in
            switch filter {
            case .all:      return true
            case .today:    return !r.isPaused && RoutineHelpers.isScheduledOn(r, date: today)
            case .slipping: return !r.isPaused && RoutineHelpers.completionRate(r, windowDays: 30) < 50
            case .paused:   return r.isPaused
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            MobileTopBar(title: "Routines", subtitle: subtitleText, avatarInitial: avatarInitial)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    VStack(spacing: 12) {
                        summaryGrid
                        statusPills
                        addButton
                    }
                    .padding(.bottom, 4)

                    if filtered.isEmpty && !vm.isLoading {
                        emptyState
                    } else {
                        ForEach(filtered) { r in
                            SwipeRow(
                                onEdit: { sheet = .edit(r) },
                                onDelete: { deleting = r },
                                onTap: nil
                            ) {
                                RoutineCard(
                                    routine: r,
                                    parent: vm.goal(r.goalId),
                                    todayKey: todayKey,
                                    onCheck: { date in Task { await vm.toggleDone(r, date: date) } },
                                    onSkip:  { date in Task { await vm.toggleSkip(r, date: date) } },
                                    onTapEdit:   { sheet = .edit(r) },
                                    onTapDelete: { deleting = r }
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .background(Theme.Color.paper.ignoresSafeArea())
            .refreshable { await vm.load() }
        }
        .task { if vm.routines.isEmpty { await vm.load() } }
        .sheet(item: $sheet) { active in
            switch active {
            case .create:    RoutineForm(vm: vm, editing: nil)
            case .edit(let r): RoutineForm(vm: vm, editing: r)
            }
        }
        .alert("Delete \"\(deleting?.title ?? "")\"?",
               isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
               presenting: deleting) { r in
            Button("Delete", role: .destructive) {
                Task { await vm.delete(r.id); deleting = nil }
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: { _ in
            Text("All tracked entries will be removed.")
        }
        .alert("Something went wrong",
               isPresented: Binding(get: { vm.error != nil }, set: { if !$0 { vm.error = nil } }),
               presenting: vm.error) { _ in
            Button("OK") { vm.error = nil }
        } message: { msg in Text(msg) }
    }

    // MARK: - Summary grid

    private var summaryGrid: some View {
        let s = summary
        return HStack(spacing: 0) {
            sumCell(num: "\(s.doneToday)", em: "/\(s.scheduledToday)", label: "Done today")
            divider
            sumCell(num: "\(s.bestEver)",   em: "d",                     label: "Best streak")
            divider
            sumCell(num: "\(s.overall)",    em: "%",                     label: "30d overall")
        }
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    private var divider: some View {
        Rectangle().fill(Theme.Color.hairline).frame(width: 1).padding(.vertical, 8)
    }

    private func sumCell(num: String, em: String, label: String) -> some View {
        VStack(spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(num)
                    .font(.system(size: 22, design: .serif))
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.ink)
                Text(em)
                    .font(.system(size: 13, design: .serif))
                    .italic()
                    .foregroundStyle(Theme.Color.ink4)
            }
            Text(label.uppercased())
                .font(.system(size: 9.5, weight: .medium))
                .tracking(0.95)
                .foregroundStyle(Theme.Color.ink4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    // MARK: - Status pills

    private var statusPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                pill(.all,      "All · \(counts.total)")
                pill(.today,    "Due today · \(counts.dueToday)")
                pill(.slipping, "Slipping · \(counts.slipping)")
                pill(.paused,   "On hold · \(counts.paused)")
            }
        }
    }

    private func pill(_ f: Filter, _ label: String) -> some View {
        Button { filter = f } label: {
            Text(label)
                .font(Theme.Font.uiSmall)
                .foregroundStyle(filter == f ? .white : Theme.Color.ink3)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Capsule().fill(filter == f ? Theme.Color.indigo : Theme.Color.cream))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Add button (m-add-btn equivalent)

    private var addButton: some View {
        Button { sheet = .create } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 14, weight: .semibold))
                Text("Routine").font(Theme.Font.uiMedium)
            }
            .foregroundStyle(Theme.Color.ink3)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        Text(filter == .all
             ? "No routines yet. Tap + to create one."
             : "Nothing in this bucket.")
            .font(Theme.Font.bodyMedium)
            .foregroundStyle(Theme.Color.ink4)
            .multilineTextAlignment(.center)
            .padding(.top, 60)
            .frame(maxWidth: .infinity)
    }
}
