package com.mnemocard.app

import java.time.Instant
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

data class Card(
    val id: String = UUID.randomUUID().toString(),
    val term: String,
    val definition: String,
    val mnemonic: String,
)

data class Deck(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val summary: String,
    val cards: List<Card>,
    /** ISO 8601 strings, matching the web app's StudyDeck. */
    val createdAt: String = Instant.now().toString(),
    val updatedAt: String = createdAt,
)

// Local file format.

internal fun Deck.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("summary", summary)
    .put("createdAt", createdAt)
    .put("updatedAt", updatedAt)
    .put(
        "cards",
        JSONArray(cards.map {
            JSONObject()
                .put("id", it.id)
                .put("term", it.term)
                .put("definition", it.definition)
                .put("mnemonic", it.mnemonic)
        }),
    )

internal fun JSONObject.toDeck(): Deck {
    val cards = getJSONArray("cards")
    val createdAt = optString("createdAt").ifEmpty { Instant.now().toString() }
    return Deck(
        id = getString("id"),
        title = getString("title"),
        summary = optString("summary"),
        createdAt = createdAt,
        updatedAt = optString("updatedAt").ifEmpty { createdAt },
        cards = (0 until cards.length()).map { i ->
            val card = cards.getJSONObject(i)
            Card(
                id = card.getString("id"),
                term = card.getString("term"),
                definition = card.optString("definition"),
                mnemonic = card.optString("mnemonic"),
            )
        },
    )
}

// Firestore format: the StudyDeck shape from packages/core/src/types.ts,
// with cards as [term, definition, mnemonic].

internal fun Deck.toFirestore(): Map<String, Any?> = mapOf(
    "title" to title,
    "description" to summary,
    "icon" to "🧠",
    "color" to "#FF7060",
    "category" to "other",
    "subject" to "general",
    "tags" to listOf("other"),
    "fieldConfigs" to listOf(
        mapOf("label" to "term", "type" to "text", "lang" to "en", "role" to "subject"),
        mapOf("label" to "definition", "type" to "text", "lang" to "en", "role" to "target"),
        mapOf("label" to "mnemonics", "type" to "text", "lang" to "en", "role" to "none"),
    ),
    "cards" to cards.mapIndexed { index, card ->
        mapOf(
            "id" to card.id,
            "deckId" to id,
            "content" to listOf(card.term, card.definition, card.mnemonic),
            "orderIndex" to index,
            "mnemonic" to null,
            "createdAt" to createdAt,
            "updatedAt" to updatedAt,
        )
    },
    "isOfficial" to false,
    "inMyDecks" to true,
    "createdAt" to createdAt,
    "updatedAt" to updatedAt,
)

internal fun firestoreToDeck(id: String, data: Map<String, Any?>): Deck? {
    val title = data["title"] as? String ?: return null
    val rawCards = data["cards"] as? List<*> ?: return null
    val createdAt = data["createdAt"] as? String ?: Instant.now().toString()
    return Deck(
        id = id,
        title = title,
        summary = data["description"] as? String ?: "",
        createdAt = createdAt,
        updatedAt = data["updatedAt"] as? String ?: createdAt,
        cards = rawCards.mapNotNull { raw ->
            val card = raw as? Map<*, *> ?: return@mapNotNull null
            val content = (card["content"] as? List<*>)?.map { it as? String ?: "" }.orEmpty()
            val term = content.firstOrNull()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            Card(
                id = card["id"] as? String ?: UUID.randomUUID().toString(),
                term = term,
                definition = content.getOrElse(1) { "" },
                mnemonic = content.getOrElse(2) { "" },
            )
        },
    )
}
