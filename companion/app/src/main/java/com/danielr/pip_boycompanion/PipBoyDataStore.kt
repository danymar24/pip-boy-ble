package com.danielr.pip_boycompanion

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "pipboy_settings")

class PipBoyDataStore(private val context: Context) {
    companion object {
        val DEVICE_MAC_KEY = stringPreferencesKey("device_mac")
        val BRIDGE_ENABLED_KEY = booleanPreferencesKey("bridge_enabled")
        val THEME_COLOR_KEY = longPreferencesKey("theme_color")
    }

    val deviceMac: Flow<String?> = context.dataStore.data
        .map { preferences ->
            preferences[DEVICE_MAC_KEY]
        }

    val bridgeEnabled: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[BRIDGE_ENABLED_KEY] ?: false
        }

    val themeColor: Flow<Long?> = context.dataStore.data
        .map { preferences ->
            preferences[THEME_COLOR_KEY]
        }

    suspend fun saveDeviceMac(mac: String?) {
        context.dataStore.edit { preferences ->
            if (mac != null) {
                preferences[DEVICE_MAC_KEY] = mac
            } else {
                preferences.remove(DEVICE_MAC_KEY)
            }
        }
    }

    suspend fun setBridgeEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[BRIDGE_ENABLED_KEY] = enabled
        }
    }

    suspend fun setThemeColor(colorValue: Long) {
        context.dataStore.edit { preferences ->
            preferences[THEME_COLOR_KEY] = colorValue
        }
    }
}
