package com.danielr.pip_boycompanion

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.danielr.pip_boycompanion.ui.theme.PipBoyCompanionTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        val dataStore = PipBoyDataStore(applicationContext)
        val pipBoyViewModel = PipBoyViewModel(applicationContext, dataStore)

        setContent {
            // Supply the DataStore to the ThemeViewModel so it can instantly load and save our color preference
            val themeViewModel: ThemeViewModel = viewModel { ThemeViewModel(dataStore) }
            val primaryColor by themeViewModel.primaryColor.collectAsState()

            PipBoyCompanionTheme(primaryColor = primaryColor) {
                val permissionsToRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    arrayOf(
                        Manifest.permission.BLUETOOTH_SCAN,
                        Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    )
                } else {
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION
                    )
                }

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) { }

                LaunchedEffect(Unit) {
                    permissionLauncher.launch(permissionsToRequest)
                }

                PipBoyScreen(pipBoyViewModel, themeViewModel)
            }
        }
    }
}
