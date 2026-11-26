@file:OptIn(PublicPreviewAPI::class)

package com.mnemocard.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.mnemocard.app.R
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.PublicPreviewAPI
import com.mnemocard.app.Deck
import com.mnemocard.app.DeckPrompt
import com.mnemocard.app.HybridAI
import com.mnemocard.app.HybridResponse
import kotlinx.coroutines.launch

private val CARD_COUNTS = listOf(3, 5, 8, 12)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenerateDeckScreen(onClose: () -> Unit, onSave: (Deck) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val configured = remember { HybridAI.isConfigured(context) }

    var topic by remember { mutableStateOf("") }
    var cardCount by remember { mutableIntStateOf(5) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<Pair<Deck, HybridResponse>?>(null) }
    var status by remember { mutableStateOf<OnDeviceModelStatus?>(null) }
    var downloadMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(configured) { if (configured) status = HybridAI.onDeviceStatus(context) }

    fun generate() {
        busy = true
        error = null
        scope.launch {
            try {
                val response = HybridAI.generate(
                    context,
                    DeckPrompt.generate(topic, cardCount),
                    DeckPrompt.INSTRUCTIONS,
                )
                result = DeckPrompt.parse(response.text, topic) to response
            } catch (e: Exception) {
                error = e.message ?: "Generation failed."
            } finally {
                busy = false
            }
        }
    }

    fun download() {
        scope.launch {
            runCatching {
                HybridAI.downloadOnDeviceModel().collect { update ->
                    downloadMessage = when (update) {
                        is DownloadStatus.DownloadStarted -> "Downloading Gemini Nano…"
                        is DownloadStatus.DownloadInProgress ->
                            "Downloaded ${update.totalBytesDownloaded / 1_000_000} MB…"
                        is DownloadStatus.DownloadCompleted -> "Gemini Nano is ready."
                        is DownloadStatus.DownloadFailed -> "Download failed. Try again later."
                        else -> downloadMessage
                    }
                }
            }.onFailure { downloadMessage = "Download failed: ${it.message}" }
            status = HybridAI.onDeviceStatus(context)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New deck") },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(painterResource(R.drawable.ic_arrow_back), contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { result?.let { onSave(it.first) } }, enabled = result != null) {
                        Text("Save")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = topic,
                onValueChange = { topic = it },
                label = { Text("Topic or study notes") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CARD_COUNTS.forEach { count ->
                    FilterChip(
                        selected = cardCount == count,
                        onClick = { cardCount = count },
                        label = { Text("$count cards") },
                    )
                }
            }
            Button(
                onClick = ::generate,
                enabled = configured && !busy && topic.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Generate")
                }
            }

            Text(
                text = statusText(configured, status),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (status == OnDeviceModelStatus.DOWNLOADABLE) {
                OutlinedButton(onClick = ::download) { Text("Download Gemini Nano") }
            }
            downloadMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            result?.let { (deck, response) ->
                Text(deck.title, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${response.runtimeLabel} · ${response.latencyMs} ms",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                deck.cards.forEach { card ->
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Text(card.term, fontWeight = FontWeight.SemiBold)
                        Text(card.definition)
                        if (card.mnemonic.isNotEmpty()) {
                            Text(
                                card.mnemonic,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun statusText(configured: Boolean, status: OnDeviceModelStatus?): String = when {
    !configured -> "AI features need Firebase. Add app/google-services.json and rebuild."
    status == OnDeviceModelStatus.AVAILABLE -> "Runs on-device with Gemini Nano."
    status == OnDeviceModelStatus.DOWNLOADING -> "Gemini Nano is downloading. Using the cloud until it's ready."
    status == OnDeviceModelStatus.DOWNLOADABLE -> "Gemini Nano can be downloaded. Using the cloud until then."
    status == null -> "Checking for Gemini Nano…"
    else -> "Gemini Nano isn't available on this device. Using Gemini in the cloud."
}
