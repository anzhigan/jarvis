import Foundation

// Single read of build-time configuration. APIBaseURL is injected per-config
// via project.yml (Debug → http://localhost:8000/api, Release → jarvnote.ru).
// Reading once at startup catches misconfiguration loudly instead of failing
// silently the first time someone tries to log in.
enum AppConfig {
    static let apiBaseURL: URL = {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
            !raw.isEmpty,
            let url = URL(string: raw)
        else {
            // Fail fast in dev — production builds get an opt-in fallback so a
            // misconfigured archive can still ship.
            #if DEBUG
            fatalError("APIBaseURL missing from Info.plist (check project.yml).")
            #else
            return URL(string: "https://jarvnote.ru/api")!
            #endif
        }
        return url
    }()

    static let userAgent: String = {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
        let build   = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "Jarvnote-iOS/\(version) (build \(build))"
    }()
}
