package com.danielr.pip_boycompanion

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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

data class PipBoyUiState(
    val scannedDevices: List<BluetoothDevice> = emptyList(),
    val isScanning: Boolean = false,
    val connectionState: ConnectionState = ConnectionState.Disconnected,
    val savedMacAddress: String? = null,
    val terminalText: String = "",
    val isBridgeEnabled: Boolean = false,
    val debugLog: String = ""
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
            PipBoyBleManager.connectionState.collect { state ->
                _uiState.value = _uiState.value.copy(connectionState = state)
            }
        }

        viewModelScope.launch {
            PipBoyBleManager.debugLog.collect { log ->
                _uiState.value = _uiState.value.copy(debugLog = log)
            }
        }
    }

    fun toggleBridgeEnabled(enabled: Boolean) {
        viewModelScope.launch {
            dataStore.setBridgeEnabled(enabled)
        }
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

    /**
     * Converts an Android Compose Color (RGB888) to a 16-bit RGB565 integer
     * specifically for the Pip-boy Wand OS firmware.
     */
    private fun colorToRGB565(color: Color): Int {
        val r = (color.red * 255).toInt()
        val g = (color.green * 255).toInt()
        val b = (color.blue * 255).toInt()

        // RGB565 format: RRRRRGGG GGGBBBBB
        val r5 = (r shr 3) and 0x1F
        val g6 = (g shr 2) and 0x3F
        val b5 = (b shr 3) and 0x1F

        return (r5 shl 11) or (g6 shl 5) or b5
    }

    fun syncColor(color: Color, predefinedRGB565: Int? = null) {
        // Use the predefined exact values if available, otherwise calculate dynamically
        val rgb565Value = predefinedRGB565 ?: colorToRGB565(color)
        
        // Command requires string conversion of the decimal integer value
        val command = "SET|COLOR:$rgb565Value\n"
        PipBoyBleManager.sendData(command)
    }

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
