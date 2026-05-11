import SwiftUI

// Kanban list — 1-for-1 with the web mobile layout:
//   ┌ status pills row (Active/Backlog/Paused/Done with counts) ┐
//   ├ priority filter row: "PRIORITY" label + High/Medium/Low pills ┤
//   ├ + Goal (m-add-btn dashed) ┤
//   ├ goal cards ─┤
//   └────────────┘

struct KanbanView: View {
    @ObservedObject var vm: GoalsViewModel
    @Binding var statusFilter: TaskStatus?
    @Binding var priorityFilter: Set<TaskPriority>
    let onCreateGoal: () -> Void
    let onEditGoal: (Goal) -> Void

    @State private var tagFilter: Set<UUID> = []

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 12) {
                    statusPills
                    priorityFilterRow
                    if !allTags.isEmpty { tagFilterRow }
                    AddButton(label: "Goal", action: onCreateGoal)
                }
                .padding(.bottom, 4)

                if filtered.isEmpty && !vm.isLoading {
                    VStack(spacing: 6) {
                        Text("No goals here")
                            .font(.system(size: 18, weight: .medium, design: .serif))
                            .foregroundStyle(Theme.Color.ink3)
                        Text("Tap + Goal to start one.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.ink5)
                    }
                    .padding(.top, 40)
                    .frame(maxWidth: .infinity)
                } else {
                    ForEach(filtered) { goal in
                        SwipeRow(
                            onEdit: { onEditGoal(goal) },
                            onDelete: { Task { await vm.deleteGoal(goal.id) } },
                            onTap: nil
                        ) {
                            GoalCard(
                                goal: goal,
                                steps: vm.steps(forGoal: goal.id),
                                standaloneGos: vm.standaloneGos(forGoal: goal.id),
                                onToggleGoDone: { go in Task { await vm.toggleDoneToday(go) } },
                                onTapEdit:   { onEditGoal(goal) },
                                onTapDelete: { Task { await vm.deleteGoal(goal.id) } }
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

    // MARK: - Filters & list

    /// Unique tags across all goals — basis of the Tag filter row.
    /// Sorted by name so the row is stable between renders.
    private var allTags: [Tag] {
        var seen: [UUID: Tag] = [:]
        for g in vm.goals { for t in g.tags { seen[t.id] = t } }
        return seen.values.sorted { $0.name.lowercased() < $1.name.lowercased() }
    }

    private var filtered: [Goal] {
        vm.goals.filter { g in
            if let f = statusFilter, g.status != f { return false }
            if !priorityFilter.isEmpty, !priorityFilter.contains(g.priority) { return false }
            if !tagFilter.isEmpty, !g.tags.contains(where: { tagFilter.contains($0.id) }) { return false }
            return true
        }
    }

    // Empty-state and goal cards are inlined into the List body above so
    // .swipeActions can be applied per-row natively. Old `goalsList` helper
    // (LazyVStack + SwipeRow) was removed when we migrated to List.

    // MARK: - Status pills

    private var statusPills: some View {
        // CSS .status-pills: order Active / Backlog / Paused / Done — no "All"
        // pill. Tapping the active one toggles back to nil (== all).
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach([TaskStatus.active, .backlog, .paused, .done], id: \.self) { s in
                    let count = vm.goals.filter { $0.status == s }.count
                    StatusPill(label: "\(s.displayName) · \(count)",
                               active: statusFilter == s) {
                        statusFilter = (statusFilter == s) ? nil : s
                    }
                }
            }
        }
    }

    // MARK: - Priority filter row
    // "PRIORITY" mono label + 3 pills with priority-coloured flag glyphs.

    private var priorityFilterRow: some View {
        // CSS .filter-row: gap 10. Label font-ui 11/500 ink-5, uppercase,
        // letter-spacing 0.08em (≈ 0.88 tracking at 11pt).
        HStack(spacing: 10) {
            Text("PRIORITY")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.88)
                .foregroundStyle(Theme.Color.ink5)
            ForEach([TaskPriority.high, .medium, .low], id: \.self) { p in
                priorityPill(p)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Tag filter row
    // Mirrors the web .filter-pills-scroll: horizontally scrollable, multi-select.
    // Active tag uses the tag's own colour as bg/fg so the filter is visually
    // anchored to the same colour the tag chips on the cards have.

    private var tagFilterRow: some View {
        HStack(spacing: 10) {
            Text("TAGS")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.88)
                .foregroundStyle(Theme.Color.ink5)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(allTags) { tag in
                        tagPill(tag)
                    }
                }
            }
        }
    }

    private func tagPill(_ tag: Tag) -> some View {
        let active = tagFilter.contains(tag.id)
        let c = GoalPalette.color(forHex: tag.color)
        return Button {
            Haptics.selection()
            if active { tagFilter.remove(tag.id) } else { tagFilter.insert(tag.id) }
        } label: {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 8, height: 8)
                Text(tag.name)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(active ? c : Theme.Color.ink3)
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(
                Capsule().fill(active ? c.opacity(0.10) : Theme.Color.paper)
                    .overlay(Capsule().stroke(active ? c : Theme.Color.hairlineStrong, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    private func priorityPill(_ p: TaskPriority) -> some View {
        let active = priorityFilter.contains(p)
        let pal = p.palette
        return Button {
            if active { priorityFilter.remove(p) } else { priorityFilter.insert(p) }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "flag.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(active ? pal.fg : Theme.Color.ink4)
                Text(p.rawValue.capitalized)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(active ? pal.fg : Theme.Color.ink3)
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(
                Capsule().fill(active ? pal.bg : Theme.Color.paper)
                    .overlay(Capsule().stroke(active ? pal.fg : Theme.Color.hairlineStrong,
                                              lineWidth: active ? 1 : 1))
            )
        }
        .buttonStyle(.plain)
    }
}
