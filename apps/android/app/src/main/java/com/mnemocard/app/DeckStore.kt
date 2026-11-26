package com.mnemocard.app

import android.content.Context
import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray

/**
 * Keeps decks in a local JSON file and, when Firebase is configured, mirrors them to
 * Firestore at users/{uid}/decks/{deckId} after signing in anonymously. Merging follows
 * `mergeRemoteDecks` in packages/core/src/deck-sync.ts.
 */
object DeckStore {
    private const val TAG = "DeckStore"
    private lateinit var file: File
    private val _decks = MutableStateFlow<List<Deck>>(emptyList())
    val decks: StateFlow<List<Deck>> = _decks.asStateFlow()

    private var userDecks: CollectionReference? = null
    private var listener: ListenerRegistration? = null
    private var uid: String? = null
    private var serverSynced = false

    fun init(context: Context) {
        file = File(context.filesDir, "decks.json")
        _decks.value = runCatching {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { array.getJSONObject(it).toDeck() }
        }.getOrDefault(emptyList())
        if (FirebaseApp.getApps(context).isNotEmpty()) startCloudSync()
    }

    fun add(deck: Deck) {
        _decks.update { listOf(deck) + it }
        saveLocal()
        upload(deck)
    }

    fun delete(deckId: String) {
        _decks.update { decks -> decks.filterNot { it.id == deckId } }
        saveLocal()
        userDecks?.document(deckId)?.delete()
            ?.addOnFailureListener { Log.w(TAG, "Deleting a deck failed", it) }
    }

    private fun startCloudSync() {
        Firebase.auth.addAuthStateListener { auth ->
            val user = auth.currentUser
            if (user == null) {
                auth.signInAnonymously()
                    .addOnFailureListener { Log.w(TAG, "Anonymous sign-in failed, so decks stay local", it) }
                return@addAuthStateListener
            }
            if (user.uid != uid) listen(user.uid)
        }
    }

    private fun listen(uid: String) {
        this.uid = uid
        listener?.remove()
        serverSynced = false
        val collection = Firebase.firestore.collection("users").document(uid).collection("decks")
        userDecks = collection
        listener = collection.orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
                if (snapshot == null) {
                    Log.w(TAG, "Deck sync stopped", error)
                    return@addSnapshotListener
                }
                val remote = snapshot.documents.mapNotNull { doc ->
                    doc.data?.let { firestoreToDeck(doc.id, it) }
                }
                merge(remote, fromServer = !snapshot.metadata.isFromCache)
            }
    }

    private fun merge(remote: List<Deck>, fromServer: Boolean) {
        val local = _decks.value
        val remoteById = remote.associateBy { it.id }
        var uploads = emptyList<Deck>()
        if (fromServer && !serverSynced) {
            serverSynced = true
            uploads = local.filter { deck ->
                val stored = remoteById[deck.id]
                stored == null || deck.updatedAt > stored.updatedAt
            }
        }
        val keepLocal = uploads.map { it.id }.toSet()
        val localIds = local.map { it.id }.toSet()
        val merged = local.mapNotNull { deck ->
            when {
                deck.id in keepLocal -> deck
                deck.id in remoteById -> remoteById.getValue(deck.id)
                serverSynced -> null
                else -> deck
            }
        }
        _decks.value = remote.filterNot { it.id in localIds } + merged
        saveLocal()
        uploads.forEach(::upload)
    }

    private fun upload(deck: Deck) {
        // Before sign-in finishes, the first server snapshot uploads it instead.
        userDecks?.document(deck.id)?.set(deck.toFirestore())
            ?.addOnFailureListener { Log.w(TAG, "Saving a deck failed", it) }
    }

    private fun saveLocal() {
        runCatching { file.writeText(JSONArray(_decks.value.map { it.toJson() }).toString()) }
            .onFailure { Log.e(TAG, "Failed to save decks", it) }
    }
}
