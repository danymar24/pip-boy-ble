package com.danielr.pip_boycompanion

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.Instrumentation
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class RobCoAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentForegroundPackage: String = ""

    // Loaded dynamically from DataStore
    private var authorizedCameraPackages: Set<String> = emptySet()

    private val cameraCommandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_TAKE_PHOTO) {
                // Foreground Check & Conditional Execution
                if (authorizedCameraPackages.contains(currentForegroundPackage)) {
                    Log.d("RobCoUplink", "Camera is active ($currentForegroundPackage). Dispatched KEYCODE_VOLUME_UP.")
                    dispatchVolumeUpEvent()
                } else {
                    Log.d("RobCoUplink", "Camera NOT active. Ignored CAM|TAKE command.")
                    PipBoyBleManager.sendData("NOTIF|SYSTEM: CAMERA NOT ACTIVE\n")
                }
            }
        }
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d("RobCoUplink", "RobCoAccessibilityService Connected")
        
        val dataStore = PipBoyDataStore(applicationContext)
        serviceScope.launch {
            dataStore.authorizedCameraApps.collect { apps ->
                authorizedCameraPackages = apps
            }
        }
        
        // Register the broadcast receiver to listen for commands from the BLE Manager
        val filter = IntentFilter(ACTION_TAKE_PHOTO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(cameraCommandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(cameraCommandReceiver, filter)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Intercept window state changes to track the exact app running in the foreground
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val packageName = event.packageName?.toString()
            if (packageName != null) {
                currentForegroundPackage = packageName
            }
        }
    }

    override fun onInterrupt() {
        Log.d("RobCoUplink", "RobCoAccessibilityService Interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(cameraCommandReceiver)
    }

    /**
     * Synthesizes a physical Volume Up key press at the OS level using the proper
     * AccessibilityService global media button injection.
     */
    private fun dispatchVolumeUpEvent() {
        // Send a media key event for Volume Up (KEYCODE_VOLUME_UP) which triggers the camera shutter
        // while the camera app is in the foreground.
        val instrumentation = Instrumentation()
        instrumentation.sendKeyDownUpSync( KeyEvent.KEYCODE_VOLUME_UP)

        val intentDown = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
            putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP))
        }
        val intentUp = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
            putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_VOLUME_UP))
        }
        
        sendOrderedBroadcast(intentDown, null)
        sendOrderedBroadcast(intentUp, null)
    }

    companion object {
        const val ACTION_TAKE_PHOTO = "com.danielr.pip_boycompanion.TAKE_PHOTO"
    }
}
