package com.danielr.pip_boycompanion

import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.danielr.pip_boycompanion.ui.theme.PipBoyGreen
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ThemeViewModel(private val dataStore: PipBoyDataStore) : ViewModel() {
    private val _primaryColor = MutableStateFlow(PipBoyGreen)
    val primaryColor: StateFlow<Color> = _primaryColor.asStateFlow()

    init {
        viewModelScope.launch {
            dataStore.themeColor.collect { colorLong ->
                if (colorLong != null) {
                    // Reconstruct the Compose Color from the saved ULong value
                    _primaryColor.value = Color(colorLong.toULong())
                }
            }
        }
    }

    fun setPrimaryColor(color: Color) {
        _primaryColor.value = color
        
        viewModelScope.launch {
            // Save the color's internal ULong value as a Long in DataStore
            dataStore.setThemeColor(color.value.toLong())
        }
    }
}
