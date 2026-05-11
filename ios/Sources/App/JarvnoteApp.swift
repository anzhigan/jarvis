 import SwiftUI

// Entry point. The @main attribute tells the toolchain this struct owns the
// app lifecycle. AuthService and Repositories live at the app level so their
// state persists across view rebuilds; downstream views read them via
// @EnvironmentObject.
@main
struct JarvnoteApp: App {
    @StateObject private var auth = AuthService()
    @StateObject private var repositories = Repositories()
    @StateObject private var network = NetworkMonitor.shared
    @AppStorage(ThemePreference.appStorageKey) private var themeRaw: String = ThemePreference.system.rawValue

    private var theme: ThemePreference {
        ThemePreference(rawValue: themeRaw) ?? .system
    }

    var body: some Scene {
        WindowGroup {
            AuthGate()
                .environmentObject(auth)
                .environmentObject(repositories)
                .environmentObject(network)
                .preferredColorScheme(theme.colorScheme)
        }
    }
}
