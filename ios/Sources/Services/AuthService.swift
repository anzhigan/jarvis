import Foundation
import SwiftUI

// Observable wrapper around APIClient's TokenStore + the /auth endpoints.
// Views observe this object via @EnvironmentObject and re-render when
// `currentUser` changes (login, logout, profile update).

@MainActor
final class AuthService: ObservableObject {
    @Published private(set) var currentUser: UserOut?
    @Published private(set) var isBootstrapping: Bool = true

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    var isAuthenticated: Bool { currentUser != nil }

    // MARK: - Bootstrap on app start

    // Try to load the user with whatever token is in Keychain. If 401 even
    // after refresh attempt, APIClient clears tokens and we end up signed-out.
    func bootstrap() async {
        defer { isBootstrapping = false }

        #if DEBUG
        // Dev convenience: when launched with `-JARV_AUTOLOGIN_EMAIL x -JARV_AUTOLOGIN_PASSWORD y`,
        // log in automatically before the gate decides where to route. Lets
        // CLI-driven smoke tests skip the keyboard dance. Removed before any
        // release build — guarded by #if DEBUG and an explicit launch arg.
        if let email = UserDefaults.standard.string(forKey: "JARV_AUTOLOGIN_EMAIL"),
           let password = UserDefaults.standard.string(forKey: "JARV_AUTOLOGIN_PASSWORD"),
           !api.tokens.isAuthenticated
        {
            try? await login(email: email, password: password)
            return
        }
        #endif

        guard api.tokens.isAuthenticated else { return }
        do {
            let user: UserOut = try await api.get("auth/me")
            self.currentUser = user
        } catch {
            // Stay signed-out; APIClient already wiped tokens on 401.
            self.currentUser = nil
        }
    }

    // MARK: - Login / Register / Logout

    func login(email: String, password: String) async throws {
        let body = LoginRequest(email: email, password: password)
        let pair: TokenResponse = try await api.post("auth/login", body: body, authenticated: false)
        api.tokens.save(pair)
        let user: UserOut = try await api.get("auth/me")
        self.currentUser = user
    }

    func register(email: String, username: String, password: String) async throws {
        let body = RegisterRequest(email: email, username: username, password: password)
        // Register returns UserOut, no tokens — we still need to log in afterwards.
        let _: UserOut = try await api.post("auth/register", body: body, authenticated: false)
        try await login(email: email, password: password)
    }

    func logout() {
        api.tokens.clear()
        currentUser = nil
    }
}
