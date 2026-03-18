package com.danielr.pip_boycompanion

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * A simple singleton to relay messages from the NotificationListenerService 
 * to the ViewModel since Services can't easily hold a reference to ViewModels.
 */
object PipBoyRelay {
    private val _notifications = MutableSharedFlow<String>(extraBufferCapacity = 10)
    val notifications = _notifications.asSharedFlow()

    fun sendNotification(formattedString: String) {
        _notifications.tryEmit(formattedString)
    }
}
