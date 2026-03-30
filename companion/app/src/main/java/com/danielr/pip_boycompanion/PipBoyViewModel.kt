package com.danielr.pip_boycompanion

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    object Connected : ConnectionState()
}

data class AppInfo(
    val name: String,
    val packageName: String,
    val icon: Drawable
)

data class WeatherData(
    val temperature: Float = 0f,
    val humidity: Float = 0f,
    val toxicity: Float = 0f
)

data class PipBoyUiState(
    val scannedDevices: List<BluetoothDevice> = emptyList(),
    val isScanning: Boolean = false,
    val connectionState: ConnectionState = ConnectionState.Disconnected,
    val savedMacAddress: String? = null,
    val terminalText: String = "",
    val isBridgeEnabled: Boolean = false,
    val debugLog: String = "",
    val isAlarmEnabled: Boolean = false,
    val alarmTime: String = "07:00",
    val alarmRepeatDaily: Boolean = false,
    val alarmSoundIndex: Int = 0,
    val mediaTitle: String = "NO SIGNAL",
    val mediaArtist: String = "UNKNOWN",
    val isMediaPlaying: Boolean = false,
    val installedApps: List<AppInfo> = emptyList(),
    val allowedApps: Set<String> = emptySet(),
    val weatherData: WeatherData = WeatherData(),
    
    val authorizedCameraApps: Set<String> = emptySet(),
    val isCameraFilterActive: Boolean = false
)

