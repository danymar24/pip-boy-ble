// --- 7. SERIAL PARSER & DAEMONS ---
Pip.rem = "";
Pip.currentDanger = 0; // The parser will update this silently

// THE FIX: Autonomous Geiger Daemon (No closure spam!)
if (Pip.geigerTimeout) clearTimeout(Pip.geigerTimeout);

Pip.geigerTick = function () {
  if (Pip.currentDanger > 15) {
    // Math: Calculate speed based on current danger
    var baseDelay = 1000 - ((Pip.currentDanger - 15) / 85) * 900;
    var randomDelay = Math.max(50, baseDelay + ((Math.random() * 300) - 150));

    if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROT_V_1.wav");
    if (typeof Pip.updateHardwareLEDs === 'function') Pip.updateHardwareLEDs(Pip.currentDanger);

    Pip.geigerTimeout = setTimeout(Pip.geigerTick, randomDelay);
  } else {
    // If safe, just go to sleep for a second and check again later
    if (typeof Pip.updateHardwareLEDs === 'function') Pip.updateHardwareLEDs(0);
    Pip.geigerTimeout = setTimeout(Pip.geigerTick, 1000);
  }
};
// Kick off the daemon once during boot
Pip.geigerTick();

Pip.handleData = function (data) {
  var lines = (Pip.rem + data).split('\n');
  Pip.rem = lines.pop();
  if (Pip.rem.length > 128) Pip.rem = "";

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\r/g, "");
    if (line.length === 0) continue;

    if (typeof Pip.logMonitor === 'function') Pip.logMonitor(line);

    if (line.indexOf("SPOT|INFO:") === 0) {
      var infoData = line.split(":")[1] || "";
      var trackData = infoData.split("|");
      Pip.spotifySong = trackData[0] || "";
      Pip.spotifyArtist = trackData[1] || "NOT PLAYING";
      if (Pip.isSpotifyActive && typeof Pip.drawSpotify === 'function') Pip.drawSpotify(); continue;
    }

    var parts = line.split("|");
    if (parts.length > 1) {
      var pCmd = parts[0];
      if (pCmd === "DASH") {
        var dashMsg = parts[1], dIdx = dashMsg.indexOf(":");
        if (dIdx > -1) {
          var key = dashMsg.substring(0, dIdx).trim().toUpperCase();
          var val = dashMsg.substring(dIdx + 1).trim();
          if (!Pip.telemetry) Pip.telemetry = {};
          Pip.telemetry[key] = val;

          if (key === "WEAT") {
            var envParts = val.split(" ");
            var gVal = envParts.length > 2 ? parseFloat(envParts[2]) : 50;
            // Update the global variable silently. The daemon will read it on its next tick!
            Pip.currentDanger = 100 - Math.max(0, Math.min(100, (gVal / 50) * 100));
          }
          if (Pip.isHomeActive && typeof Pip.drawHome === 'function') Pip.drawHome();
        }
      }
      else if (pCmd === "NOTIF") {
        var msg = parts[1], cIdx = msg.indexOf(":"), sender = "UNKNOWN", body = msg;
        if (cIdx > -1) { sender = msg.substring(0, cIdx).trim(); body = msg.substring(cIdx + 1).trim(); }
        if (sender.toUpperCase().indexOf("SPOT") > -1) continue;
        Pip.notifications.unshift({ title: sender, body: body });
        if (Pip.notifications.length > 5) Pip.notifications.pop();
        Pip.showNotification("> INCOMING TRANSMISSION", msg);
        if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK" && typeof Pip.submenuUplink === 'function') Pip.submenuUplink();
      }
      else if (pCmd === "PWR") {
        var pwrCmd = parts[1].trim().toUpperCase();
        if (pwrCmd === "WAKE") { Pip.powerButtonHandler(); Pip.audioStart("UI/ACTIVATE.wav"); }
        else if (pwrCmd === "SLEEP") { Pip.powerButtonHandler(); Pip.audioStart("UI/CANCEL.wav"); }
        else if (pwrCmd === "DIM") Pip.setPowerState("DIM");
      }
      else if (pCmd === "TIME") {
        var uS = parseFloat(parts[1]);
        if (!isNaN(uS)) setTime(uS);
      }
      else if (pCmd === "CLEAR") {
        var clr = parts[1].trim();
        Pip.notifications = (clr === "ALL") ? [] : Pip.notifications.filter(n => n.title !== clr);
        if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK" && typeof Pip.submenuUplink === 'function') Pip.submenuUplink();
      }
      else if (pCmd === "SET") {
        var sM = parts[1], sI = sM.indexOf(":");
        if (sI > -1 && sM.substring(0, sI).trim().toUpperCase() === "COLOR") {
          var cV = parseInt(sM.substring(sI + 1).trim());
          var r = ((cV >> 11) & 31) / 31, gr = ((cV >> 5) & 63) / 63, b = (cV & 31) / 31;
          var pal = [new Uint16Array(16), new Uint16Array(16), new Uint16Array(16), new Uint16Array(16)];
          for (var j = 0; j < 16; j++) {
            pal[0][j] = g.toColor((j / 15) * r, (j / 15) * gr, (j / 15) * b);
            pal[1][j] = g.toColor((j / 30) * r, (j / 30) * gr, (j / 30) * b);
            pal[2][j] = g.toColor((j / 10) * r, (j / 10) * gr, (j / 10) * b);
            pal[3][j] = g.toColor((j / 20) * r, (j / 20) * gr, (j / 20) * b);
          }
          if (Pip.setPalette) Pip.setPalette(pal);
          g.theme.fg = g.theme.fg2 = cV;
          if (typeof bC !== 'undefined') bC.theme.fg = cV;
          if (typeof global.fg !== 'undefined') global.fg = global.fg2 = cV;
          if (typeof settings !== 'undefined' && settings.color) {
            settings.color.r = Math.round(r * 255); settings.color.g = Math.round(gr * 255); settings.color.b = Math.round(b * 255);
          }
          Pip.showNotification("> THEME OVERRIDE", "Color updated.");
          if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK" && typeof Pip.submenuUplink === 'function') Pip.submenuUplink();
        }
      }
      else if (pCmd === "ALARM") {
        var aM = parts[1] || "", cI = aM.indexOf(":"), aS = Pip.alarmState;
        var aC = cI > -1 ? aM.substring(0, cI).trim().toUpperCase() : aM.trim().toUpperCase();
        var aV = cI > -1 ? aM.substring(cI + 1).trim() : "";
        if (aC === "SET") aS.time = aV;
        else if (aC === "ON") aS.enabled = true;
        else if (aC === "OFF") aS.enabled = false;
        else if (aC === "SOUND") aS.soundIndex = aV;
        else if (aC === "REPEAT") aS.repeat = (aV === "1");
        else if (aC === "TRIGGER" && Pip.triggerAlarm) Pip.triggerAlarm();
        else if (aC === "SNOOZE") {
          var d = new Date(); d.setMinutes(d.getMinutes() + 9);
          var zh = d.getHours(), zm = d.getMinutes();
          aS.snoozeTime = (zh < 10 ? "0" + zh : zh) + ":" + (zm < 10 ? "0" + zm : zm);
          Pip.showNotification("> ALARM SNOOZED", "Snoozing for 9 min.");
        }
        else if (aC === "GET") {
          try { Serial3.write("ALARM_STATUS|" + aS.time + "|" + (aS.enabled ? "1" : "0") + "|" + aS.sound + "|" + (aS.repeat ? "1" : "0") + "\n"); } catch (e) { }
        }

      }
    }
  }
};

try { Serial3.on('data', Pip.handleData); } catch (e) { }
}

initUplinkDaemon();