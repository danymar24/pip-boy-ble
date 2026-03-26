// --- 7. SERIAL PARSER ---
Pip.serialBuffer = "";
Pip.isProcessing = false;

// --- GEIGER COUNTER DAEMON ---
Pip.geigerTimeout = null;

Pip.handleGeiger = function (dangerLvl) {
  if (Pip.geigerTimeout) clearTimeout(Pip.geigerTimeout);

  // If danger is above 15%, start clicking
  if (dangerLvl > 15) {
    // Math: Higher danger = faster clicks (shorter delay)
    // Maps a 15-100 danger level to a 1000ms - 100ms delay
    var baseDelay = 1000 - ((dangerLvl - 15) / 85) * 900;

    // Add +/- 150ms of pure randomness for that authentic, sporadic Geiger feel
    var randomDelay = baseDelay + ((Math.random() * 300) - 150);
    if (randomDelay < 50) randomDelay = 50; // Cap maximum speed

    Pip.geigerTimeout = setTimeout(function tick() {
      // Use a short tick/click sound from the native Wand OS library
      if (typeof Pip.audioStart === 'function') {
        Pip.audioStart("UI/ROT_V_1.wav"); // Fallback to "UI/ROT_V_1.wav" if TICK doesn't exist
      }
      Pip.handleGeiger(dangerLvl); // Loop it
    }, randomDelay);
  }
};

