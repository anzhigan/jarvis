import Foundation

// HTTP client built on URLSession + async/await with race-safe 401 auto-refresh.
//
// Refresh strategy: if a request comes back 401 and we have a refresh token,
// the request waits on a single in-flight refresh attempt (serialized via
// `RefreshCoordinator` actor). Any other concurrent request that 401's during
// that window joins the same task instead of triggering its own refresh —
// matches the web-app behaviour and prevents the "five tabs stomp the
// rotation chain" bug we hit on the web side last quarter.
//
// JSON: snake_case keys (Python idiom) auto-mapped to camelCase Swift.
// Dates: ISO-8601 with optional fractional seconds — Python defaults vary.

enum APIError: Error, LocalizedError {
    case http(status: Int, detail: String?)
    case decoding(Error)
    case transport(Error)
    case unauthenticated   // 401 even after refresh, or no refresh available

    var errorDescription: String? {
        switch self {
        case .http(_, let detail):    return detail ?? "Request failed"
        case .decoding:               return "Couldn't read server response"
        case .transport(let err):     return err.localizedDescription
        case .unauthenticated:        return "Session expired"
        }
    }
}

// Re-entrant token store — KeychainStore behind a @MainActor-friendly façade.
// Keeps the access-token visible for sync reads from anywhere; refresh-token
// stays Keychain-only and is fetched on demand.
@MainActor
final class TokenStore: ObservableObject {
    @Published private(set) var accessToken: String?
    @Published private(set) var isAuthenticated: Bool = false

    init() {
        accessToken = KeychainStore.get(.accessToken)
        isAuthenticated = (accessToken != nil)
    }

    func save(_ pair: TokenResponse) {
        try? KeychainStore.set(pair.accessToken,  for: .accessToken)
        try? KeychainStore.set(pair.refreshToken, for: .refreshToken)
        accessToken = pair.accessToken
        isAuthenticated = true
    }

    func clear() {
        KeychainStore.clearAll()
        accessToken = nil
        isAuthenticated = false
    }

    nonisolated func refreshTokenSnapshot() -> String? {
        KeychainStore.get(.refreshToken)
    }

    /// Cross-actor-safe token read. The @Published `accessToken` is for UI;
    /// APIClient pulls from Keychain instead so request building doesn't
    /// have to hop to MainActor. (assumeIsolated traps when off-main, which
    /// is exactly what async send() does after the first await.)
    nonisolated func accessTokenSnapshot() -> String? {
        KeychainStore.get(.accessToken)
    }
}

// Serialises refresh attempts. Multiple concurrent 401s reuse the same Task
// instead of each kicking off a separate POST /auth/refresh.
actor RefreshCoordinator {
    private var inflight: Task<TokenResponse, Error>?

    func refresh(using doRefresh: @Sendable @escaping () async throws -> TokenResponse)
        async throws -> TokenResponse
    {
        if let t = inflight {
            return try await t.value
        }
        let task = Task<TokenResponse, Error> { try await doRefresh() }
        inflight = task
        defer { inflight = nil }
        return try await task.value
    }
}

