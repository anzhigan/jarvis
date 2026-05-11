import Foundation

// Date-only fields (YYYY-MM-DD) come back from the backend as strings, not
// full timestamps. Wrapping them in a dedicated type makes the API contract
// obvious in callsites and keeps the calendar-day semantics clear (no time-
// zone surprises like "off-by-one near midnight in London").
struct APIDate: Codable, Hashable, Comparable, Sendable {
    let year: Int
    let month: Int
    let day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year; self.month = month; self.day = day
    }

    init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.year = c.year ?? 1970
        self.month = c.month ?? 1
        self.day = c.day ?? 1
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        let parts = raw.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2])
        else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Bad APIDate: \(raw)"
            )
        }
        self.year = y; self.month = m; self.day = d
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(string)
    }

    var string: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// Materialise into a `Date` at local midnight.
    func date(in tz: TimeZone = .current, calendar: Calendar = .current) -> Date {
        var c = DateComponents()
        c.year = year; c.month = month; c.day = day
        c.timeZone = tz
        return calendar.date(from: c) ?? Date()
    }

    static func today(in tz: TimeZone = .current) -> APIDate {
        APIDate(Date())
    }

    static func < (lhs: APIDate, rhs: APIDate) -> Bool {
        if lhs.year  != rhs.year  { return lhs.year  < rhs.year  }
        if lhs.month != rhs.month { return lhs.month < rhs.month }
        return lhs.day < rhs.day
    }
}