Pip.processBuffer = function () {
  if (Pip.serialBuffer.indexOf('\n') === -1) {
    Pip.isProcessing = false;
    return;
  }

  var lines = Pip.serialBuffer.split('\n');
  Pip.serialBuffer = lines.pop();

  for (var i = 0; i < lines.length; i++) {
    var cmd = lines[i].trim();
    if (cmd.length === 0) continue;

    if (typeof Pip.logMonitor === 'function') {
      Pip.logMonitor(cmd);
    }

    if (cmd.indexOf("SPOT|INFO:") === 0) {
      var infoData = cmd.split(":")[1] || "";
      var trackData = infoData.split("|"); // Splits "Song|Artist"
      Pip.spotifySong = trackData[0] || "";
      Pip.spotifyArtist = trackData[1] || "";
      console.log(`Spotify Update - Song: "${Pip.spotifySong}", Artist: "${Pip.spotifyArtist}"`);
      // If the user is currently looking at the Spotify screen, redraw it instantly
      if (Pip.isSpotifyActive) Pip.drawSpotify();
    }

    var parts = cmd.split("|");
    if (parts.length > 1) {

      if (parts[0] === "NOTIF") {
        var msg = parts[1], cIdx = msg.indexOf(":"), sender = "UNKNOWN", body = msg;
        if (cIdx > -1) {
          sender = msg.substring(0, cIdx).trim();
          body = msg.substring(cIdx + 1).trim();
        }

        if (sender.toUpperCase().indexOf("SPOT") > -1) continue;

        Pip.notifications.unshift({ title: sender, body: body });
        if (Pip.notifications.length > 5) Pip.notifications.pop();

        Pip.showNotification("> INCOMING TRANSMISSION", msg);
        if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink();
      }
      else if (parts[0] === "TIME") {
        var unixSeconds = parseFloat(parts[1]);
        if (!isNaN(unixSeconds)) setTime(unixSeconds);
      }
      else if (parts[0] === "SET") {
        var setMsg = parts[1], setIdx = setMsg.indexOf(":");
        if (setIdx > -1) {
          var settingKey = setMsg.substring(0, setIdx).trim().toUpperCase();
          var settingValue = setMsg.substring(setIdx + 1).trim();

          if (settingKey === "COLOR") {
            var colorVal = parseInt(settingValue);
            var r5 = (colorVal >> 11) & 0x1F, g6 = (colorVal >> 5) & 0x3F, b5 = colorVal & 0x1F;
            var r = r5 / 31.0, gr = g6 / 63.0, b = b5 / 31.0;
            var r8 = Math.round(r * 255), g8 = Math.round(gr * 255), b8 = Math.round(b * 255);

            var pal = [new Uint16Array(16), new Uint16Array(16), new Uint16Array(16), new Uint16Array(16)];
            for (var j = 0; j < 16; j++) {
              pal[0][j] = g.toColor((j / 15) * r, (j / 15) * gr, (j / 15) * b);
              pal[1][j] = g.toColor((j / 30) * r, (j / 30) * gr, (j / 30) * b);
              pal[2][j] = g.toColor((j / 10) * r, (j / 10) * gr, (j / 10) * b);
              pal[3][j] = g.toColor((j / 20) * r, (j / 20) * gr, (j / 20) * b);
            }
            if (typeof Pip.setPalette === 'function') Pip.setPalette(pal);

            g.theme.fg = colorVal;
            g.theme.fg2 = colorVal;
            if (typeof bC !== 'undefined' && bC.theme) bC.theme.fg = colorVal;
            if (typeof global.fg !== 'undefined') global.fg = colorVal;
            if (typeof global.fg2 !== 'undefined') global.fg2 = colorVal;

            if (typeof settings !== 'undefined' && settings.color) {
              settings.color.r = r8; settings.color.g = g8; settings.color.b = b8;
            }

            Pip.showNotification("> THEME OVERRIDE", "Color profile updated.");
            if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink();
          }
        }
      }
      else if (parts[0] === "CLEAR") {
        var clearCmd = parts[1].trim();
        if (clearCmd === "ALL") {
          Pip.notifications = [];
        } else {
          var filteredInbox = [];
          for (var k = 0; k < Pip.notifications.length; k++) {
            if (Pip.notifications[k].title !== clearCmd) filteredInbox.push(Pip.notifications[k]);
          }
          Pip.notifications = filteredInbox;
        }
        if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink();
      }
      else if (parts[0] === "ALARM") {
        var aMsg = parts[1] || "";
        var cIdx = aMsg.indexOf(":");
        var aCmd = cIdx > -1 ? aMsg.substring(0, cIdx).trim().toUpperCase() : aMsg.trim().toUpperCase();
        var aVal = cIdx > -1 ? aMsg.substring(cIdx + 1).trim() : "";

        if (aCmd === "SET") Pip.alarmState.time = aVal;
        else if (aCmd === "ON") Pip.alarmState.enabled = true;
        else if (aCmd === "OFF") Pip.alarmState.enabled = false;
        else if (aCmd === "SOUND") Pip.alarmState.sound = aVal;
        else if (aCmd === "REPEAT") Pip.alarmState.repeat = (aVal === "1");
        else if (aCmd === "TRIGGER") Pip.triggerAlarm();
        else if (aCmd === "SNOOZE") {
          var d = new Date();
          d.setMinutes(d.getMinutes() + 9);
          Pip.alarmState.snoozeTime = zPad(d.getHours()) + ":" + zPad(d.getMinutes());
          Pip.showNotification("> ALARM SNOOZED", "Snoozing for 9 minutes.");
        }
        else if (aCmd === "GET") {
          var status = "ALARM_STATUS|" + Pip.alarmState.time + "|" +
            (Pip.alarmState.enabled ? "1" : "0") + "|" +
            Pip.alarmState.sound + "|" +
            (Pip.alarmState.repeat ? "1" : "0") + "\n";
          try { Serial3.write(status); } catch (e) { }
        }
      }
      else if (parts[0] === "DASH") {
        var dashMsg = parts[1], dIdx = dashMsg.indexOf(":");
        if (dIdx > -1) {
          var key = dashMsg.substring(0, dIdx).trim().toUpperCase();
          var val = dashMsg.substring(dIdx + 1).trim();

          if (!Pip.telemetry) Pip.telemetry = {};
          Pip.telemetry[key] = val;

          // Trigger Daemons if it's weather/hazmat data
          if (key === "WEAT") {
            var envParts = val.split(" ");
            var gVal = envParts.length > 2 ? parseFloat(envParts[2]) : 50;

            // Calculate toxicity (0 to 100)
            var dangerLvl = 100 - Math.max(0, Math.min(100, (gVal / 50) * 100));

            // 1. Fire the Audio Geiger Counter
            Pip.handleGeiger(dangerLvl);

            // 2. Fire the Physical Hardware LEDs
            if (typeof Pip.updateHardwareLEDs === 'function') {
              Pip.updateHardwareLEDs(dangerLvl);
            }
          }

          // Update the screen if the user is looking at it
          if (Pip.currentMenuTitle === "HOME") Pip.drawHome();
        }
      }
      // Inside Pip.processBuffer logic 
      else if (parts[0] === "PWR") {
        var pwrCmd = parts[1].trim().toUpperCase();

        if (pwrCmd === "WAKE") {
          Pip.powerButtonHandler(); // Simulate a physical press of the power button to wake the device
          Pip.audioStart("UI/ACTIVATE.wav"); // Native Wand OS sound [cite: 3]
        }
        else if (pwrCmd === "SLEEP") {
          Pip.powerButtonHandler(); // Simulate a physical press of the power button to wake the device
          Pip.audioStart("UI/CANCEL.wav");
        }
        else if (pwrCmd === "DIM") {
          Pip.setPowerState("DIM");
        }
      }
    }
  }

  if (Pip.serialBuffer.indexOf('\n') !== -1) setTimeout(Pip.processBuffer, 10);
  else Pip.isProcessing = false;
};

Pip.handleData = function (data) {
  Pip.serialBuffer += data;
  if (Pip.serialBuffer.length > 512) Pip.serialBuffer = "";
  if (Pip.serialBuffer.indexOf('\n') !== -1 && !Pip.isProcessing) {
    Pip.isProcessing = true;
    setTimeout(Pip.processBuffer, 10);
  }
};

try { Serial3.on('data', Pip.handleData); } catch (e) { }
} // CLOSES THE BOOTLOADER WRAPPER

// EXECUTE
initUplinkDaemon();