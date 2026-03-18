// --- THE PIP-BOY BOOTLOADER WRAPPER ---
function initUplinkDaemon() {
  // 1. Wait for the Wand OS C-Engine to finish booting!
  if (typeof Pip === 'undefined' || typeof bC === 'undefined' || typeof E.showMenu === 'undefined') {
    setTimeout(initUplinkDaemon, 1000); // Check again in 1 second
    return;
  }

  // 2. The OS is ready! Execute the Background Hijack!
  USB.setConsole(true); 
  try { Serial3.removeAllListeners('data'); } catch(e) {}

  if (!Pip.originalFlip) Pip.originalFlip = bC.flip;
  Pip.isNotifActive = false;
  Pip.notifHeader = "";
  Pip.notifBody = "";
  if (!Pip.notifications) Pip.notifications = []; 
  if (!Pip.alarmTime) Pip.alarmTime = "OFF";

  if (!Pip.originalShowMenu) Pip.originalShowMenu = E.showMenu;
  Pip.currentMenuTitle = "";

  E.showMenu = function(menu) {
    if (menu && menu[""] && menu[""].title) {
      Pip.currentMenuTitle = menu[""].title; 
    } else {
      Pip.currentMenuTitle = ""; 
    }
    Pip.originalShowMenu(menu);
  };

  bC.flip = function(a) {
    Pip.originalFlip(a);
    if (Pip.isNotifActive) {
      g.setColor(0).fillRect(60, 90, 420, 250); 
      g.setColor(g.theme.fg).drawRect(60, 90, 420, 250); 
      g.setFont("Vector", 20).setFontAlign(-1, -1);
      g.drawString(Pip.notifHeader, 70, 100).drawLine(70, 125, 410, 125);
      g.setFont("Vector", 18);
      var cx = 70, cy = 140;
      for(var i=0; i < Pip.notifBody.length; i++) {
        if(Pip.notifBody[i] === '\n' || Pip.notifBody[i] === '\r') continue; 
        g.drawString(Pip.notifBody[i], cx, cy);
        cx += 14; 
        if(cx > 400) { cx = 70; cy += 24; }
        if(cy > 230) break; 
      }
    }
  };

  Pip.showNotification = function(header, text) {
    Pip.audioStart("UI/ALERT.wav");
    Pip.notifHeader = header;
    Pip.notifBody = text;
    Pip.isNotifActive = true;
    bC.flip(); 
    if (Pip.notifTimeout) clearTimeout(Pip.notifTimeout);
    Pip.notifTimeout = setTimeout(function() {
      Pip.isNotifActive = false;
      bC.flip(); 
    }, 5000);
  };

  Pip.readNotification = function(idx) {
    Pip.currentMenuTitle = "READING_MESSAGE"; 
    Pip.removeSubmenu && Pip.removeSubmenu();
    var n = Pip.notifications[idx];
    bC.clear(1);
    bC.setColor(g.theme.fg).setFont("Vector", 20).setFontAlign(-1, -1);
    bC.drawString("FROM: " + n.title, 20, 20).drawLine(20, 45, 380, 45);
    bC.setFont("Vector", 18);
    var cx = 20, cy = 60;
    for(var i=0; i < n.body.length; i++) {
      if(n.body[i] === '\n' || n.body[i] === '\r') continue; 
      bC.drawString(n.body[i], cx, cy);
      cx += 14; 
      if(cx > 370) { cx = 20; cy += 24; }
      if(cy > 160) break; 
    }
    bC.drawLine(20, 175, 380, 175).drawString("Click: DELETE   Scroll: BACK", 20, 185);
    bC.flip();

    var knobHandler = function(dir) {
      if (dir === 0) { 
        Pip.notifications.splice(idx, 1);
        Pip.audioStart("UI/CANCEL.wav");
        Pip.submenuUplink(); 
      } else { 
        Pip.audioStart("UI/ROT_V_1.wav");
        Pip.submenuUplink(); 
      }
    };
    Pip.on('knob1', knobHandler);
    Pip.removeSubmenu = function() { Pip.removeListener('knob1', knobHandler); };
  };

  Pip.submenuUplink = function() {
    var menu = {"": {title: "COMMUNICATIONS UPLINK"}};
    if (Pip.notifications.length === 0) {
      menu["NO MESSAGES"] = function(){};
    } else {
      Pip.notifications.forEach(function(n, idx) {
        menu[(idx+1) + ". " + n.title] = function() { Pip.readNotification(idx); };
      });
      menu["CLEAR ALL"] = function() {
        Pip.notifications = [];
        Pip.audioStart("UI/CANCEL.wav");
        Pip.submenuUplink();
      };
    }
    E.showMenu(menu);
  };

  if (MODEINFO && MODEINFO[3] && MODEINFO[3].submenu) {
    var s = MODEINFO[3].submenu;
    MODEINFO[3].submenu = {
      "UPLINK": Pip.submenuUplink,
      "CLOCK": s.CLOCK,
      "ALARM": s.ALARM,
      "STATS": s.STATS,
      "MAINTENANCE": s.MAINTENANCE
    };
  }

  Pip.serialBuffer = "";
  Pip.isProcessing = false;

  Pip.processBuffer = function() {
    if (Pip.serialBuffer.indexOf('\n') === -1) {
      Pip.isProcessing = false;
      return;
    }
    
    var lines = Pip.serialBuffer.split('\n');
    Pip.serialBuffer = lines.pop(); 
    
    for (var i = 0; i < lines.length; i++) {
      var cmd = lines[i].trim();
      if (cmd.length === 0) continue; 
      
      var parts = cmd.split("|");
      if (parts.length > 1) {
        
        if (parts[0] === "NOTIF") {
          var msg = parts[1], cIdx = msg.indexOf(":"), sender = "UNKNOWN", body = msg;
          if(cIdx > -1) { 
            sender = msg.substring(0, cIdx).trim(); 
            body = msg.substring(cIdx + 1).trim(); 
          }
          Pip.notifications.unshift({title: sender, body: body});
          if(Pip.notifications.length > 5) Pip.notifications.pop();
          
          Pip.showNotification("> INCOMING TRANSMISSION", msg);
          if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink(); 
        }
        else if (parts[0] === "SPOT") {
          Pip.showNotification("> ROBCO MEDIA PLAYER", parts[1]);
        }
        else if (parts[0] === "EXEC") {
          try { eval(parts[1]); } catch(e) {}
        }
        else if (parts[0] === "TIME") {
          var unixSeconds = parseFloat(parts[1]);
          if (!isNaN(unixSeconds)) setTime(unixSeconds);
        }
        else if (parts[0] === "SET") {
          var setMsg = parts[1], setIdx = setMsg.indexOf(":");
          if(setIdx > -1) { 
            var settingKey = setMsg.substring(0, setIdx).trim().toUpperCase(); 
            var settingValue = setMsg.substring(setIdx + 1).trim(); 
            
            if (settingKey === "COLOR") { 
              var colorVal = parseInt(settingValue);
              var r5 = (colorVal >> 11) & 0x1F;
              var g6 = (colorVal >> 5) & 0x3F;
              var b5 = colorVal & 0x1F;
              
              var r = r5 / 31.0;
              var gr = g6 / 63.0;
              var b = b5 / 31.0;
              
              var r8 = Math.round(r * 255);
              var g8 = Math.round(gr * 255);
              var b8 = Math.round(b * 255);
              
              var pal = [new Uint16Array(16), new Uint16Array(16), new Uint16Array(16), new Uint16Array(16)];
              for (var j = 0; j < 16; j++) {
                  pal[0][j] = g.toColor((j/15)*r, (j/15)*gr, (j/15)*b);
                  pal[1][j] = g.toColor((j/30)*r, (j/30)*gr, (j/30)*b);
                  pal[2][j] = g.toColor((j/10)*r, (j/10)*gr, (j/10)*b); 
                  pal[3][j] = g.toColor((j/20)*r, (j/20)*gr, (j/20)*b); 
              }
              if (typeof Pip.setPalette === 'function') Pip.setPalette(pal);
              
              g.theme.fg = colorVal;
              g.theme.fg2 = colorVal;
              if (typeof bC !== 'undefined' && bC.theme) bC.theme.fg = colorVal;
              if (typeof global.fg !== 'undefined') global.fg = colorVal;
              if (typeof global.fg2 !== 'undefined') global.fg2 = colorVal;
              
              if (typeof settings !== 'undefined' && settings.color) {
                settings.color.r = r8;
                settings.color.g = g8;
                settings.color.b = b8;
              }
              
              Pip.showNotification("> THEME OVERRIDE", "Color profile updated.");
              if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink();
            }
            else if (settingKey === "SOUND") { 
              Pip.audioMuted = (settingValue === "OFF"); 
              Pip.showNotification("> AUDIO OVERRIDE", "Speaker status updated.");
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
              if (Pip.notifications[k].title !== clearCmd) {
                filteredInbox.push(Pip.notifications[k]);
              }
            }
            Pip.notifications = filteredInbox;
          }
          if (Pip.currentMenuTitle === "COMMUNICATIONS UPLINK") Pip.submenuUplink(); 
        }
      }
    }
    
    if (Pip.serialBuffer.indexOf('\n') !== -1) {
      setTimeout(Pip.processBuffer, 10);
    } else {
      Pip.isProcessing = false;
    }
  };

  Pip.handleData = function(d) {
    Pip.serialBuffer += d;
    if (Pip.serialBuffer.length > 512) Pip.serialBuffer = ""; 
    if (Pip.serialBuffer.indexOf('\n') !== -1 && !Pip.isProcessing) {
      Pip.isProcessing = true;
      setTimeout(Pip.processBuffer, 10); 
    }
  };

  try { Serial3.on('data', Pip.handleData); } catch(e){}
}

// 3. Kick off the Boot Sequence
initUplinkDaemon();