import Foundation

// Auth DTOs — match `backend/app/schemas/auth.py` field-for-field.
// Codable conformance is direct; snake_case→camelCase mapping is handled
// by APIClient's JSONDecoder configured with .convertFromSnakeCase.

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct RegisterRequest: Encodable {
    let email: String
    let username: String
    let password: String
}

struct RefreshRequest: Encodable {
    let refreshToken: String
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
}

struct UserOut: Decodable, Equatable {
    let id: UUID
    let email: String
    let username: String
    let isActive: Bool
    let avatarUrl: String?
}
