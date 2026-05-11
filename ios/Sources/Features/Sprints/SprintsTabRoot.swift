import SwiftUI

// 1-for-1 port of MobileSprintsScreen.tsx. MobileTopBar + "+ Sprint" CTA +
// three sections (Active / Upcoming / Past) of disc cards.

struct SprintsTabRoot: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var repos: Repositories
    @StateObject private var vm: SprintsViewModel

    @State private var sheet: ActiveSheet? = nil
    @State private var deleting: Sprint? = nil
    @State private var addingTo: Sprint? = nil

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: SprintsViewModel(repos: repos))
    }

    enum ActiveSheet: Identifiable {
        case create
        case edit(Sprint)
        var id: String {
            switch self { case .create: return "c"; case .edit(let s): return "e-\(s.id)" }
        }
    }

    private var avatarInitial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }

    private var sections: (active: [SprintWithProgress], upcoming: [SprintWithProgress], past: [SprintWithProgress]) {
        let decorated = vm.sprints.map { $0.decorate() }
        let active   = decorated.filter { $0.bucket == .active   }.sorted { $0.sprint.endDate < $1.sprint.endDate }
        let upcoming = decorated.filter { $0.bucket == .upcoming }.sorted { $0.sprint.startDate < $1.sprint.startDate }
        let past     = decorated.filter { $0.bucket == .past     }.sorted { $1.sprint.endDate < $0.sprint.endDate }
        return (active, upcoming, Array(past.prefix(5)))
    }

    private var subtitleText: String {
        let s = sections
        return "\(s.active.count) active · \(s.upcoming.count) in queue"
    }

    var body: some View {
        VStack(spacing: 0) {
            MobileTopBar(title: "Sprints", subtitle: subtitleText, avatarInitial: avatarInitial)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    AddButton(label: "Sprint") { sheet = .create }
                        .padding(.bottom, 4)

                    sectionRows(title: "Active",   rows: sections.active)
                    sectionRows(title: "Upcoming", rows: sections.upcoming)
                    sectionRows(title: "Past",     rows: sections.past)

                    let total = sections.active.count + sections.upcoming.count + sections.past.count
                    if total == 0 && !vm.isLoading {
                        Text("No sprints yet. Tap + to start one.")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Color.ink4)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .background(Theme.Color.paper.ignoresSafeArea())
            .refreshable { await vm.load() }
        }
        .task { if vm.sprints.isEmpty { await vm.load() } }
        .sheet(item: $sheet) { active in
            switch active {
            case .create:    SprintForm(vm: vm, editing: nil)
            case .edit(let s): SprintForm(vm: vm, editing: s)
            }
        }
        .sheet(item: $addingTo) { sprint in
            AddItemsToSprintSheet(vm: vm, sprint: sprint)
        }
        .alert("Delete \"\(deleting?.title ?? "")\"?",
               isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
               presenting: deleting) { s in
            Button("Delete", role: .destructive) {
                Task { await vm.deleteSprint(s.id); deleting = nil }
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: { _ in
            Text("Linked goals/steps/gos/routines will not be deleted.")
        }
        .alert("Something went wrong",
               isPresented: Binding(get: { vm.error != nil }, set: { if !$0 { vm.error = nil } }),
               presenting: vm.error) { _ in
            Button("OK") { vm.error = nil }
        } message: { msg in Text(msg) }
    }

    /// Emits header + rows for one sprint bucket (Active / Upcoming / Past).
    /// Empty buckets emit nothing.
    @ViewBuilder
    private func sectionRows(title: String, rows: [SprintWithProgress]) -> some View {
        if !rows.isEmpty {
            SectionBar(title: title, count: rows.count)
            ForEach(rows) { row in
                let tree = SprintTree.build(
                    sprint: row.sprint,
                    goalsById: vm.goalsById,
                    stepsById: vm.stepsById,
                    gosById: vm.gosById,
                    routinesById: vm.routinesById
                )
                SwipeRow(
                    onEdit: { sheet = .edit(row.sprint) },
                    onDelete: { deleting = row.sprint },
                    onTap: nil
                ) {
                    SprintDiscCard(
                        row: row,
                        tree: tree.tree,
                        total: tree.total,
                        done: tree.done,
                        onAddItems: { addingTo = row.sprint },
                        onToggleGoDone: { _ in },
                        onToggleRoutineDone: { _, _ in }
                    )
                }
            }
        }
    }
}

