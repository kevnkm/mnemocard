package com.mnemocard.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.mnemocard.app.R
import androidx.compose.foundation.clickable
import com.mnemocard.app.Deck

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckListScreen(
    decks: List<Deck>,
    onOpen: (Deck) -> Unit,
    onDelete: (Deck) -> Unit,
    onGenerate: () -> Unit,
) {
    Scaffold(
        topBar = { TopAppBar(title = { Text("MnemoCard") }) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onGenerate,
                icon = { Icon(painterResource(R.drawable.ic_sparkles), contentDescription = null) },
                text = { Text("Generate") },
            )
        },
    ) { padding ->
        if (decks.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(32.dp),
                ) {
                    Text("No decks yet", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Generate a deck from any topic or your study notes.",
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(decks, key = { it.id }) { deck ->
                    ListItem(
                        supportingContent = { Text("${deck.cards.size} cards") },
                        trailingContent = {
                            IconButton(onClick = { onDelete(deck) }) {
                                Icon(painterResource(R.drawable.ic_delete), contentDescription = "Delete ${deck.title}")
                            }
                        },
                        modifier = Modifier.clickable { onOpen(deck) },
                    ) {
                        Text(deck.title)
                    }
                }
            }
        }
    }
}
