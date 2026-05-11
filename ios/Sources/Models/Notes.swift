import Foundation

// Notes domain — mirrors backend/app/schemas/notes.py.
// All field names match snake_case JSON; APIClient's JSONDecoder is configured
// with .convertFromSnakeCase, so Swift sees camelCase but the wire stays Pythonic.

struct Tag: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let name: String
    let color: String
    let createdAt: Date
}

struct NoteImage: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let url: String
    let filename: String
    let sizeBytes: Int
}

struct Note: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let name: String
    let content: String
    let order: Int
    let pinned: Bool
    let wayId: UUID?
    let topicId: UUID?
    let topicInlineId: UUID?
    let tags: [Tag]
    let createdAt: Date
    let updatedAt: Date
}

struct Topic: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let wayId: UUID
    let name: String
    let order: Int
    let notes: [Note]
    let inlineNote: Note?
    let createdAt: Date
    let updatedAt: Date
}

struct Way: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let name: String
    let order: Int
    let topics: [Topic]
    let notes: [Note]
    let createdAt: Date
    let updatedAt: Date
}
