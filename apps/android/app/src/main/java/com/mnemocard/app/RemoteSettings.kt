package com.mnemocard.app

import android.content.Context
import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.tasks.await

/** Reads the cloud model from Remote Config. Falls back to cached values, then to the default. */
object RemoteSettings {
    private const val CLOUD_MODEL_KEY = "android_cloud_model"

    suspend fun load(context: Context) {
        if (!HybridAI.isConfigured(context)) return
        val remoteConfig = Firebase.remoteConfig
        if (BuildConfig.DEBUG) {
            remoteConfig.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 0 })
        }
        remoteConfig.setDefaultsAsync(mapOf(CLOUD_MODEL_KEY to HybridAI.DEFAULT_CLOUD_MODEL))
        runCatching { remoteConfig.fetchAndActivate().await() }
            .onFailure { Log.w("RemoteConfig", "Fetch failed, using cached or default values", it) }
        remoteConfig.getString(CLOUD_MODEL_KEY).trim()
            .takeIf { it.isNotEmpty() }
            ?.let { HybridAI.cloudModelName = it }
    }
}
