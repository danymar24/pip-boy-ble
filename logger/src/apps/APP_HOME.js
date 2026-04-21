// ==========================================
// --- APP: HOME ---
// ==========================================

Pip.isHomeActive = true;
Pip.currentMenuTitle = "HOME";

// 1. Wipe out any existing hooks immediately
if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

Pip.drawHome = function () {
    if (!Pip.isHomeActive) return;
    
    // THE CPU SAVER: If a notification is on screen, don't waste CPU rendering the background!
    if (Pip.isNotifActive) return; 

    bC.clear(1);
    bC.setColor(g.theme.fg);

    bC.setFont("Vector", 20);
    bC.setFontAlign(0, -1);
    bC.drawString("ROBCO OS HOMESCREEN", 190, 15);
    bC.drawLine(20, 38, 364, 38);

    bC.setFontAlign(-1, -1);
    bC.setFont("Vector", 18);
    var bpm = (Pip.telemetry && Pip.telemetry.BIO) ? Pip.telemetry.BIO : "---";
    bC.drawString("HEART RATE: " + bpm, 30, 55);

    bC.drawLine(20, 85, 364, 85);
    bC.drawString("LOCAL ENVIRONMENT:", 30, 95);

    if (Pip.telemetry && Pip.telemetry.WEAT) {
        var envParts = Pip.telemetry.WEAT.split(" ");
        var tStr = envParts[0] || "0F";
        var hStr = envParts[1] || "0%";
        var gStr = envParts[2] || "50k";

        var tv = parseFloat(tStr) || 0;
        var hv = parseFloat(hStr) || 0;
        var gv = parseFloat(gStr) || 50;

        bC.setFont("Vector", 16);
        bC.drawString("TEMP: " + tStr, 30, 125);
        
        var tw = Math.max(1, Math.min(100, (tv / 120) * 100));
        bC.drawRect(180, 125, 284, 139);
        bC.fillRect(182, 127, 182 + tw, 137);

        bC.drawString("HUM:  " + hStr, 30, 150);
        
        var hw = Math.max(1, Math.min(100, hv));
        bC.drawRect(180, 150, 284, 164);
        bC.fillRect(182, 152, 182 + hw, 162);

        bC.drawString("TOX:  " + gStr, 30, 175);
        
        if (gv > 1000) gv /= 1000;
        var dl = 100 - Math.max(0, Math.min(100, (gv / 60) * 100));
        var dw = Math.floor(dl);

        bC.drawRect(180, 175, 284, 189);
        if (dw > 0 && !isNaN(dw)) bC.fillRect(182, 177, 182 + dw, 187);

        if (dl > 60) bC.drawString("! CRITICAL !", 180, 200);
        else if (dl > 30) bC.drawString("WARNING", 180, 200);

    } else {
        bC.setFont("Vector", 16);
        bC.drawString("SENSORS OFFLINE...", 30, 130);
    }

    bC.flip();
};

// ==========================================
// 2. THE UI HEARTBEAT (1 Frame Per Second)
// ==========================================
Pip.homeHeartbeat = setInterval(Pip.drawHome, 1000);

// 3. The Teardown 
Pip.removeSubmenu = function () {
    Pip.isHomeActive = false;
    Pip.currentMenuTitle = "";

    // Murder the heartbeat so it doesn't bleed into other apps
    if (Pip.homeHeartbeat) {
        clearInterval(Pip.homeHeartbeat);
        Pip.homeHeartbeat = null;
    }

    delete Pip.drawHome;
    Pip.removeSubmenu = null;
};

// Draw once immediately upon loading
Pip.drawHome();