class PipBoyViewModel(
    private val context: Context,
    private val dataStore: PipBoyDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(PipBoyUiState())
    val uiState: StateFlow<PipBoyUiState> = _uiState.asStateFlow()

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothManager.adapter
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            if (device != null && device.name != null) {
                val currentDevices = _uiState.value.scannedDevices
                if (!currentDevices.any { it.address == device.address }) {
                    _uiState.value = _uiState.value.copy(
                        scannedDevices = currentDevices + device
                    )
                }
            }
        }
    }

    init {
        viewModelScope.launch {
            dataStore.deviceMac.collect { mac ->
                _uiState.value = _uiState.value.copy(savedMacAddress = mac)
                if (mac != null) {
                    PipBoyBleManager.connect(context, mac)
                }
            }
        }

        viewModelScope.launch {
            dataStore.bridgeEnabled.collect { enabled ->
                _uiState.value = _uiState.value.copy(isBridgeEnabled = enabled)
            }
        }
        
        viewModelScope.launch {
            dataStore.allowedApps.collect { apps ->
                _uiState.value = _uiState.value.copy(allowedApps = apps)
            }
        }
        
        viewModelScope.launch {
            dataStore.authorizedCameraApps.collect { apps ->
                _uiState.value = _uiState.value.copy(authorizedCameraApps = apps)
            }
        }

        viewModelScope.launch {
            PipBoyBleManager.connectionState.collect { state ->
                _uiState.value = _uiState.value.copy(connectionState = state)
            }
        }

        viewModelScope.launch {
            PipBoyBleManager.debugLog.collect { log ->
                _uiState.value = _uiState.value.copy(debugLog = log)
            }
        }

        // Listen to Media States
        viewModelScope.launch {
            PipBoyBleManager.mediaTitle.collect { title ->
                _uiState.value = _uiState.value.copy(mediaTitle = title)
            }
        }

        viewModelScope.launch {
            PipBoyBleManager.mediaArtist.collect { artist ->
                _uiState.value = _uiState.value.copy(mediaArtist = artist)
            }
        }

        viewModelScope.launch {
            PipBoyBleManager.isMediaPlaying.collect { isPlaying ->
                _uiState.value = _uiState.value.copy(isMediaPlaying = isPlaying)
            }
        }

        // Process incoming messages from Pip-Boy
        viewModelScope.launch {
            PipBoyBleManager.incomingMessages.collect { message ->
                val cleanMsg = message.trim()
                
                if (cleanMsg.startsWith("ALARM_STATUS|")) {
                    val parts = cleanMsg.removePrefix("ALARM_STATUS|").split("|")
                    if (parts.size >= 4) {
                        val enabled = parts[0] == "ON"
                        val time = parts[1]
                        val repeat = parts[2] == "1"
                        val sound = parts[3].toIntOrNull() ?: 0
                        
                        _uiState.value = _uiState.value.copy(
                            isAlarmEnabled = enabled,
                            alarmTime = time,
                            alarmRepeatDaily = repeat,
                            alarmSoundIndex = sound
                        )
                    }
                } 
                else if (cleanMsg.startsWith("DASH|WEAT:")) {
                    val content = cleanMsg.removePrefix("DASH|WEAT:")
                    
                    val temp = Regex("([\\d.]+)F").find(content)?.groupValues?.get(1)?.toFloatOrNull() ?: _uiState.value.weatherData.temperature
                    val hum = Regex("([\\d.]+)%").find(content)?.groupValues?.get(1)?.toFloatOrNull() ?: _uiState.value.weatherData.humidity
                    val tox = Regex("([\\d.]+)kOhm").find(content)?.groupValues?.get(1)?.toFloatOrNull() ?: _uiState.value.weatherData.toxicity
                    
                    _uiState.value = _uiState.value.copy(
                        weatherData = WeatherData(
                            temperature = temp,
                            humidity = hum,
                            toxicity = tox
                        )
                    )
                }
            }
        }
    }

    fun toggleBridgeEnabled(enabled: Boolean) {
        viewModelScope.launch {
            dataStore.setBridgeEnabled(enabled)
        }
    }
    
    fun loadInstalledApps() {
        viewModelScope.launch(Dispatchers.IO) {
            val pm = context.packageManager
            val intent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            // Fetch applications asynchronously
            val resolveInfoList = pm.queryIntentActivities(intent, 0)
            val apps = resolveInfoList.map { resolveInfo ->
                AppInfo(
                    name = resolveInfo.loadLabel(pm).toString(),
                    packageName = resolveInfo.activityInfo.packageName,
                    icon = resolveInfo.loadIcon(pm)
                )
            }.distinctBy { it.packageName }.sortedBy { it.name.lowercase() }

            _uiState.value = _uiState.value.copy(installedApps = apps)
        }
    }
    
    fun toggleAppAllowance(packageName: String, isAllowed: Boolean) {
        viewModelScope.launch {
            val currentAllowed = _uiState.value.allowedApps.toMutableSet()
            if (isAllowed) {
                currentAllowed.add(packageName)
            } else {
                currentAllowed.remove(packageName)
            }
            dataStore.setAllowedApps(currentAllowed)
        }
    }

    fun toggleCameraAllowance(packageName: String, isAllowed: Boolean) {
        viewModelScope.launch {
            val currentAllowed = _uiState.value.authorizedCameraApps.toMutableSet()
            if (isAllowed) {
                currentAllowed.add(packageName)
            } else {
                currentAllowed.remove(packageName)
            }
            dataStore.setAuthorizedCameraApps(currentAllowed)
        }
    }
    
    fun toggleCameraFilter() {
        _uiState.value = _uiState.value.copy(isCameraFilterActive = !_uiState.value.isCameraFilterActive)
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        if (bluetoothAdapter?.isEnabled == true) {
            _uiState.value = _uiState.value.copy(scannedDevices = emptyList(), isScanning = true)
            bluetoothAdapter?.bluetoothLeScanner?.startScan(scanCallback)
            
            viewModelScope.launch {
                delay(10000) // Scan for 10 seconds
                stopScan()
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        _uiState.value = _uiState.value.copy(isScanning = false)
    }

    @SuppressLint("MissingPermission")
    fun selectDevice(device: BluetoothDevice) {
        viewModelScope.launch {
            dataStore.saveDeviceMac(device.address)
        }
        
        PipBoyBleManager.connect(context, device.address)
    }

    fun disconnectDevice() {
        viewModelScope.launch {
            dataStore.saveDeviceMac(null) // Clear saved device so auto-connect stops
        }
        PipBoyBleManager.disconnect()
    }

    fun syncTime() {
        val timestamp = System.currentTimeMillis() / 1000
        val command = "TIME|${timestamp}.0\n"
        PipBoyBleManager.sendData(command)
    }

    private fun colorToRGB565(color: Color): Int {
        val r = (color.red * 255).toInt()
        val g = (color.green * 255).toInt()
        val b = (color.blue * 255).toInt()

        val r5 = (r shr 3) and 0x1F
        val g6 = (g shr 2) and 0x3F
        val b5 = (b shr 3) and 0x1F

        return (r5 shl 11) or (g6 shl 5) or b5
    }

    fun syncColor(color: Color, predefinedRGB565: Int? = null) {
        val rgb565Value = predefinedRGB565 ?: colorToRGB565(color)
        val command = "SET|COLOR:$rgb565Value\n"
        PipBoyBleManager.sendData(command)
    }

    // --- ALARM MODULE COMMANDS ---
    
    fun fetchAlarmStatus() {
        PipBoyBleManager.sendData("ALARM|GET\n")
    }
    
    fun toggleAlarm(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(isAlarmEnabled = enabled)
        val command = if (enabled) "ALARM|ON\n" else "ALARM|OFF\n"
        PipBoyBleManager.sendData(command)
    }
    
    fun setAlarmTime(hhmm: String) {
        _uiState.value = _uiState.value.copy(alarmTime = hhmm)
        PipBoyBleManager.sendData("ALARM|SET:$hhmm\n")
    }
    
    fun toggleAlarmRepeat(repeat: Boolean) {
        _uiState.value = _uiState.value.copy(alarmRepeatDaily = repeat)
        val command = if (repeat) "ALARM|REPEAT:1\n" else "ALARM|REPEAT:0\n"
        PipBoyBleManager.sendData(command)
    }
    
    fun setAlarmSound(soundIndex: Int) {
        _uiState.value = _uiState.value.copy(alarmSoundIndex = soundIndex)
        PipBoyBleManager.sendData("ALARM|SOUND:$soundIndex\n")
    }
    
    fun triggerAlarmTest() {
        PipBoyBleManager.sendData("ALARM|TEST\n")
    }
    
    fun snoozeAlarm() {
        PipBoyBleManager.sendData("ALARM|SNOOZE\n")
    }

    // --- TERMINAL COMMANDS ---

    fun updateTerminalText(text: String) {
        _uiState.value = _uiState.value.copy(terminalText = text)
    }

    fun sendTerminalCommand() {
        val text = _uiState.value.terminalText
        if (text.isNotBlank()) {
            val command = if (text.startsWith("NOTIF|")) "$text\n" else "EXEC|$text\n"
            PipBoyBleManager.sendData(command)
            _uiState.value = _uiState.value.copy(terminalText = "")
        }
    }
}
