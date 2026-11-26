package com.mnemocard.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.mnemocard.app.R
import com.mnemocard.app.Card as Flashcard
import com.mnemocard.app.Deck

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckScreen(deck: Deck, onBack: () -> Unit) {
    val pager = rememberPagerState { deck.cards.size }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(deck.title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(painterResource(R.drawable.ic_arrow_back), contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            HorizontalPager(state = pager, modifier = Modifier.weight(1f)) { page ->
                FlashcardView(deck.cards[page])
            }
            Text(
                "${pager.currentPage + 1} / ${deck.cards.size}",
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FlashcardView(card: Flashcard) {
    var flipped by remember(card.id) { mutableStateOf(false) }
    Card(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .clickable(role = Role.Button, onClickLabel = if (flipped) "Show term" else "Show definition") {
                flipped = !flipped
            },
    ) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            AnimatedContent(targetState = flipped, label = "flip") { showBack ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (showBack) {
                        Text(card.definition, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                        if (card.mnemonic.isNotEmpty()) {
                            Text(
                                card.mnemonic,
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        Text(
                            card.term,
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}
