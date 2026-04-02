package com.danielr.pip_boycompanion

import android.annotation.SuppressLint
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

@SuppressLint("MissingPermission")
object PipBoyBleManager {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _debugLog = MutableStateFlow<String>("BLE Manager Initialized")
    val debugLog: StateFlow<String> = _debugLog.asStateFlow()

    private val _incomingMessages = MutableSharedFlow<String>(extraBufferCapacity = 10)
    val incomingMessages = _incomingMessages.asSharedFlow()

    // --- Media State Flows ---
    private val _mediaTitle = MutableStateFlow("NO SIGNAL")
    val mediaTitle: StateFlow<String> = _mediaTitle.asStateFlow()

    private val _mediaArtist = MutableStateFlow("UNKNOWN")
    val mediaArtist: StateFlow<String> = _mediaArtist.asStateFlow()

    private val _isMediaPlaying = MutableStateFlow(false)
    val isMediaPlaying: StateFlow<Boolean> = _isMediaPlaying.asStateFlow()

    fun updateMediaState(title: String, artist: String, isPlaying: Boolean) {
        _mediaTitle.value = title
        _mediaArtist.value = artist
        _isMediaPlaying.value = isPlaying
    }

    private var bluetoothGatt: BluetoothGatt? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null
    
    // State Tracking
    private var hasSyncedTimeThisSession = false
    private val bleScope = CoroutineScope(Dispatchers.IO)
    
    // We need an application context reference to dispatch broadcasts when we get specific BLE commands
    private var appContext: Context? = null

    private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private fun log(message: String) {
        Log.d("PipBoyBLE", message)
        _debugLog.value = message
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                log("Connected. Requesting MTU 512...")
                _connectionState.value = ConnectionState.Connected
                hasSyncedTimeThisSession = false // Reset sync state for the new session
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    gatt.requestMtu(512)
                } else {
                    gatt.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
                log("Disconnected (Status: $status, State: $newState)")
                _connectionState.value = ConnectionState.Disconnected
                writeCharacteristic = null
                notifyCharacteristic = null
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            super.onMtuChanged(gatt, mtu, status)
            if (status == BluetoothGatt.GATT_SUCCESS) {
                log("MTU expanded to $mtu. Discovering services...")
            } else {
                log("MTU expansion failed. Discovering services...")
            }
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                var foundRx: BluetoothGattCharacteristic? = null
                var foundTx: BluetoothGattCharacteristic? = null
                
                for (srv in gatt.services) {
                    for (char in srv.characteristics) {
                        val uuidStr = char.uuid.toString().uppercase()
                        val props = char.properties
                        
                        if (uuidStr.contains("6E400002")) {
                            foundRx = char
                        } else if (foundRx == null && ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 || 
                                (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0)) {
                            if (uuidStr.contains("6E400003")) foundRx = char
                        }

                        if (uuidStr.contains("6E400003") && (props and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE)) != 0) {
                            foundTx = char
                        } else if (foundTx == null && (props and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE)) != 0) {
                            foundTx = char
                        }
                    }
                }

                if (foundRx != null) {
                    writeCharacteristic = foundRx
                    log("Found RX: ${foundRx.uuid.toString().substring(0,8)}")
                } else {
                    log("ERROR: RX not found!")
                    writeCharacteristic = null
                }

                if (foundTx != null) {
                    notifyCharacteristic = foundTx
                    log("Found TX: ${foundTx.uuid.toString().substring(0,8)}. Enabling notifications...")
                    gatt.setCharacteristicNotification(foundTx, true)
                    
                    val descriptor = foundTx.getDescriptor(CCCD_UUID)
                    if (descriptor != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        } else {
                            @Suppress("DEPRECATION")
                            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            gatt.writeDescriptor(descriptor)
                        }
                    }
                }
                
                // --- AUTO-SYNC HOOK ---
                if (writeCharacteristic != null && !hasSyncedTimeThisSession) {
                    autoSyncPipBoyTime()
                }
                
            } else {
                log("Service discovery failed: $status")
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            super.onCharacteristicWrite(gatt, characteristic, status)
            if (status == BluetoothGatt.GATT_SUCCESS) {
                log("Write SUCCESS")
            } else {
                log("Write FAILED ($status)")
            }
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            super.onCharacteristicChanged(gatt, characteristic)
            val data = characteristic.value
            if (data != null) {
                handleIncomingMessage(String(data, Charsets.UTF_8))
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            super.onCharacteristicChanged(gatt, characteristic, value)
            handleIncomingMessage(String(value, Charsets.UTF_8))
        }
    }
    
    /**
     * Automatically retrieves the current Android system time, formats it perfectly,
     * and writes it directly to the BLE buffer shortly after a successful connection.
     */
    private fun autoSyncPipBoyTime() {
        hasSyncedTimeThisSession = true
        
        bleScope.launch {
            // Delay slightly to ensure CCCD descriptors and GATT buffers are completely stable
            delay(500)
            
            val timestamp = System.currentTimeMillis() / 1000
            val command = "TIME|${timestamp}.0\n"
            
            sendData(command)
            log("AUTO-SYNC: Time sent to Pip-Boy")
        }
    }

    private fun handleIncomingMessage(message: String) {
        _incomingMessages.tryEmit(message)
        log("Recv: ${message.trimEnd().take(15)}")
        
        // Immediately dispatch broadcast if it is the Camera Take command
        if (message.trim() == "CAM|TAKE") {
            appContext?.let { ctx ->
                val intent = android.content.Intent(RobCoAccessibilityService.ACTION_TAKE_PHOTO)
                ctx.sendBroadcast(intent)
            }
        }
    }

    @Synchronized
    fun connect(context: Context, macAddress: String) {
        appContext = context.applicationContext
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        val device = adapter?.getRemoteDevice(macAddress) ?: return
        
        if (bluetoothGatt != null && bluetoothGatt?.device?.address == macAddress) return
        
        disconnect()
        
        log("Connecting to $macAddress...")
        _connectionState.value = ConnectionState.Connecting
        
        bluetoothGatt = device.connectGatt(appContext, true, gattCallback)
    }

    @Synchronized
    fun disconnect() {
        if (bluetoothGatt != null) {
            log("Disconnecting...")
        }
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        writeCharacteristic = null
        notifyCharacteristic = null
        _connectionState.value = ConnectionState.Disconnected
    }

    fun sendData(command: String) {
        val gatt = bluetoothGatt
        val char = writeCharacteristic
        if (gatt != null && char != null && _connectionState.value == ConnectionState.Connected) {
            val payload = command.toByteArray(Charsets.UTF_8)
            
            var writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            if ((char.properties and BluetoothGattCharacteristic.PROPERTY_WRITE) == 0 &&
                (char.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val success = gatt.writeCharacteristic(char, payload, writeType) == BluetoothGatt.GATT_SUCCESS
                if (!success) log("GATT write failed locally!") else log("Sending: ${command.trimEnd().take(10)}...")
            } else {
                char.writeType = writeType
                @Suppress("DEPRECATION")
                char.value = payload
                val success = gatt.writeCharacteristic(char)
                if (!success) log("GATT write failed locally!") else log("Sending: ${command.trimEnd().take(10)}...")
            }
        } else {
            val reason = when {
                gatt == null -> "GATT null"
                char == null -> "RX Char not found"
                else -> "State is ${_connectionState.value}"
            }
            log("Failed to send: $reason")
        }
    }
}
