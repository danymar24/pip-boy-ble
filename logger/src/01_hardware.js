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

// --- 4. PHYSICAL LED CONTROLLER (Native State Sync) ---
Pip.targetLED = "YELLOW";

Pip.updateHardwareLEDs = function (dangerLvl) {
    if (dangerLvl > 60) Pip.targetLED = "RED";
    else if (dangerLvl > 15) Pip.targetLED = "YELLOW";
    else Pip.targetLED = "GREEN";
};

if (Pip.ledDaemon) clearInterval(Pip.ledDaemon);
Pip.ledDaemon = setInterval(function () {
    try {
        // 1. NATIVE POWER CHECK: Read the Wand OS true sleep state
        if (Pip.sleeping) {
            E4.write(0); E5.write(0); E6.write(0); // Kill the LEDs
            return; // Yield completely to sleep state
        }

        // 2. CONTEXT CHECK: Only hijack LEDs on our custom dashboard
        if (Pip.currentMenuTitle !== "HOME") return;

        // 3. APPLY COLOR: Aggressively maintain our UI state
        if (Pip.targetLED === "RED") {
            E4.write(1); E5.write(0); E6.write(0);
        } else if (Pip.targetLED === "GREEN") {
            E4.write(0); E5.write(1); E6.write(0);
        } else if (Pip.targetLED === "YELLOW") {
            E4.write(1); E5.write(1); E6.write(0);
        }
    } catch (e) { }
}, 20);