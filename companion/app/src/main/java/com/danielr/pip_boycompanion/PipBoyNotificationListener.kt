package com.danielr.pip_boycompanion

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class PipBoyNotificationListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isBridgeEnabled = false

    override fun onListenerConnected() {
        super.onListenerConnected()
        
        // As a persistent service, this acts as the "Background Worker" for the app.
        // It stays alive and gets recreated by the OS automatically.
        val dataStore = PipBoyDataStore(applicationContext)
        
        serviceScope.launch {
            combine(dataStore.bridgeEnabled, dataStore.deviceMac) { enabled, mac ->
                Pair(enabled, mac)
            }.collect { (enabled, mac) ->
                isBridgeEnabled = enabled
                
                // If bridge is enabled and we have a MAC saved, instruct the BLE manager to
                // connect using autoConnect = true. This lets the Android OS reconnect in the background!
                if (enabled && mac != null) {
                    PipBoyBleManager.connect(applicationContext, mac)
                } else if (mac == null) {
                    // User explicitly hit disconnect, ensure we sever background connection
                    PipBoyBleManager.disconnect()
                }
            }
        }
    }

    private fun getAppName(packageName: String): String {
        return try {
            val pm = applicationContext.packageManager
            val info = pm.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            pm.getApplicationLabel(info).toString()
        } catch (e: Exception) {
            packageName
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (!isBridgeEnabled) return
        if (PipBoyBleManager.connectionState.value != ConnectionState.Connected) return
        
        sbn?.let {
            val extras = it.notification.extras
            val appName = getAppName(it.packageName)
            
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()

            val bodyText = text ?: title
            
            if (!bodyText.isNullOrBlank()) {
                val formattedString = "NOTIF|$appName: $bodyText\n"
                // The BleManager singleton stays alive and handles the write safely
                PipBoyBleManager.sendData(formattedString)
            }
        }
    }

    override fun onNotificationRemoved(
        sbn: StatusBarNotification?,
        rankingMap: RankingMap?,
        reason: Int
    ) {
        super.onNotificationRemoved(sbn, rankingMap, reason)
        if (!isBridgeEnabled) return
        if (PipBoyBleManager.connectionState.value != ConnectionState.Connected) return
        
        if (reason == REASON_CANCEL_ALL) {
            PipBoyBleManager.sendData("CLEAR|ALL\n")
            return
        }
        
        sbn?.let {
            val appName = getAppName(it.packageName)
            val formattedString = "CLEAR|$appName\n"
            PipBoyBleManager.sendData(formattedString)
        }
    }
}
