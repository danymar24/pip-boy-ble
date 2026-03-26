
// --- 3. MENU PIPELINE (With Safe Context & JIT Injection) ---
E.showMenu = function (menu) {
    Pip.releaseKnob();

    if (menu && menu[""] && menu[""].title) Pip.currentMenuTitle = menu[""].title;
    else Pip.currentMenuTitle = "";

    // JIT INJECTION: Catch the STAT menu right before it hits the screen
    // We identify the STAT menu by checking if it contains the native "STATUS" key
    if (menu && menu["STATUS"] && !menu["HOME"]) {
        var newMenu = {};

        // 1. Preserve the title
        if (menu[""]) newMenu[""] = menu[""];

        // 2. Inject HOME at the top
        if (typeof Pip !== 'undefined' && Pip.screenHome) {
            newMenu["HOME"] = Pip.screenHome;
        }

        // 3. Append the native items (STATUS, SPECIAL, PERKS)
        for (var key in menu) {
            if (key !== "") newMenu[key] = menu[key];
        }

        // 4. Pass our modified clone to the physical display instead of the original
        return Pip.originalShowMenu.call(E, newMenu);
    }

    // For all other menus, behave normally
    return Pip.originalShowMenu.apply(E, arguments);
};

Pip.drawHome = function () {
    bC.clear(1);
    bC.setColor(g.theme.fg); // Lock in the CRT theme color

    // Header
    bC.setFont("Vector", 20).setFontAlign(0, -1);
    bC.drawString("ROBCO OS HOMESCREEN", bC.getWidth() / 2, 15);
    bC.drawLine(20, 38, 364, 38);

    // --- BIOMETRICS SECTION ---
    bC.setFontAlign(-1, -1).setFont("Vector", 18);
    var bpm = (Pip.telemetry && Pip.telemetry.BIO) ? Pip.telemetry.BIO : "---";
    bC.drawString("HEART RATE: " + bpm, 30, 55);

    // --- ENVIRONMENTAL / HAZMAT SECTION ---
    bC.drawLine(20, 85, 364, 85); // Section divider
    bC.drawString("LOCAL ENVIRONMENT:", 30, 95);

    if (Pip.telemetry && Pip.telemetry.WEAT) {
        // 1. Parse the payload (e.g., "72F 45% 12kOhm")
        var envParts = Pip.telemetry.WEAT.split(" ");
        var tempStr = envParts.length > 0 ? envParts[0] : "0F";
        var humStr = envParts.length > 1 ? envParts[1] : "0%";
        var gasStr = envParts.length > 2 ? envParts[2] : "50kOhm"; // 50k is roughly "clean air" baseline

        // 2. Extract raw numbers for the math
        var tVal = parseFloat(tempStr) || 0;
        var hVal = parseFloat(humStr) || 0;
        var gVal = parseFloat(gasStr) || 0;

        bC.setFont("Vector", 16);

        // --- METER 1: TEMPERATURE ---
        bC.drawString("TEMP: " + tempStr, 30, 125);
        var tWidth = Math.max(1, Math.min(100, (tVal / 120) * 100)); // Scale 0-120F
        bC.drawRect(180, 125, 284, 139); // Hollow outline
        bC.fillRect(182, 127, 182 + tWidth, 137); // Solid fill

        // --- METER 2: HUMIDITY ---
        bC.drawString("HUM:  " + humStr, 30, 150);
        var hWidth = Math.max(1, Math.min(100, hVal)); // Scale 0-100%
        bC.drawRect(180, 150, 284, 164);
        bC.fillRect(182, 152, 182 + hWidth, 162);

        // --- METER 3: TOXICITY / RADS & LED ---
        bC.drawString("TOX:  " + gasStr, 30, 175);

        // 1. Bare-metal parse
        var gVal = parseFloat(gasStr);
        if (isNaN(gVal)) gVal = 60; // Fallback to your new safe baseline

        // Auto-scale raw Ohms to kOhms
        if (gVal > 1000) {
            gVal = gVal / 1000;
        }

        // 2. Calculate Danger Level (Calibrated to 60kOhm max)
        // 60kOhm = 0% Danger (Empty Bar). 0kOhm = 100% Danger (Full Bar).
        var dangerLvl = 100 - Math.max(0, Math.min(100, (gVal / 60) * 100));
        var dangerWidth = Math.floor(dangerLvl);

        bC.drawRect(180, 175, 284, 189); // Empty Bar outline

        // 3. Draw the dynamic bar if we have a valid width
        if (dangerWidth > 0 && !isNaN(dangerWidth)) {
            bC.fillRect(182, 177, 182 + dangerWidth, 187);
        }

        // Draw the UI LED and our new Debug Text
        if (dangerLvl > 60) {
            bC.drawString("! CRITICAL !", 180, 200);

        } else if (dangerLvl > 30) {
            bC.drawString("WARNING", 180, 200);

        }
    } else {
        bC.setFont("Vector", 16);
        bC.drawString("SENSORS OFFLINE...", 30, 130);
    }

    bC.flip(); // Push to the physical screen
};

Pip.screenHome = function () {
    Pip.currentMenuTitle = "HOME";
    Pip.drawHome(); // Initial render
};
