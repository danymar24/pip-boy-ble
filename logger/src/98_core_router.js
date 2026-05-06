/**
 * UPLINK APP ENGINE (Shared Memory Saver)
 */
Pip.drawApp = function (mode, title, t1, t2) {
    bC.clear(1);
    bC.setColor(g.theme.fg);
    var x = Pip.appScreenXBound / 2;

    bC.drawRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound);
    bC.setFontAlign(0, 0);
    bC.setFont("Vector", 20);
    bC.drawString(title, x, 50);

    if (mode === 0) { // CAMERA (Giant Number)
        bC.setFont("Vector", 80); bC.drawString(t1, x, 120);
        bC.setFont("Vector", 15); bC.drawString(t2, x, 190);
    } else {          // SPOTIFY / MAP (Medium Text)
        bC.setFont("Vector", 30); bC.drawString(t1, x, 110);
        bC.setFont("Vector", 18); bC.drawString(t2, x, 150);
    }
    bC.flip();
};

Pip.loadApp = function(fileName) {
    var path = "USER_BOOT/apps/" + fileName;
    console.log("--- ATTEMPTING TO LOAD: " + path + " ---");
    
    try {
        var fs = require("fs"); 
        
        // ==========================================
        // THE FIX: Force Deep Garbage Collection!
        // This defragments the RAM and guarantees a clean workspace
        // ==========================================
        process.memory(); 
        
        var fileContent = fs.readFile(path);
        
        if (fileContent === undefined || fileContent === null) {
            console.log("ERROR: File not found or Drive is locked by PC.");
            Pip.showNotification("FS ERROR", "Cannot read " + fileName);
            return;
        }
        
        console.log("SUCCESS: File read! Bytes: " + fileContent.length);
        eval(fileContent);
        
    } catch(e) { 
        console.log("CRASH: " + e.message);
        Pip.showNotification("EVAL ERROR", e.message.substring(0, 30)); 
    }
};

/**
 * STAT MENU INJECTION (Removed: Connect, Diagnostics)
 */
if (MODEINFO && MODEINFO[1] && MODEINFO[1].submenu) {
    var orig = MODEINFO[1].submenu;
    var newSub = {};

    newSub["HOME"] = function () { Pip.loadApp("APP_HOME.min.js"); };

    for (var key in orig) {
        var kUp = key.toUpperCase();
        if (kUp === "STATUS") newSub[key] = function () { Pip.loadApp("APP_STATUS.min.js"); };
        else if (kUp !== "" && kUp !== "CONNECT" && kUp !== "DIAGNOSTICS") newSub[key] = orig[key];
    }

    MODEINFO[1].submenu = newSub;
}

/**
 * INV MENU INJECTION (Removed: Apparel, Aid)
 */
if (MODEINFO && MODEINFO[2] && MODEINFO[2].submenu) {
    var orig = MODEINFO[2].submenu;
    var newSub = {};
    if (orig[""]) newSub[""] = orig[""];

    newSub["SHUTTER"] = function () {
        try {
            // Read the app off the SD card and execute it directly into RAM
            eval(fs.readFile("USER_BOOT/apps/APP_CAM.min.js"));
        } catch (e) {
            Pip.showNotification("ERROR", "APP_CAM.min.js NOT FOUND");
        }
    };

    for (var key in orig) {
        var kUp = key.toUpperCase();
        if (kUp !== "" && kUp !== "APPAREL" && kUp !== "AID") newSub[key] = orig[key];
    }
    MODEINFO[2].submenu = newSub;
}

/**
 * DATA MENU INJECTION (Removed: Stats)
 */
if (MODEINFO && MODEINFO[3] && MODEINFO[3].submenu) {
    var orig = MODEINFO[3].submenu;
    var newSub = {};
    if (orig[""]) newSub[""] = orig[""];
    newSub["UPLINK"] = function() { Pip.loadApp("APP_UPLINK.min.js"); };
    for (var key in orig) {
        var kUp = key.toUpperCase();
        if (kUp !== "" && kUp !== "STATS") newSub[key] = orig[key];
    }
    MODEINFO[3].submenu = newSub;

    // MAINTENANCE MENU INJECTOR
    if (typeof MODEINFO[3].submenu["MAINTENANCE"] === 'function') {
        var origMaint = MODEINFO[3].submenu["MAINTENANCE"];
        MODEINFO[3].submenu["MAINTENANCE"] = function () {
            var origShowMenu = E.showMenu;
            E.showMenu = function (menuObj) {
                menuObj["Restart UPLINK"] = function () {
                    try {
                        Serial3.print("SYS|REBOOT\n");
                        if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ENTER.wav");
                        Pip.showNotification("> SYSTEM", "Restarting ESP32...");
                        setTimeout(function () { E.showMenu(menuObj); }, 1500);
                    } catch (e) { }
                };
                menuObj["Calibrate Gyroscope"] = function () {
                    Pip.loadApp("APP_CALIB.min.js");
                };
                menuObj["Uplink Monitor"] = function() { Pip.loadApp("APP_MONITOR.min.js"); };
                E.showMenu = origShowMenu;
                E.showMenu(menuObj);
            };
            origMaint();
        };
    }
}

/**
 * MAP MENU INJECTION (Completely Replaces Native Video)
 */
if (MODEINFO && MODEINFO[4]) {
    MODEINFO[4].fn = function () {
        if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();
        Pip.isMapActive = true;
        Pip.drawApp(1, "SATELLITE UPLINK", "MAP DATA OFFLINE", "AWAITING GPS SYNC...");

        Pip.removeSubmenu = function () {
            Pip.isMapActive = false;
        };
    };
}

/**
 * RADIO MENU INJECTION
 */
if (MODEINFO && MODEINFO[5]) {
    var origRadioFn = MODEINFO[5].fn;
    delete (MODEINFO[5].fn);
    MODEINFO[5].submenu = {
        "SPOTIFY": function () { Pip.loadApp("APP_SPOTIFY.min.js"); },
        "FM": function () {
            if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();
            origRadioFn();
        }
    };
}