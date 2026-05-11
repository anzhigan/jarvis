import Foundation
import Network

// Observable wrapper around `NWPathMonitor`. Publishes `isOnline` so views
// can react (e.g. show an "You're offline" banner) and so repository wrappers
// can decide whether to even attempt a network call.
//
// The monitor runs on its own dispatch queue, then bounces updates onto
// the main actor where SwiftUI expects them. Lifecycle: started in init
// and stopped in deinit, mirroring how the app keeps a single shared
// instance for its whole lifetime.

@MainActor
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnline: Bool = true
    @Published private(set) var connectionType: ConnectionType = .unknown

    enum ConnectionType { case wifi, cellular, wired, other, unknown }

    private let monitor = NWPathMonitor()
    private let queue   = DispatchQueue(label: "ru.jarvnote.network-monitor")

    init() {
        // DEBUG-only escape hatch: launch with -JARV_FORCE_OFFLINE YES to
        // force the banner + cache fallback path without actually killing
        // wifi. Useful for screenshot scripts and QA in Stage 14.
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "JARV_FORCE_OFFLINE") {
            self.isOnline = false
            self.connectionType = .unknown
            return
        }
        #endif
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            let type: ConnectionType = {
                if path.usesInterfaceType(.wifi)     { return .wifi }
                if path.usesInterfaceType(.cellular) { return .cellular }
                if path.usesInterfaceType(.wiredEthernet) { return .wired }
                if path.status == .satisfied         { return .other }
                return .unknown
            }()
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isOnline = online
                self.connectionType = type
            }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}
