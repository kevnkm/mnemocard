package com.mnemocard.app

import org.json.JSONObject

/** Mirrors `buildGenerateDeckPrompt` in packages/ai/src/prompts.ts. */
object DeckPrompt {
    const val INSTRUCTIONS =
        "You are MnemoCard, an expert learning-science and mnemonic tutor. " +
            "Reply with a single valid JSON object only: no markdown fences, no commentary."

    fun generate(topic: String, cardCount: Int): String = """
        Generate a flashcard study deck of exactly $cardCount cards in English.
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
        ${topic.trim()}
    """.trimIndent()

    class ParseException : Exception("The model's reply wasn't a valid deck. Try again.")

    fun parse(text: String, topic: String): Deck {
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        if (start < 0 || end <= start) throw ParseException()
        val json = runCatching { JSONObject(text.substring(start, end + 1)) }
            .getOrElse { throw ParseException() }
        val rawCards = json.optJSONArray("cards") ?: throw ParseException()

        val cards = (0 until rawCards.length()).mapNotNull { i ->
            val content = rawCards.optJSONObject(i)?.optJSONArray("content") ?: return@mapNotNull null
            val fields = (0 until content.length()).map { content.optString(it).trim() }
            val term = fields.firstOrNull()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            Card(
                term = term,
                definition = fields.getOrElse(1) { "" },
                mnemonic = fields.getOrElse(2) { "" },
            )
        }
        if (cards.isEmpty()) throw ParseException()

        return Deck(
            title = json.optString("title").trim().ifEmpty { topic },
            summary = json.optString("description").trim(),
            cards = cards,
        )
    }
}