// Marked `@unchecked Sendable` because all writable state lives behind
// isolation boundaries: TokenStore is @MainActor, RefreshCoordinator is an
// actor, URLSession is Sendable, and `baseURL` is a `let`. Swift 6 strict
// concurrency can't verify this transitively, so we vouch.
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
    private let tokenStore: TokenStore
    private let refreshCoordinator = RefreshCoordinator()

    init(
        session: URLSession = .shared,
        baseURL: URL = AppConfig.apiBaseURL,
        tokenStore: TokenStore? = nil
    ) {
        self.session = session
        self.baseURL = baseURL
        // TokenStore is @MainActor; bouncing through MainActor.assumeIsolated is
        // safe because APIClient is initialised on main thread.
        self.tokenStore = MainActor.assumeIsolated { tokenStore ?? TokenStore() }
    }

    var tokens: TokenStore { tokenStore }

    // MARK: - Public API

    func get<R: Decodable>(_ path: String, authenticated: Bool = true) async throws -> R {
        try await send(path: path, method: "GET", body: Optional<EmptyBody>.none, authenticated: authenticated)
    }

    func post<R: Decodable, B: Encodable>(_ path: String, body: B, authenticated: Bool = true) async throws -> R {
        try await send(path: path, method: "POST", body: body, authenticated: authenticated)
    }

    func patch<R: Decodable, B: Encodable>(_ path: String, body: B, authenticated: Bool = true) async throws -> R {
        try await send(path: path, method: "PATCH", body: body, authenticated: authenticated)
    }

    func delete(_ path: String, authenticated: Bool = true) async throws {
        let _: EmptyResponse = try await send(path: path, method: "DELETE", body: Optional<EmptyBody>.none, authenticated: authenticated)
    }

    // MARK: - Core

    private func send<R: Decodable, B: Encodable>(
        path: String,
        method: String,
        body: B?,
        authenticated: Bool
    ) async throws -> R {
        let request = try makeRequest(path: path, method: method, body: body, authenticated: authenticated)
        let (data, response) = try await perform(request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401, authenticated {
            // 401 — try one refresh, then replay the original request once.
            try await refreshOnce()
            let retried = try makeRequest(path: path, method: method, body: body, authenticated: true)
            let (data2, response2) = try await perform(retried)
            return try decode(data: data2, response: response2)
        }
        return try decode(data: data, response: response)
    }

    private func makeRequest<B: Encodable>(
        path: String,
        method: String,
        body: B?,
        authenticated: Bool
    ) throws -> URLRequest {
        let url = baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(AppConfig.userAgent, forHTTPHeaderField: "User-Agent")
        if authenticated, let token = tokenStore.accessTokenSnapshot() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body, !(body is EmptyBody) {
            req.httpBody = try Self.encoder.encode(body)
        }
        return req
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
    }

    private func decode<R: Decodable>(data: Data, response: URLResponse) throws -> R {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(URLError(.badServerResponse))
        }
        guard (200..<300).contains(http.statusCode) else {
            // FastAPI surfaces validation errors as { "detail": "..." } or
            // { "detail": [{...}] }. Best-effort string extraction.
            let detail: String? = {
                if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let s = obj["detail"] as? String { return s }
                    if let arr = obj["detail"] as? [[String: Any]],
                       let first = arr.first,
                       let msg = first["msg"] as? String { return msg }
                }
                return nil
            }()
            if http.statusCode == 401 {
                throw APIError.unauthenticated
            }
            throw APIError.http(status: http.statusCode, detail: detail)
        }
        if R.self == EmptyResponse.self {
            return EmptyResponse() as! R
        }
        do {
            return try Self.decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    // Refresh the token pair using the stored refresh token. If refresh fails,
    // wipe both tokens — the user will be bounced to the auth gate by the
    // observing TokenStore.
    private func refreshOnce() async throws {
        guard let refreshToken = tokenStore.refreshTokenSnapshot() else {
            await MainActor.run { tokenStore.clear() }
            throw APIError.unauthenticated
        }
        do {
            let pair: TokenResponse = try await refreshCoordinator.refresh { [self] in
                try await self.refreshRequest(refreshToken: refreshToken)
            }
            await MainActor.run { tokenStore.save(pair) }
        } catch {
            await MainActor.run { tokenStore.clear() }
            throw APIError.unauthenticated
        }
    }

    private func refreshRequest(refreshToken: String) async throws -> TokenResponse {
        let body = RefreshRequest(refreshToken: refreshToken)
        var req = URLRequest(url: baseURL.appendingPathComponent("auth/refresh"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(AppConfig.userAgent, forHTTPHeaderField: "User-Agent")
        req.httpBody = try Self.encoder.encode(body)
        let (data, response) = try await perform(req)
        return try decode(data: data, response: response)
    }

    // MARK: - JSON

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        // Backend can emit dates with or without fractional seconds; try both.
        let isoFracs = ISO8601DateFormatter()
        isoFracs.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = isoFracs.date(from: raw) { return date }
            if let date = iso.date(from: raw)      { return date }
            // Plain YYYY-MM-DD (e.g. step.start_date)
            let plain = DateFormatter()
            plain.dateFormat = "yyyy-MM-dd"
            plain.timeZone = TimeZone(identifier: "UTC")
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognised date format: \(raw)"
            )
        }
        return d
    }()
}

// Sentinel types — Swift generics can't quite express "no body" / "no return"
// without a placeholder type.
struct EmptyBody: Encodable {}
struct EmptyResponse: Decodable {}
