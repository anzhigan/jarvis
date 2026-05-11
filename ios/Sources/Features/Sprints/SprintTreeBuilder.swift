import Foundation

// Reshape a flat `sprint.items[]` list into a hierarchical tree for the disc
// card's expanded items section. 1-for-1 with frontend `buildSprintTree`:
//
//  - Goals always surface at the top level. Their children include the goal's
//    full sub-hierarchy: every step (with its own gos), every standalone go,
//    every linked routine — even the ones that aren't *explicitly* in the
//    sprint, so "Show items" is always meaningful.
//  - Steps live at the top level only when their parent goal is NOT also
//    in the sprint; otherwise they appear nested under the goal.
//  - Gos / routines surface at the top level only if neither parent is in
//    the sprint.

struct SprintTreeNode: Identifiable {
    enum Kind: String { case goal, step, go, routine }

    let key: String
    let kind: Kind
    let title: String
    let done: Bool
    let goal: Goal?
    let step: Step?
    let go: Go?
    let routine: Routine?
    var children: [SprintTreeNode]
    var id: String { key }
}

enum SprintTree {

    static func build(
        sprint: Sprint,
        goalsById: [UUID: Goal],
        stepsById: [UUID: Step],
        gosById: [UUID: Go],
        routinesById: [UUID: Routine],
        today: APIDate = .today()
    ) -> (tree: [SprintTreeNode], total: Int, done: Int) {
        // Index sprint membership by entity id for O(1) lookups.
        var goalIds = Set<UUID>()
        var stepIds = Set<UUID>()
        var goIds   = Set<UUID>()
        var routineIds = Set<UUID>()
        for item in sprint.items {
            switch item.itemType {
            case .goal:    if let id = item.goalId    { goalIds.insert(id) }
            case .step:    if let id = item.stepId    { stepIds.insert(id) }
            case .go:      if let id = item.goId      { goIds.insert(id) }
            case .routine: if let id = item.routineId { routineIds.insert(id) }
            }
        }

        // Node factories.
        func makeGoalNode(_ g: Goal) -> SprintTreeNode {
            SprintTreeNode(
                key: "goal-\(g.id)", kind: .goal, title: g.title,
                done: g.isCompleted || g.status == .done,
                goal: g, step: nil, go: nil, routine: nil, children: []
            )
        }
        func makeStepNode(_ s: Step) -> SprintTreeNode {
            SprintTreeNode(
                key: "step-\(s.id)", kind: .step, title: s.title,
                done: s.isCompleted,
                goal: nil, step: s, go: nil, routine: nil, children: []
            )
        }
        func makeGoNode(_ g: Go) -> SprintTreeNode {
            SprintTreeNode(
                key: "go-\(g.id)", kind: .go, title: g.title,
                done: g.isDoneToday,
                goal: nil, step: nil, go: g, routine: nil, children: []
            )
        }
        func makeRoutineNode(_ r: Routine) -> SprintTreeNode {
            let v = r.entries.first(where: { $0.date == today })?.value ?? 0
            return SprintTreeNode(
                key: "routine-\(r.id)", kind: .routine, title: r.title,
                done: v > 0,
                goal: nil, step: nil, go: nil, routine: r, children: []
            )
        }

        // Children helpers — populate full sub-hierarchy regardless of explicit
        // sprint membership (matches web behaviour of "Show items").
        func childrenOfGoal(_ g: Goal) -> [SprintTreeNode] {
            var out: [SprintTreeNode] = []
            for step in g.steps {
                var node = makeStepNode(step)
                node.children = step.gos.map { makeGoNode($0) }
                out.append(node)
            }
            for go in g.gos where go.stepId == nil {
                out.append(makeGoNode(go))
            }
            for r in routinesById.values where r.goalId == g.id && r.stepId == nil {
                out.append(makeRoutineNode(r))
            }
            return out
        }
        func childrenOfStep(_ s: Step) -> [SprintTreeNode] {
            var out: [SprintTreeNode] = []
            for go in s.gos { out.append(makeGoNode(go)) }
            for r in routinesById.values where r.stepId == s.id {
                out.append(makeRoutineNode(r))
            }
            return out
        }

        // Walk sprint.items in order, push only top-level entries.
        var tree: [SprintTreeNode] = []
        var seen = Set<String>()
        for item in sprint.items {
            switch item.itemType {
            case .goal:
                guard let id = item.goalId, let g = goalsById[id] else { continue }
                let key = "goal-\(g.id)"
                if seen.contains(key) { continue }
                seen.insert(key)
                var node = makeGoalNode(g)
                node.children = childrenOfGoal(g)
                tree.append(node)
            case .step:
                guard let id = item.stepId, let s = stepsById[id] else { continue }
                if goalIds.contains(s.taskId) { continue }      // already nested
                let key = "step-\(s.id)"
                if seen.contains(key) { continue }
                seen.insert(key)
                var node = makeStepNode(s)
                node.children = childrenOfStep(s)
                tree.append(node)
            case .go:
                guard let id = item.goId, let g = gosById[id] else { continue }
                if let s = g.stepId, stepIds.contains(s) { continue }
                if let t = g.taskId, goalIds.contains(t) { continue }
                let key = "go-\(g.id)"
                if seen.contains(key) { continue }
                seen.insert(key)
                tree.append(makeGoNode(g))
            case .routine:
                guard let id = item.routineId, let r = routinesById[id] else { continue }
                if let s = r.stepId, stepIds.contains(s) { continue }
                if let t = r.goalId, goalIds.contains(t) { continue }
                let key = "routine-\(r.id)"
                if seen.contains(key) { continue }
                seen.insert(key)
                tree.append(makeRoutineNode(r))
            }
        }

        // Aggregate count over the full tree (top-level + every nested child).
        var total = 0, done = 0
        func visit(_ n: SprintTreeNode) {
            total += 1
            if n.done { done += 1 }
            for c in n.children { visit(c) }
        }
        for n in tree { visit(n) }
        return (tree, total, done)
    }
}
