import SwiftUI

// Slim banner shown above the tab content when `NetworkMonitor.isOnline`
// is false. The repository wrappers transparently fall back to the local
// SwiftData cache, so the app keeps rendering — this strip is just a
// reminder that the data the user sees may be stale and that writes
// won't reach the server right now.

struct OfflineBanner: View {
    @EnvironmentObject private var monitor: NetworkMonitor

    var body: some View {
        if !monitor.isOnline {
            HStack(spacing: 6) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 11, weight: .semibold))
                Text("Offline · showing cached data")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(Theme.Color.paper)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(Theme.Color.rust)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
