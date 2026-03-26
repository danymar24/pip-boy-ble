

// --- 6. THE SURGICAL MENU INJECTION ---
if (MODEINFO && MODEINFO[1] && MODEINFO[1].submenu) {
    var originalSubmenu = MODEINFO[1].submenu;
    var newSubmenu = {};

    if (originalSubmenu[""]) newSubmenu[""] = originalSubmenu[""];
    newSubmenu["HOME"] = Pip.screenHome;

    for (var key in originalSubmenu) {
        if (key !== "") newSubmenu[key] = originalSubmenu[key];
    }
    MODEINFO[1].submenu = newSubmenu;
}

if (MODEINFO && MODEINFO[3] && MODEINFO[3].submenu) {
    var originalSubmenu = MODEINFO[3].submenu;
    var newSubmenu = {};

    if (originalSubmenu[""]) newSubmenu[""] = originalSubmenu[""];
    newSubmenu["UPLINK"] = Pip.submenuUplink;

    for (var key in originalSubmenu) {
        if (key !== "") newSubmenu[key] = originalSubmenu[key];
    }
    MODEINFO[3].submenu = newSubmenu;
}

// --- 9. MAINTENANCE MENU INJECTION (The Interceptor Pattern) ---
if (MODEINFO && MODEINFO[3] && MODEINFO[3].submenu && typeof MODEINFO[3].submenu["MAINTENANCE"] === 'function') {

    // Store the original Wand OS factory function
    var origMaintenance = MODEINFO[3].submenu["MAINTENANCE"];

    // Overwrite it with our wrapper
    MODEINFO[3].submenu["MAINTENANCE"] = function () {

        // 1. Temporarily hijack the global menu renderer
        var origShowMenu = E.showMenu;

        E.showMenu = function (menuObj) {
            // 2. THE TRAP IS SPRUNG: We now have the dynamically generated 'b' object!

            // Inject our custom command into the menu object
            menuObj["Restart UPLINK"] = function () {
                try {
                    // Assuming Serial3 is your ESP32 UART line
                    Serial3.print("SYS|REBOOT\n");

                    // Provide native UI feedback
                    if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ENTER.wav");
                    Pip.showNotification("> SYSTEM", "Restarting ESP32...");

                    // Return to the Maintenance menu after 1.5 seconds
                    setTimeout(function () { E.showMenu(menuObj); }, 1500);
                } catch (e) { }
            };

            menuObj["Uplink Monitor"] = function () {
                Pip.startMonitorApp();
            };

            // 3. Immediately restore the native renderer so we don't break the rest of the OS
            E.showMenu = origShowMenu;

            // 4. Render the newly modified menu
            E.showMenu(menuObj);
        };

        // 5. Execute the original Wand OS function. 
        // It will build the menu and blindly pass it into our hijacked E.showMenu!
        origMaintenance();
    };
}

// --- 10. RADIO MENU INJECTION (The Interceptor Pattern) ---
if (MODEINFO && MODEINFO[5]) {
    var origRadioFn = MODEINFO[5].fn;
    MODEINFO[5].submenu = {
        "SPOTIFY": function () {
            // Hand control over to our dedicated app state machine
            Pip.startSpotifyApp();
        },
        "FM": function () {
            // Clear the router menu listeners
            if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();

            // Execute the native Wand OS radio builder!
            // This safely boots up the 50ms waveform loop and hardware knobs.
            origRadioFn();
        }
    };
}