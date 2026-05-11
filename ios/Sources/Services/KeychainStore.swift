import Foundation
import Security

// Thin wrapper around Keychain Services for storing string-valued secrets.
// Access policy is `kSecAttrAccessibleAfterFirstUnlock` so background refresh
// (when the app wakes for, say, a push notification) can read the refresh
// token even if the device is currently locked. Tokens never leave Secure
// Enclave's protection envelope; biometric-gated access is layered on top
// in Stage 10 via LocalAuthentication.

enum KeychainStore {
    enum Key: String {
        case accessToken  = "access_token"
        case refreshToken = "refresh_token"
    }

    enum KeychainError: Error {
        case unhandled(OSStatus)
    }

    private static let service = "ru.jarvnote.app.tokens"

    static func set(_ value: String, for key: Key) throws {
        let data = Data(value.utf8)
        var query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]

        // Try update first; fall back to add. Two-step is the standard pattern —
        // SecItemAdd fails with errSecDuplicateItem if a row already exists.
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if updateStatus == errSecSuccess { return }
        if updateStatus != errSecItemNotFound {
            throw KeychainError.unhandled(updateStatus)
        }

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        if addStatus != errSecSuccess {
            throw KeychainError.unhandled(addStatus)
        }
    }

    static func get(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: Key) {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll() {
        for key in [Key.accessToken, .refreshToken] {
            remove(key)
        }
    }
}
