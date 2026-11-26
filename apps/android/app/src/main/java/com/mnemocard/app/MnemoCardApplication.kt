package com.mnemocard.app

import android.app.Application
import com.google.firebase.FirebaseApp

class MnemoCardApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // The Google Services plugin initializes Firebase when google-services.json is present.
        // App Check goes first so Auth and Firestore requests carry its token.
        if (FirebaseApp.getApps(this).isNotEmpty()) installAppCheck()
        DeckStore.init(this)
    }
}
