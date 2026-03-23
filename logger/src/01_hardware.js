// --- 2. THE HARDWARE WATCHDOG ---
Pip.releaseKnob = function () {
    if (typeof Pip.removeSubmenu === 'function') {
        Pip.removeSubmenu();
        Pip.removeSubmenu = null;
    }
};

setInterval(function () {
    if (typeof MODE !== 'undefined' && Pip.lastMode !== MODE) {
        Pip.lastMode = MODE;
        Pip.releaseKnob();
        Pip.currentMenuTitle = "";
    }
}, 500);

// --- 4. PHYSICAL LED CONTROLLER (Aggressive Override) ---
Pip.targetLED = "YELLOW"; // Default state

Pip.updateHardwareLEDs = function (dangerLvl) {
    if (dangerLvl > 60) {
        Pip.targetLED = "RED";
    } else if (dangerLvl > 15) {
        Pip.targetLED = "YELLOW";
    } else {
        Pip.targetLED = "GREEN";
    }
};

// The Override Daemon: Runs continuously to defeat the C-Engine's lock
if (Pip.ledDaemon) clearInterval(Pip.ledDaemon);
Pip.ledDaemon = setInterval(function () {
    try {
        if (Pip.targetLED === "RED") {
            E4.write(1); E5.write(0); E6.write(0);
        }
        else if (Pip.targetLED === "GREEN") {
            E4.write(0); E5.write(1); E6.write(0);
        }
        else if (Pip.targetLED === "YELLOW") {
            E4.write(1); E5.write(1); E6.write(0);
        }
    } catch (e) { }
}, 20); // Re-apply our color every 20ms