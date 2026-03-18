package com.danielr.pip_boycompanion

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.danielr.pip_boycompanion.ui.theme.PipBoyBackground

@Composable
fun PipBoyScreen(viewModel: PipBoyViewModel, themeViewModel: ThemeViewModel) {
    val navController = rememberNavController()
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PipBoyBackground)
    ) {
        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                PipBoyBottomNav(navController = navController)
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = "uplink_status",
                modifier = Modifier.padding(innerPadding)
            ) {
                composable("uplink_status") {
                    UplinkStatusScreen(viewModel = viewModel)
                }
                composable("pipboy_settings") {
                    PipBoySettingsScreen(viewModel = viewModel, themeViewModel = themeViewModel)
                }
            }
        }

        // The CRT overlay is drawn last so it sits on top of the entire Scaffold (including the Nav bar)
        CRTScanlines()
    }
}

@Composable
fun PipBoyBottomNav(navController: NavHostController) {
    val items = listOf("uplink_status" to "UPLINK STATUS", "pipboy_settings" to "SETTINGS")
    val primaryColor = MaterialTheme.colorScheme.primary
    val dimColor = primaryColor.copy(alpha = 0.5f)

    NavigationBar(
        containerColor = PipBoyBackground,
        modifier = Modifier.border(width = 2.dp, color = primaryColor)
    ) {
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentRoute = navBackStackEntry?.destination?.route

        items.forEach { (route, label) ->
            NavigationBarItem(
                selected = currentRoute == route,
                onClick = {
                    if (currentRoute != route) {
                        navController.navigate(route) {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                icon = { /* No icons to keep the text-based retro feel */ },
                label = {
                    Text(
                        text = label,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = if (currentRoute == route) primaryColor else dimColor
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = primaryColor.copy(alpha = 0.2f),
                    selectedTextColor = primaryColor,
                    unselectedTextColor = dimColor
                )
            )
        }
    }
}

@Composable
fun PipBoySettingsScreen(viewModel: PipBoyViewModel, themeViewModel: ThemeViewModel) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val alphaColor = primaryColor.copy(alpha = 0.2f)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "SYSTEM SETTINGS MODULE",
            color = primaryColor,
            fontFamily = FontFamily.Monospace,
            fontSize = 18.sp
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Color Override Section
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(2.dp, primaryColor)
                .padding(8.dp)
        ) {
            Text(
                text = "UI COLOR",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Green: 0x07E0
                ColorButton("GREEN", Color(0xFF1AEF0B), 0x07E0, viewModel, themeViewModel, Modifier.weight(1f))
                // Amber: 0xFFC0
                ColorButton("AMBER", Color(0xFFFFB000), 0xFFC0, viewModel, themeViewModel, Modifier.weight(1f))
                // White: 0xFFFF
                ColorButton("WHITE", Color(0xFFFFFFFF), 0xFFFF, viewModel, themeViewModel, Modifier.weight(1f))
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Custom Color Picker implementation using sliders
            // Keying the `remember` block to primaryColor ensures that when the DataStore loads the saved color
            // in the background a few milliseconds after startup, the sliders immediately snap to match it!
            var customRed by remember(primaryColor) { mutableStateOf(primaryColor.red) }
            var customGreen by remember(primaryColor) { mutableStateOf(primaryColor.green) }
            var customBlue by remember(primaryColor) { mutableStateOf(primaryColor.blue) }

            Text(
                text = "CUSTOM COLOR MIXER",
                color = primaryColor.copy(alpha = 0.7f),
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp
            )
            
            Slider(
                value = customRed,
                onValueChange = { customRed = it },
                colors = SliderDefaults.colors(
                    thumbColor = primaryColor,
                    activeTrackColor = primaryColor,
                    inactiveTrackColor = alphaColor
                )
            )
            Slider(
                value = customGreen,
                onValueChange = { customGreen = it },
                colors = SliderDefaults.colors(
                    thumbColor = primaryColor,
                    activeTrackColor = primaryColor,
                    inactiveTrackColor = alphaColor
                )
            )
            Slider(
                value = customBlue,
                onValueChange = { customBlue = it },
                colors = SliderDefaults.colors(
                    thumbColor = primaryColor,
                    activeTrackColor = primaryColor,
                    inactiveTrackColor = alphaColor
                )
            )
            
            Button(
                onClick = { 
                    val newColor = Color(red = customRed, green = customGreen, blue = customBlue)
                    themeViewModel.setPrimaryColor(newColor)
                    viewModel.syncColor(newColor)
                },
                colors = ButtonDefaults.buttonColors(containerColor = alphaColor),
                shape = androidx.compose.ui.graphics.RectangleShape,
                modifier = Modifier.fillMaxWidth().border(1.dp, primaryColor)
            ) {
                Text(text = "APPLY CUSTOM COLOR", color = primaryColor, fontFamily = FontFamily.Monospace)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Time Sync Section
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(2.dp, primaryColor)
                .padding(8.dp)
        ) {
            Text(
                text = "CLOCK SYNC",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = { viewModel.syncTime() },
                colors = ButtonDefaults.buttonColors(containerColor = alphaColor),
                shape = androidx.compose.ui.graphics.RectangleShape,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, primaryColor)
            ) {
                Text(
                    text = "SYNC SYSTEM TIME",
                    color = primaryColor,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}

@Composable
fun ColorButton(
    name: String, 
    color: Color, 
    rgb565Val: Int, 
    viewModel: PipBoyViewModel, 
    themeViewModel: ThemeViewModel, 
    modifier: Modifier = Modifier
) {
    Button(
        onClick = { 
            themeViewModel.setPrimaryColor(color)
            viewModel.syncColor(color, rgb565Val) 
        },
        colors = ButtonDefaults.buttonColors(containerColor = color.copy(alpha = 0.2f)),
        shape = androidx.compose.ui.graphics.RectangleShape,
        modifier = modifier.border(1.dp, color)
    ) {
        Text(text = name, color = color, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
    }
}


@Composable
fun UplinkStatusScreen(viewModel: PipBoyViewModel) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        HeaderSection(
            connectionState = uiState.connectionState,
            savedMacAddress = uiState.savedMacAddress,
            onDisconnect = { viewModel.disconnectDevice() }
        )
        
        Spacer(modifier = Modifier.height(16.dp))

        NotificationBridgeSection(
            isBridgeEnabled = uiState.isBridgeEnabled,
            onToggle = { 
                if (it && !isNotificationServiceEnabled(context)) {
                    openNotificationSettings(context)
                } else {
                    viewModel.toggleBridgeEnabled(it)
                }
            }
        )

        Spacer(modifier = Modifier.height(16.dp))

        ScanSection(
            isScanning = uiState.isScanning,
            devices = uiState.scannedDevices,
            onScanToggle = { if (uiState.isScanning) viewModel.stopScan() else viewModel.startScan() },
            onDeviceSelect = { viewModel.selectDevice(it) },
            modifier = Modifier.weight(1f)
        )

        Spacer(modifier = Modifier.height(16.dp))

        TerminalSection(
            terminalText = uiState.terminalText,
            debugLog = uiState.debugLog,
            onTextChange = { viewModel.updateTerminalText(it) },
            onSend = { viewModel.sendTerminalCommand() },
            onSyncTime = { viewModel.syncTime() }
        )
    }
}

@Composable
fun HeaderSection(
    connectionState: ConnectionState,
    savedMacAddress: String?,
    onDisconnect: () -> Unit
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val dimColor = primaryColor.copy(alpha = 0.5f)

    val stateText = when (connectionState) {
        is ConnectionState.Connected -> "CONNECTED"
        is ConnectionState.Connecting -> "CONNECTING"
        is ConnectionState.Disconnected -> "DISCONNECTED"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(2.dp, primaryColor)
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "ROBCO INDUSTRIES UNIFIED OPERATING SYSTEM",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = stateText,
                color = if (connectionState is ConnectionState.Connected) primaryColor else Color.Red,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
        
        if (savedMacAddress != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "LINKED PERIPHERAL: [$savedMacAddress]",
                    color = dimColor,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    modifier = Modifier.weight(1f)
                )
                
                Text(
                    text = "[DISCONNECT]",
                    color = Color.Red,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    modifier = Modifier
                        .clickable { onDisconnect() }
                        .padding(start = 8.dp)
                )
            }
        }
    }
}

@Composable
fun NotificationBridgeSection(
    isBridgeEnabled: Boolean,
    onToggle: (Boolean) -> Unit
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val dimColor = primaryColor.copy(alpha = 0.5f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(2.dp, primaryColor)
            .padding(8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "NOTIFICATION UPLINK",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Text(
                text = "ROUTE COMM REQUESTS TO PIP-BOY",
                color = dimColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp
            )
        }
        
        Switch(
            checked = isBridgeEnabled,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(
                checkedThumbColor = PipBoyBackground,
                checkedTrackColor = primaryColor,
                uncheckedThumbColor = dimColor,
                uncheckedTrackColor = PipBoyBackground,
                uncheckedBorderColor = primaryColor
            )
        )
    }
}

@SuppressLint("MissingPermission")
@Composable
fun ScanSection(
    isScanning: Boolean,
    devices: List<BluetoothDevice>,
    onScanToggle: () -> Unit,
    onDeviceSelect: (BluetoothDevice) -> Unit,
    modifier: Modifier = Modifier
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val alphaColor = primaryColor.copy(alpha = 0.2f)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .border(2.dp, primaryColor)
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "AVAILABLE PERIPHERALS",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Button(
                onClick = onScanToggle,
                colors = ButtonDefaults.buttonColors(containerColor = alphaColor),
                shape = androidx.compose.ui.graphics.RectangleShape,
                modifier = Modifier.border(1.dp, primaryColor)
            ) {
                Text(
                    text = if (isScanning) "STOP SCAN" else "START SCAN",
                    color = primaryColor,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn {
            items(devices) { device ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onDeviceSelect(device) }
                        .padding(vertical = 4.dp)
                        .border(1.dp, alphaColor)
                        .padding(8.dp)
                ) {
                    Text(
                        text = "${device.name ?: "Unknown"} [${device.address}]",
                        color = primaryColor,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
fun TerminalSection(
    terminalText: String,
    debugLog: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onSyncTime: () -> Unit
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val dimColor = primaryColor.copy(alpha = 0.5f)
    val alphaColor = primaryColor.copy(alpha = 0.2f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(2.dp, primaryColor)
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "TEST TERMINAL",
                color = primaryColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            
            Text(
                text = "LOG: $debugLog",
                color = dimColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 8.sp,
                modifier = Modifier.weight(1f).padding(start = 8.dp)
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = terminalText,
            onValueChange = onTextChange,
            modifier = Modifier.fillMaxWidth(),
            textStyle = androidx.compose.ui.text.TextStyle(
                color = primaryColor,
                fontFamily = FontFamily.Monospace
            ),
            shape = androidx.compose.ui.graphics.RectangleShape,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = primaryColor,
                unfocusedBorderColor = alphaColor,
                cursorColor = primaryColor
            ),
            label = { Text("COMMAND", color = dimColor, fontFamily = FontFamily.Monospace) }
        )

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onSend,
                modifier = Modifier.weight(1f).border(1.dp, primaryColor),
                colors = ButtonDefaults.buttonColors(containerColor = alphaColor),
                shape = androidx.compose.ui.graphics.RectangleShape
            ) {
                Text("SEND COMMAND", color = primaryColor, fontFamily = FontFamily.Monospace)
            }
            Button(
                onClick = onSyncTime,
                modifier = Modifier.weight(1f).border(1.dp, primaryColor),
                colors = ButtonDefaults.buttonColors(containerColor = alphaColor),
                shape = androidx.compose.ui.graphics.RectangleShape
            ) {
                Text("SYNC TIME", color = primaryColor, fontFamily = FontFamily.Monospace)
            }
        }
    }
}

@Composable
fun CRTScanlines() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val scanlineSpacing = 4.dp.toPx()
        for (y in 0 until size.height.toInt() step scanlineSpacing.toInt()) {
            drawLine(
                color = Color.Black.copy(alpha = 0.2f),
                start = Offset(0f, y.toFloat()),
                end = Offset(size.width, y.toFloat()),
                strokeWidth = 1.dp.toPx()
            )
        }
    }
}

// Helper Functions for Notification Access Permissions
fun isNotificationServiceEnabled(context: Context): Boolean {
    val pkgName = context.packageName
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
    return flat != null && flat.contains(pkgName)
}

fun openNotificationSettings(context: Context) {
    context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
}
