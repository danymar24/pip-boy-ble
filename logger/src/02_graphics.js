// --- 4. THE FREEZE-FRAME OVERLAY ---

// --- 5. POWER & DIMMING MANAGEMENT ---
Pip.isDimmed = false;
Pip.isAsleep = false;

Pip.setPowerState = function (state) {
    if (state === "WAKE") {
        Pip.isAsleep = false;
        Pip.isDimmed = false;
        // Restore the original palette color if you've been messing with it
        if (typeof settings !== 'undefined' && settings.color) {
            // Force refresh of the global theme 
            Pip.showNotification("> SYSTEM ONLINE", "Biometrics stabilizing...");
        }
    }
    else if (state === "DIM") {
        Pip.isDimmed = true;
        Pip.isAsleep = false;
    }
    else if (state === "SLEEP") {
        Pip.isAsleep = true;
        g.clear().flip(); // Wipe physical display 
    }
};

bC.flip = function (a) {
  if (Pip.isNotifActive) return; // Keep freeze-frame for popups

  // 1. INJECT TELEMETRY INTO THE BACKBUFFER (bC) BEFORE FLIPPING
  if (typeof MODE !== 'undefined' && Pip.telemetry) {
    
    // Use scale 2 (larger text) and force the color to the theme foreground
    bC.setFont("6x8", 2).setColor(g.theme.fg); 
    
    // STAT Tab (Vault-Boy)
    if (MODE === 0 && Pip.telemetry.BIO && Pip.telemetry.BIO !== "WAIT") {
       // Moved X to 160 and Y to 40 to ensure it is dead-center and visible
       bC.drawString("BPM: " + Pip.telemetry.BIO, 160, 40);
    }
    
    // INV Tab (Hazmat)
    if (MODE === 1 && Pip.telemetry.WEAT && Pip.telemetry.WEAT !== "WAIT") {
       bC.drawString("ENV:", 20, 130);
       bC.drawString(Pip.telemetry.WEAT, 20, 150);
    }
  }

  // 2. NOW push the modified frame to the physical display
  return Pip.originalFlip.apply(bC, arguments);
};

Pip.showNotification = function (header, text) {
    Pip.audioStart("UI/ALERT.wav");
    Pip.notifHeader = header;
    Pip.notifBody = text;
    Pip.isNotifActive = true;

    var w = g.getWidth(), h = g.getHeight();
    var x1 = w * 0.1, y1 = h * 0.25, x2 = w * 0.9, y2 = h * 0.75;

    g.setColor(0).fillRect(x1, y1, x2, y2);
    g.setColor(g.theme.fg).drawRect(x1, y1, x2, y2);

    g.setFont("Vector", 20).setFontAlign(0, -1);
    g.drawString(header, w / 2, y1 + 10);
    g.drawLine(x1 + 10, y1 + 35, x2 - 10, y1 + 35);

    g.setFont("Vector", 18).setFontAlign(-1, -1);
    var cx = x1 + 15, cy = y1 + 45;
    for (var i = 0; i < text.length; i++) {
        if (text[i] === '\n' || text[i] === '\r') continue;
        g.drawString(text[i], cx, cy);
        cx += 14;
        if (cx > x2 - 15) { cx = x1 + 15; cy += 24; }
        if (cy > y2 - 20) break;
    }

    g.setFontAlign(-1, -1);
    g.setFont("6x8", 1);

    if (Pip.notifTimeout) clearTimeout(Pip.notifTimeout);
    Pip.notifTimeout = setTimeout(function () {
        Pip.isNotifActive = false;
        bC.flip();
    }, 5000);
};