import Foundation
import LocalAuthentication

// Thin wrapper around LAContext for Face ID / Touch ID unlock. The service
// answers two questions the rest of the app needs:
//   1. Is biometry available on this device, and which kind?
//   2. Did the user successfully authenticate (yes / cancel / lockout) ?
//
// Whether biometry is *enabled* for the app is a separate user preference
// stored in UserDefaults — `BiometricSettings.isEnabled`. The two are
// independent: a user who turned the toggle on but later disabled Face ID
// in iOS Settings will still pass through unlocked, since `canEvaluate`
// returns false and we treat that as "no gate required".

enum BiometricKind {
    case faceID, touchID, none

    var label: String {
        switch self {
        case .faceID:  return "Face ID"
        case .touchID: return "Touch ID"
        case .none:    return "Biometrics"
        }
    }
}

enum BiometricResult {
    case success
    case userCancelled
    case unavailable
    case failed(String)
}

enum BiometricService {

    /// Reads the current device capability. Returns `.none` when biometrics
    /// are not enrolled or are temporarily locked out (5 failures in a row).
    static func canEvaluate() -> BiometricKind {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
            return .none
        }
        switch ctx.biometryType {
        case .faceID:  return .faceID
        case .touchID: return .touchID
        default:       return .none
        }
    }

    /// Prompts the user via Face ID / Touch ID. The reason string is shown
    /// in the system sheet so it should explain *why* (e.g. "Unlock Jarvnote").
    static func evaluate(reason: String) async -> BiometricResult {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
            return .unavailable
        }
        return await withCheckedContinuation { cont in
            ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, e in
                if ok { cont.resume(returning: .success); return }
                if let laErr = e as? LAError, laErr.code == .userCancel || laErr.code == .systemCancel || laErr.code == .appCancel {
                    cont.resume(returning: .userCancelled)
                } else {
                    cont.resume(returning: .failed(e?.localizedDescription ?? "Authentication failed"))
                }
            }
        }
    }
}

// User-controlled toggle. Stored in UserDefaults so it persists without
// touching Keychain — it's not a secret, just a preference.
enum BiometricSettings {
    private static let defaultsKey = "JARV_BIOMETRY_ENABLED"

    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: defaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKey) }
    }
}
