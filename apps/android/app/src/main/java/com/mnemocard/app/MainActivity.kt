package com.mnemocard.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.mnemocard.app.ui.DeckListScreen
import com.mnemocard.app.ui.DeckScreen
import com.mnemocard.app.ui.GenerateDeckScreen
import com.mnemocard.app.ui.MnemoCardTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MnemoCardTheme { MnemoCardApp() } }
    }
}

@Composable
private fun MnemoCardApp() {
    val context = LocalContext.current
    LaunchedEffect(Unit) { RemoteSettings.load(context) }

    val decks by DeckStore.decks.collectAsState()
    var generating by rememberSaveable { mutableStateOf(false) }
    var openDeckId by rememberSaveable { mutableStateOf<String?>(null) }
    val openDeck = decks.firstOrNull { it.id == openDeckId }

    when {
        generating -> {
            BackHandler { generating = false }
            GenerateDeckScreen(
                onClose = { generating = false },
                onSave = {
                    DeckStore.add(it)
                    generating = false
                },
            )
        }
        openDeck != null -> {
            BackHandler { openDeckId = null }
            DeckScreen(deck = openDeck, onBack = { openDeckId = null })
        }
        else -> DeckListScreen(
            decks = decks,
            onOpen = { openDeckId = it.id },
            onDelete = { DeckStore.delete(it.id) },
            onGenerate = { generating = true },
        )
    }
}
