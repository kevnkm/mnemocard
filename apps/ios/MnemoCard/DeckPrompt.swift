import Foundation

/// Mirrors `buildGenerateDeckPrompt` in packages/ai/src/prompts.ts.
enum DeckPrompt {
  static let instructions =
    "You are MnemoCard, an expert learning-science and mnemonic tutor. Reply with a single valid JSON object only: no markdown fences, no commentary."

  static func generate(topic: String, cardCount: Int) -> String {
    """
    Generate a flashcard study deck of exactly \(cardCount) cards in English.
    Each card's "content" has exactly 3 entries, in this order: the term, a concise clear definition, and a one-sentence vivid mnemonic.
    Use vivid, concrete everyday imagery for memory hooks.
    Return ONLY valid JSON matching this exact structure (no markdown fences):
    {
      "title": "Short engaging deck title",
      "description": "One-sentence summary of what the deck teaches",
      "cards": [
        { "content": ["Term", "Definition", "Mnemonic"] }
      ]
    }

    Topic or study notes:
    \(topic.trimmingCharacters(in: .whitespacesAndNewlines))
    """
  }

  private struct Output: Decodable {
    struct GeneratedCard: Decodable { var content: [String] }
    var title: String?
    var description: String?
    var cards: [GeneratedCard]
  }

  struct ParseError: LocalizedError {
    var errorDescription: String? { "The model's reply wasn't a valid deck. Try again." }
  }

  static func parse(_ text: String, topic: String) throws -> Deck {
    guard let start = text.firstIndex(of: "{"), let end = text.lastIndex(of: "}"), start < end,
      let output = try? JSONDecoder().decode(Output.self, from: Data(text[start...end].utf8))
    else { throw ParseError() }

    let cards = output.cards.compactMap { card -> Card? in
      let fields = card.content.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      guard let term = fields.first, !term.isEmpty else { return nil }
      return Card(
        term: term,
        definition: fields.count > 1 ? fields[1] : "",
        mnemonic: fields.count > 2 ? fields[2] : "")
    }
    guard !cards.isEmpty else { throw ParseError() }

    let title = output.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return Deck(
      title: title.isEmpty ? topic : title,
      summary: output.description ?? "",
      cards: cards)
  }
}
