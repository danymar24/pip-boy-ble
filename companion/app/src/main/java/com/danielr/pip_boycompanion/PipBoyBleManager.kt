package com.danielr.pip_boycompanion

import android.annotation.SuppressLint
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

@SuppressLint("MissingPermission")
object PipBoyBleManager {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _debugLog = MutableStateFlow<String>("BLE Manager Initialized")
    val debugLog: StateFlow<String> = _debugLog.asStateFlow()

    private var bluetoothGatt: BluetoothGatt? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null

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
                var foundChar: BluetoothGattCharacteristic? = null
                
                // Search globally across all services
                for (srv in gatt.services) {
                    for (char in srv.characteristics) {
                        val uuidStr = char.uuid.toString().uppercase()
                        
                        // Match the exact RX Characteristic from the firmware
                        if (uuidStr.contains("6E400002")) {
                            foundChar = char
                            log("Found EXACT target RX: ${uuidStr.substring(0, 8)}...")
                            break
                        }
                        
                        // Fallback: If firmware RX/TX are flipped, check if 0003 is writable
                        if (uuidStr.contains("6E400003") && foundChar == null) {
                            val props = char.properties
                            if ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                                (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                                foundChar = char
                                log("Found writable TX (used as fallback): ${uuidStr.substring(0, 8)}...")
                            }
                        }
                    }
                    if (foundChar != null && foundChar.uuid.toString().uppercase().contains("6E400002")) break
                }

                if (foundChar != null) {
                    writeCharacteristic = foundChar
                } else {
                    // Collect fully uppercase strings of all characteristics for logging
                    val available = gatt.services.flatMap { it.characteristics }.take(3).joinToString { it.uuid.toString().uppercase().substring(0, 8) }
                    log("ERROR: RX not found! Has: $available...")
                    writeCharacteristic = null
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
                log("Write SUCCESS: ${characteristic.uuid.toString().substring(0,8)}")
            } else {
                log("Write FAILED (Status: $status)")
            }
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
