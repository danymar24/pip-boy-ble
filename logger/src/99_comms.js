// --- 7. ZERO-ALLOCATION SERIAL PARSER ---
Pip.rem = "";
Pip.geigerTimeout = null;

Pip.handleGeiger = function (dangerLvl) {
  if (Pip.geigerTimeout) clearTimeout(Pip.geigerTimeout);
  if (dangerLvl > 15) {
    var baseDelay = 1000 - ((dangerLvl - 15) / 85) * 900;
    var randomDelay = Math.max(50, baseDelay + ((Math.random() * 300) - 150));
    Pip.geigerTimeout = setTimeout(function tick() {
      if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROT_V_1.wav"); 
      Pip.handleGeiger(dangerLvl); 
    }, randomDelay);
  }
};

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
      if (Pip.isSpotifyActive) Pip.drawSpotify();
      continue;
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
              var envParts = val.split(" "), gVal = envParts.length > 2 ? parseFloat(envParts[2]) : 50;
              var dangerLvl = 100 - Math.max(0, Math.min(100, (gVal / 50) * 100));
              Pip.handleGeiger(dangerLvl);
              if (typeof Pip.updateHardwareLEDs === 'function') Pip.updateHardwareLEDs(dangerLvl);
            }
            if (Pip.currentMenuTitle === "HOME") Pip.drawHome();
          }
        }
        else if (pCmd === "NOTIF") {
          var msg = parts[1], cIdx = msg.indexOf(":"), sender = "UNKNOWN", body = msg;
          if (cIdx > -1) { sender = msg.substring(0, cIdx).trim(); body = msg.substring(cIdx + 1).trim(); }
          if (sender.toUpperCase().indexOf("SPOT") > -1) continue;
          Pip.notifications.unshift({ title: sender, body: body });
          if (Pip.notifications.length > 5) Pip.notifications.pop();
          Pip.showNotification("> INCOMING TRANSMISSION", msg);
          if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink();
        }
        else if (pCmd === "PWR") {
          var pwrCmd = parts[1].trim().toUpperCase();
          if (pwrCmd === "WAKE") { Pip.powerButtonHandler(); Pip.audioStart("UI/ACTIVATE.wav"); }
          else if (pwrCmd === "SLEEP") { Pip.powerButtonHandler(); Pip.audioStart("UI/CANCEL.wav"); }
          else if (pwrCmd === "DIM") Pip.setPowerState("DIM");
        }
    }
  }
};

try { Serial3.on('data', Pip.handleData); } catch (e) { }
}

initUplinkDaemon();