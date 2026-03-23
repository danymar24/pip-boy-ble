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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

@SuppressLint("MissingPermission")
object PipBoyBleManager {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _debugLog = MutableStateFlow<String>("BLE Manager Initialized")
    val debugLog: StateFlow<String> = _debugLog.asStateFlow()

    private val _incomingMessages = MutableSharedFlow<String>(extraBufferCapacity = 10)
    val incomingMessages = _incomingMessages.asSharedFlow()

    private var bluetoothGatt: BluetoothGatt? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null

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
                
                // Search globally across all services for RX and TX
                for (srv in gatt.services) {
                    for (char in srv.characteristics) {
                        val uuidStr = char.uuid.toString().uppercase()
                        val props = char.properties
                        
                        // RX Matching (Writable)
                        if (uuidStr.contains("6E400002")) {
                            foundRx = char
                        } else if (foundRx == null && ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 || 
                                (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0)) {
                            // Some firmwares flip RX/TX
                            if (uuidStr.contains("6E400003")) foundRx = char
                        }

                        // TX Matching (Notifiable)
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
                            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            gatt.writeDescriptor(descriptor)
                        }
                    }
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

        // Handle incoming notifications (Android < 13)
        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            super.onCharacteristicChanged(gatt, characteristic)
            val data = characteristic.value
            if (data != null) {
                val message = String(data, Charsets.UTF_8)
                _incomingMessages.tryEmit(message)
                log("Recv: ${message.trimEnd().take(15)}")
            }
        }

        // Handle incoming notifications (Android 13+)
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            super.onCharacteristicChanged(gatt, characteristic, value)
            val message = String(value, Charsets.UTF_8)
            _incomingMessages.tryEmit(message)
            log("Recv: ${message.trimEnd().take(15)}")
        }
    }

    @Synchronized
    fun connect(context: Context, macAddress: String) {
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        val device = adapter?.getRemoteDevice(macAddress) ?: return
        
        if (bluetoothGatt != null && bluetoothGatt?.device?.address == macAddress) return
        
        disconnect()
        
        log("Connecting to $macAddress...")
        _connectionState.value = ConnectionState.Connecting
        
        bluetoothGatt = device.connectGatt(context.applicationContext, true, gattCallback)
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
