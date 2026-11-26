@file:OptIn(PublicPreviewAPI::class)

package com.mnemocard.app

import android.content.Context
import android.os.SystemClock
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

data class HybridResponse(
    val text: String,
    val source: InferenceSource?,
    val runtimeLabel: String,
    val latencyMs: Long,
)

class FirebaseNotConfiguredException :
    Exception("AI features need Firebase. Add app/google-services.json and rebuild.")

/**
 * Runs prompts through Firebase AI Logic in PREFER_ON_DEVICE mode: Gemini Nano through
 * ML Kit / AICore when the device supports it, otherwise Gemini in the cloud.
 */
object HybridAI {
    const val DEFAULT_CLOUD_MODEL = "gemini-3-flash-preview"

    /** Overridden by Remote Config (`android_cloud_model`). */
    @Volatile var cloudModelName = DEFAULT_CLOUD_MODEL

    fun isConfigured(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    private fun model(modelName: String = cloudModelName): GenerativeModel =
        Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = modelName,
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE),
        )

    suspend fun onDeviceStatus(context: Context): OnDeviceModelStatus {
        if (!isConfigured(context)) return OnDeviceModelStatus.UNAVAILABLE
        return runCatching { model().onDeviceExtension?.checkStatus() }.getOrNull()
            ?: OnDeviceModelStatus.UNAVAILABLE
    }

    /** The on-device model isn't downloaded automatically. */
    fun downloadOnDeviceModel(): Flow<DownloadStatus> = model().onDeviceExtension?.download() ?: emptyFlow()

    suspend fun generate(context: Context, prompt: String, instructions: String): HybridResponse {
        if (!isConfigured(context)) throw FirebaseNotConfiguredException()
        val modelName = cloudModelName
        val model = model(modelName)
        val start = SystemClock.elapsedRealtime()
        // Instructions go in the prompt so the on-device and cloud paths get the same input.
        val response = model.generateContent("$instructions\n\n$prompt")
        val source = response.inferenceSource
        return HybridResponse(
            text = response.text ?: throw DeckPrompt.ParseException(),
            source = source,
            runtimeLabel = when (source) {
                InferenceSource.ON_DEVICE -> "Gemini Nano (on-device)"
                else -> "Firebase AI Logic ($modelName)"
            },
            latencyMs = SystemClock.elapsedRealtime() - start,
        )
    }
}
