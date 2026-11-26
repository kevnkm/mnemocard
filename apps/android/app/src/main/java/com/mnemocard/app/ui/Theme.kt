package com.mnemocard.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.colorResource
import com.mnemocard.app.R

private val Brand = Color(0xFFFF7060)

@Composable
fun MnemoCardTheme(content: @Composable () -> Unit) {
    // Same color as the window theme, so the splash screen matches the first frame.
    val background = colorResource(R.color.app_background)
    val colors = if (isSystemInDarkTheme()) {
        darkColorScheme(
            primary = Brand,
            onPrimary = Color.White,
            background = background,
            surface = background,
        )
    } else {
        lightColorScheme(
            primary = Brand,
            onPrimary = Color.White,
            primaryContainer = Color(0xFFFFE9E6),
            onPrimaryContainer = Color(0xFF2C1715),
            background = background,
            surface = background,
        )
    }
    MaterialTheme(colorScheme = colors, content = content)
}
