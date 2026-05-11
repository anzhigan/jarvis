import Foundation
import SwiftData

// Single-row-per-collection JSON cache backed by SwiftData. Each `Kind`
// (ways, goals, gos, routines, sprints, tags) maps to one `CachedCollection`
// row holding the last successful API response as raw JSON.
//
// The repository wrappers in `Repositories.swift` call `wrap(kind:fetch:)`
// to get a "network if possible, cache otherwise" semantic without each
// callsite having to repeat the try/catch dance:
//
//   list() -> try fetch from API -> on success persist + return fresh
//                                -> on network failure read cache and
//                                   return that, otherwise rethrow.
//
// We intentionally store the encoded JSON as `Data` rather than mapping
// every domain model into a SwiftData `@Model` — most models contain nested
// arrays (Way → Topics → Notes, Goal → Steps → Gos) and replaying them
// through a normalized SwiftData schema would be a large port for little
// gain. The JSON blob round-trips through the same `JSONDecoder` the API
// client already uses.

@Model
final class CachedCollection {
    @Attribute(.unique) var kind: String
    var payload: Data
    var updatedAt: Date

    init(kind: String, payload: Data, updatedAt: Date = Date()) {
        self.kind = kind
        self.payload = payload
        self.updatedAt = updatedAt
    }
}

actor OfflineCache {
    static let shared = OfflineCache()

    enum Kind: String, CaseIterable {
        case ways, goals, gos, routines, sprints, tags
    }

    private let container: ModelContainer?

    init() {
        do {
            let schema = Schema([CachedCollection.self])
            let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            self.container = try ModelContainer(for: schema, configurations: [config])
        } catch {
            // Cache is best-effort: if the store can't open we still serve
            // network-only and the app keeps working.
            self.container = nil
        }
    }

    /// Stores the encodable value under `kind`. Best-effort — failures are
    /// swallowed because cache misses are recoverable but caller-side error
    /// paths shouldn't be blocked on a write.
    func save<T: Encodable>(_ value: T, kind: Kind) {
        guard let container else { return }
        do {
            let data = try APIClient.encoder.encode(value)
            let context = ModelContext(container)
            let kindStr = kind.rawValue
            let pred = #Predicate<CachedCollection> { $0.kind == kindStr }
            let fetched = try context.fetch(FetchDescriptor<CachedCollection>(predicate: pred))
            if let existing = fetched.first {
                existing.payload = data
                existing.updatedAt = Date()
            } else {
                context.insert(CachedCollection(kind: kindStr, payload: data))
            }
            try context.save()
        } catch {
            // Silent: see comment above.
        }
    }

    /// Decodes the latest snapshot for `kind`. Returns `nil` if there's
    /// nothing cached or the payload no longer matches the model shape.
    func load<T: Decodable>(_ kind: Kind, as type: T.Type) -> T? {
        guard let container else { return nil }
        let context = ModelContext(container)
        let kindStr = kind.rawValue
        let pred = #Predicate<CachedCollection> { $0.kind == kindStr }
        guard let row = (try? context.fetch(FetchDescriptor<CachedCollection>(predicate: pred)))?.first else {
            return nil
        }
        return try? APIClient.decoder.decode(T.self, from: row.payload)
    }

    /// Run `fetch`, persist on success, fall back to cache on network failure.
    /// Bookkeeping that would otherwise litter every list*() in Repositories.
    func wrap<T: Codable>(_ kind: Kind, fetch: () async throws -> T) async throws -> T {
        do {
            let fresh = try await fetch()
            save(fresh, kind: kind)
            return fresh
        } catch {
            if isNetworkError(error), let cached: T = load(kind, as: T.self) {
                return cached
            }
            throw error
        }
    }

    private func isNetworkError(_ error: Error) -> Bool {
        let urlError = error as? URLError
        let code = urlError?.code
        switch code {
        case .notConnectedToInternet, .networkConnectionLost,
             .timedOut, .cannotFindHost, .cannotConnectToHost,
             .dnsLookupFailed, .internationalRoamingOff,
             .dataNotAllowed:
            return true
        default:
            return false
        }
    }
}
