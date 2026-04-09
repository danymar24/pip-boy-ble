package com.danielr.pip_boycompanion

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.view.KeyEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class PipBoyNotificationListener : NotificationListenerService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private var isBridgeEnabled = false
    private var allowedApps = emptySet<String>()

    private var activeMediaController: MediaController? = null
    private var lastSentTitle = ""
    private var lastSentArtist = ""
    
    // Variables for Media Command Debouncing
    private var lastMediaCommandTime = 0L
    private val MEDIA_DEBOUNCE_INTERVAL_MS = 500L
    
    // Variables for Vol Debouncing
    private var lastVolumeAdjustmentTime = 0L
    private val VOL_DEBOUNCE_INTERVAL_MS = 200L

    private val mediaCallback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) {
            updateMediaInfo()
        }

        override fun onPlaybackStateChanged(state: PlaybackState?) {
            updateMediaInfo()
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        
        val dataStore = PipBoyDataStore(applicationContext)
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        serviceScope.launch {
            combine(dataStore.bridgeEnabled, dataStore.deviceMac, dataStore.allowedApps) { enabled, mac, apps ->
                Triple(enabled, mac, apps)
            }.collect { (enabled, mac, apps) ->
                isBridgeEnabled = enabled
                allowedApps = apps
                
                if (enabled && mac != null) {
                    PipBoyBleManager.connect(applicationContext, mac)
                } else if (mac == null) {
                    PipBoyBleManager.disconnect()
                }
            }
        }

        // Set up MediaSessionManager to track active media playback
        try {
            val mediaSessionManager = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val componentName = ComponentName(this, PipBoyNotificationListener::class.java)
            
            val sessions = mediaSessionManager.getActiveSessions(componentName)
            updateActiveMediaController(sessions)
            
            mediaSessionManager.addOnActiveSessionsChangedListener({ controllers ->
                updateActiveMediaController(controllers)
            }, componentName)
        } catch (e: SecurityException) {
            e.printStackTrace()
        }

        // Listen for inbound commands from the Pip-Boy
        serviceScope.launch {
            PipBoyBleManager.incomingMessages.collect { msg ->
                val command = msg.trim()
                if (command.startsWith("SPOT|")) {
                    val currentTime = System.currentTimeMillis()
                    
                    // Handle Volume Commands (Faster debounce)
                    if (command == "SPOT|UP" || command == "SPOT|DOWN") {
                        if (currentTime - lastVolumeAdjustmentTime > VOL_DEBOUNCE_INTERVAL_MS) {
                            lastVolumeAdjustmentTime = currentTime
                            if (command == "SPOT|UP") adjustVolume(audioManager, AudioManager.ADJUST_RAISE)
                            if (command == "SPOT|DOWN") adjustVolume(audioManager, AudioManager.ADJUST_LOWER)
                        }
                    } 
                    // Handle Media Control Commands (Slower debounce to prevent double-skips)
                    else if (currentTime - lastMediaCommandTime > MEDIA_DEBOUNCE_INTERVAL_MS) {
                        lastMediaCommandTime = currentTime
                        
                        when (command) {
                            "SPOT|PAUSE" -> {
                                val state = activeMediaController?.playbackState?.state
                                if (state == PlaybackState.STATE_PLAYING) {
                                    activeMediaController?.transportControls?.pause()
                                } else {
                                    activeMediaController?.transportControls?.play()
                                }
                            }
                            "SPOT|NEXT" -> activeMediaController?.transportControls?.skipToNext()
                            "SPOT|PREV" -> activeMediaController?.transportControls?.skipToPrevious()
                        }
                    }
                }
            }
        }
    }

    /**
     * Helper function to safely adjust volume with debouncing.
     */
    private fun adjustVolume(audioManager: AudioManager, direction: Int) {
        serviceScope.launch(Dispatchers.IO) {
            val isRemotePlayback = activeMediaController?.playbackInfo?.playbackType == MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE
            
            if (isRemotePlayback) {
                // If casting to a Nest Hub/Chromecast, pipe volume to the active remote session
                activeMediaController?.adjustVolume(direction, AudioManager.FLAG_SHOW_UI)
            } else {
                // If listening locally, explicitly target STREAM_MUSIC to ensure media volume changes, 
                // but also dispatch standard media button keys just to be perfectly compatible with background Spotify
                audioManager.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    direction,
                    AudioManager.FLAG_SHOW_UI
                )
                
                val keyCode = if (direction == AudioManager.ADJUST_RAISE) KeyEvent.KEYCODE_VOLUME_UP else KeyEvent.KEYCODE_VOLUME_DOWN
                audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
                audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
            }
        }
    }

    private fun updateActiveMediaController(controllers: List<MediaController>?) {
        activeMediaController?.unregisterCallback(mediaCallback)
        activeMediaController = controllers?.firstOrNull()
        activeMediaController?.registerCallback(mediaCallback)
        updateMediaInfo()
    }

    private fun updateMediaInfo() {
        val metadata = activeMediaController?.metadata
        val state = activeMediaController?.playbackState
        
        var title = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: "NO SIGNAL"
        var artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: "UNKNOWN"
        val isPlaying = state?.state == PlaybackState.STATE_PLAYING
        
        // Sanitize strings to avoid breaking the Pip-Boy serial parser
        title = title.replace("|", "").replace("\n", " ").take(25)
        artist = artist.replace("|", "").replace("\n", " ").take(25)
        
        if (title.isBlank()) title = "UNKNOWN"
        if (artist.isBlank()) artist = "UNKNOWN"
        
        // Only trigger BLE outbound message if the actual song changed
        if (title != lastSentTitle || artist != lastSentArtist) {
            PipBoyBleManager.sendData("SPOT|INFO:$title|$artist\n")
            lastSentTitle = title
            lastSentArtist = artist
        }
        
        // Update local state flows so the phone's Compose UI updates too
        PipBoyBleManager.updateMediaState(title, artist, isPlaying)
    }

    override fun onDestroy() {
        activeMediaController?.unregisterCallback(mediaCallback)
        super.onDestroy()
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
            // Apply filtering logic: skip notifications from apps that are not allowed.
            if (!allowedApps.contains(it.packageName)) return
            
            val extras = it.notification.extras
            val appName = getAppName(it.packageName)
            
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()

            val bodyText = text ?: title
            
            if (!bodyText.isNullOrBlank()) {
                val formattedString = "NOTIF|$appName: $bodyText\n"
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
            if (!allowedApps.contains(it.packageName)) return

            val appName = getAppName(it.packageName)
            val formattedString = "CLEAR|$appName\n"
            PipBoyBleManager.sendData(formattedString)
        }
    }
}
