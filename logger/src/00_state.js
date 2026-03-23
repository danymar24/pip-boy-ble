// --- THE PIP-BOY BOOTLOADER WRAPPER ---
function initUplinkDaemon() {
    USB.setConsole(true);
    try { Serial3.removeAllListeners('data'); } catch (e) { }

    // --- 1. CORE VARIABLES ---
    if (!Pip.originalFlip) Pip.originalFlip = bC.flip;
    if (!Pip.originalShowMenu) Pip.originalShowMenu = E.showMenu;

    Pip.isNotifActive = false;
    Pip.telemetry = { BIO: "0", WEAT: "---", MOT: "STATIONARY" }; // NEW: Initialize object
    Pip.currentMenuTitle = "";
    Pip.isNotifActive = false;
    Pip.notifHeader = "";
    Pip.notifBody = "";
    Pip.currentMenuTitle = "";
    Pip.lastMode = typeof MODE !== 'undefined' ? MODE : -1;
    if (!Pip.notifications) Pip.notifications = [];

    // --- ALARM STATE MACHINE (Memory) ---
    if (!Pip.alarmState) {
        Pip.alarmState = {
            time: "07:00",
            enabled: false,
            sound: "0",
            repeat: true,
            snoozeTime: null,
            isRinging: false
        };
    }