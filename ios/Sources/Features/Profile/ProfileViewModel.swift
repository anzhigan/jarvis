import Foundation
import SwiftUI

// Loads the same data that MobileProfileScreen.tsx uses to compute the
// "Entries / Weeks / Routines / Goals" stat row + "Active since {month}"
// tagline. Done here (vs. inline in the View) so the same heavy work isn't
// repeated on every body re-render.

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var goals:    [Goal]    = []
    @Published private(set) var gos:      [Go]      = []
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var isLoading = false
    @Published var error: String? = nil

    private let repos: Repositories
    init(repos: Repositories) { self.repos = repos }

    func load() async {
        isLoading = true; defer { isLoading = false }
        do {
            async let g  = repos.goals.listGoals()
            async let go = repos.gos.listGos()
            async let r  = repos.routines.listRoutines()
            self.goals    = try await g
            self.gos      = try await go
            self.routines = try await r
        } catch let err {
            self.error = (err as NSError).localizedDescription
        }
    }

    struct Stats {
        let entries:  Int
        let weeks:    Int
        let routines: Int
        let goals:    Int
        let firstDate: APIDate?
    }

    var stats: Stats {
        let entryCount =
            gos.reduce(0)      { $0 + $1.entries.count } +
            routines.reduce(0) { $0 + $1.entries.count }

        // Earliest entry across routines + gos. Powers "Active since {month}".
        var firstDate: APIDate? = nil
        for r in routines { for e in r.entries { if firstDate == nil || e.date < firstDate! { firstDate = e.date } } }
        for g in gos      { for e in g.entries { if firstDate == nil || e.date < firstDate! { firstDate = e.date } } }

        var weeks = 0
        if let first = firstDate {
            let secs = Date().timeIntervalSince(first.date())
            weeks = max(0, Int(secs / (7 * 86_400)))
        }
        return Stats(
            entries: entryCount,
            weeks: weeks,
            routines: routines.count,
            goals: goals.count,
            firstDate: firstDate
        )
    }

    var memberSinceLabel: String? {
        guard let first = stats.firstDate else { return nil }
        let f = DateFormatter(); f.dateFormat = "LLL yyyy"
        return f.string(from: first.date())
    }
}
