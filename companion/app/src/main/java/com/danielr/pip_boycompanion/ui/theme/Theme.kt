package com.danielr.pip_boycompanion.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
fun PipBoyCompanionTheme(
    primaryColor: Color = PipBoyGreen,
    content: @Composable () -> Unit
) {
    // We derive the other theme colors dynamically from the selected primary color
    // to maintain the unified monochrome CRT aesthetic.
    val dimColor = primaryColor.copy(alpha = 0.5f)
    val alphaColor = primaryColor.copy(alpha = 0.2f)

    val colorScheme = darkColorScheme(
        primary = primaryColor,
        secondary = dimColor,
        tertiary = alphaColor,
        background = PipBoyBackground,
        surface = PipBoyBackground,
        onPrimary = PipBoyBackground,
        onSecondary = PipBoyBackground,
        onTertiary = PipBoyBackground,
        onBackground = primaryColor,
        onSurface = primaryColor,
        outline = primaryColor, // Use primary for borders
        outlineVariant = alphaColor
    )

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
