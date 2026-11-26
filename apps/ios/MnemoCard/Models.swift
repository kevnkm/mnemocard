import Foundation

struct Card: Identifiable, Codable, Hashable {
  var id = UUID().uuidString
  var term: String
  var definition: String
  var mnemonic: String
}

struct Deck: Identifiable, Codable, Hashable {
  var id = UUID().uuidString
  var title: String
  var summary: String
  var cards: [Card]
  /// ISO 8601 strings, matching the web app's StudyDeck.
  var createdAt = Deck.timestamp()
  var updatedAt = Deck.timestamp()

  static func timestamp(_ date: Date = .now) -> String {
    date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true))
  }
}

// MARK: - Firestore

/// Decks are stored in the same shape as `StudyDeck` in packages/core/src/types.ts,
/// with cards as [term, definition, mnemonic].
extension Deck {
  init?(id: String, firestoreData data: [String: Any]) {
    guard let title = data["title"] as? String, let rawCards = data["cards"] as? [[String: Any]]
    else { return nil }
    self.id = id
    self.title = title
    summary = data["description"] as? String ?? ""
    createdAt = data["createdAt"] as? String ?? Deck.timestamp()
    updatedAt = data["updatedAt"] as? String ?? createdAt
    cards = rawCards.compactMap { card in
      let content = card["content"] as? [String] ?? []
      guard let term = content.first, !term.isEmpty else { return nil }
      return Card(
        id: card["id"] as? String ?? UUID().uuidString,
        term: term,
        definition: content.count > 1 ? content[1] : "",
        mnemonic: content.count > 2 ? content[2] : "")
    }
  }

  var firestoreData: [String: Any] {
    [
      "title": title,
      "description": summary,
      "icon": "🧠",
      "color": "#FF7060",
      "category": "other",
      "subject": "general",
      "tags": ["other"],
      "fieldConfigs": [
        ["label": "term", "type": "text", "lang": "en", "role": "subject"],
        ["label": "definition", "type": "text", "lang": "en", "role": "target"],
        ["label": "mnemonics", "type": "text", "lang": "en", "role": "none"],
      ],
      "cards": cards.enumerated().map { index, card in
        [
          "id": card.id,
          "deckId": id,
          "content": [card.term, card.definition, card.mnemonic],
          "orderIndex": index,
          "mnemonic": NSNull(),
          "createdAt": createdAt,
          "updatedAt": updatedAt,
        ] as [String: Any]
      },
      "isOfficial": false,
      "inMyDecks": true,
      "createdAt": createdAt,
      "updatedAt": updatedAt,
    ]
  }
}
