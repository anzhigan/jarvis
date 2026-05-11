import SwiftUI

// 5-tab bottom shell, ordered to match the web mobile shell exactly:
// Notes → Routines → Goals → Sprints → Analysis.

struct MobileShell: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var repos: Repositories

    @State private var selection: Tab = MobileShell.initialTab()

    enum Tab: Hashable { case notes, routines, goals, sprints, analysis }

    private static func initialTab() -> Tab {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "JARV_INITIAL_TAB") {
        case "goals":    return .goals
        case "routines": return .routines
        case "sprints":  return .sprints
        case "analysis": return .analysis
        default:         return .notes
        }
        #else
        return .notes
        #endif
    }

    var body: some View {
        TabView(selection: Binding(
            get: { selection },
            set: { newValue in
                if newValue != selection { Haptics.selection() }
                selection = newValue
            }
        )) {
            // Icons chosen to match the lucide-react glyphs used in the web
            // mobile shell (BookOpen / Repeat / Target / Zap / BarChart3).
            NotesTabRoot(repos: repos)
                .tabItem { Label("Notes", systemImage: "book") }
                .tag(Tab.notes)

            RoutinesTabRoot(repos: repos)
                .tabItem { Label("Routines", systemImage: "arrow.2.squarepath") }
                .tag(Tab.routines)

            GoalsTabRoot(repos: repos)
                .tabItem { Label("Goals", systemImage: "scope") }
                .tag(Tab.goals)

            SprintsTabRoot(repos: repos)
                .tabItem { Label("Sprints", systemImage: "bolt") }
                .tag(Tab.sprints)

            AnalysisTabRoot(repos: repos)
                .tabItem { Label("Analysis", systemImage: "chart.bar") }
                .tag(Tab.analysis)
        }
        .tint(Theme.Color.indigo)
    }
}
