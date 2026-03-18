# Pip-Boy 3000 Mk IV - Bluetooth Uplink Mod

An open-source hardware and software bridge that connects The Wand Company's Pip-Boy 3000 Mk IV replica to modern Android devices via Bluetooth Low Energy (BLE). 

This project injects a custom background daemon into the Pip-Boy's native Espruino operating system, allowing it to receive real-time push notifications and dynamically manipulate the hardware's CRT scanline color palette directly from an Android companion app.

## Features
* **Asynchronous BLE Bridge:** A stable UART serial connection routed through an ESP32 microcontroller, wired directly to the Pip-Boy's internal `Serial3` RX/TX pads.
* **Native UI Integration:** Intercepts the proprietary Wand OS graphics pipeline to inject a custom "COMMUNICATIONS UPLINK" inbox directly into the smartwatch's native menu system.
* **Real-Time Notifications:** Pushes Android alerts to the screen with custom popups, alert sounds, and auto-refreshing UI states.
* **Hardware CRT Color Override:** Bypasses standard software themes to dynamically recalculate the physical LCD's 16-color RGB565 hardware palette, enabling complete color customization (Green, Amber, White, or custom hex) while preserving the authentic 1990s scanline flicker.
* **Battery Safe:** Hard-locks the REPL console to the USB interface to prevent serial migration crashes when running on internal battery power.

## Architecture

The system is built on a three-tier architecture:

1. **ESP32 BLE Node (C++):** Acts as a low-energy bridge. Maintains the GATT server, handles Android disconnect/reconnect panics, and relays raw string data over hardware serial at 115200 baud.
2. **Android Companion App (Kotlin):** Manages the BLE connection lifecycle, parses incoming phone notifications, and transmits standardized command strings (e.g., `NOTIF|Sender:Message` or `SET|COLOR:65504`).
3. **Pip-Boy Daemon (`daemon.js`):** A lightweight JavaScript background parser running on the Wand OS. It hooks into the `g.setColor` and `E.showMenu` closures to intercept rendering commands, manage memory buffers, and manipulate the global UI state without triggering the watchdog timer.

## Installation & Wiring
*(Documentation on ESP32 pinouts and opening the Pip-Boy chassis coming soon).*

## Author
**Daniel Rodriguez** Senior Solutions Architect  

## Disclaimer
*This is an unofficial, open-source fan project. It is not affiliated with, endorsed by, or associated with Bethesda Softworks, ZeniMax Media, or The Wand Company. "Pip-Boy", "RobCo", and "Fallout" are registered trademarks of Bethesda Softworks LLC. This modification requires opening the device chassis and interacting with bare electronics. The author is not responsible for any damage to your hardware.*

## 1. Hardware Architecture

An ESP32-S3 acts as the BLE GATT bridge, wired directly into the Pip-Boy's motherboard to bypass USB power restrictions.

* **Power:** Wire the ESP32's `3V3` pin directly to the Pip-Boy motherboard's `3V3` test pad. 
* **Ground:** Wire ESP32 `GND` to Pip-Boy `GND`.
* **Data:** Wire ESP32 `TX`/`RX` to the Pip-Boy's exposed internal Serial pads.

---

## 2. ESP32 BLE Bridge (Arduino C++)

The ESP32 acts as a bidirectional BLE server. It listens for commands from the Android app to pass to the Pip-Boy, and listens to the Pip-Boy's serial line to push telemetry back to the Android app.

Flash the sketch uplink.ino to your ESP32:

---

## 3. Software Configuration (Pip-OS)

Using the community Web Serial File Manager, upload the file `daemon.js` inside the `/USER/` directory of the Pip-Boy. The Wand OS will automatically discover this and place it in your `INV -> APPS` menu. Launch it once after a battery drain to permanently arm the RAM.

---

## 4. The BLE Protocol / API

All commands sent to the RX Characteristic MUST be formatted as plain text strings and MUST terminate with a newline character (`\\n`). 

### Outbound Commands (Android -> Pip-Boy)

* **Push Notification:** `NOTIF|[Sender Name]: [Message Body]\\n`
  *(Example: `NOTIF|RobCo: Battery Low\\n`)*
* **Time Synchronization:** `TIME|[Unix Timestamp in Seconds]\\n`
  *(Example: `TIME|1742054400.0\\n`)*
* **Change UI Settings:** `SET|[KEY]:[VALUE]\\n`
  *(Example: `SET|COLOR:63488\\n` changes UI to Red)*
* **Set Alarm:** `ALARM|SET:[HH:MM]\\n`
  *(Example: `ALARM|SET:07:30\\n`)*
* **Request Alarm Status:** `ALARM|GET\\n`
* **Remote Code Execution:** `EXEC|[Raw JavaScript]\\n`
  *(Example: `EXEC|Pip.audioStart('UI/LEVELUP.wav');\\n`)*

### Inbound Telemetry (Pip-Boy -> Android)

When the Android app subscribes to the TX Characteristic, the Pip-Boy will push data back using this format:

* **Alarm Status Response:** `ALARM_STATUS|[HH:MM or "OFF"]\\n`
  *(Triggered by the `ALARM|GET` command)*