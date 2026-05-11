import SwiftUI

// User-selectable theme preference. Persists through `@AppStorage` (UserDefaults
// under `JARV_THEME`) so views just bind to it via `@AppStorage("JARV_THEME")
// var theme: ThemePreference = .system` and SwiftUI re-renders on change.
//
// The enum's `colorScheme` resolves to a SwiftUI `ColorScheme?` — `nil` means
// "follow the system", which is the default. Applied at the root via
// `.preferredColorScheme(theme.colorScheme)`.

enum ThemePreference: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    /// Display label for the Profile row and the picker dialog.
    var label: String {
        switch self {
        case .system: return "System"
        case .light:  return "Light"
        case .dark:   return "Dark"
        }
    }

    /// SwiftUI color scheme override, or `nil` to follow OS.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    static let appStorageKey = "JARV_THEME"
}
