// --- ALARM BACKGROUND CRON ---
function zPad(n) { return (n < 10 ? '0' : '') + n; }

Pip.triggerAlarm = function () {
    var sounds = ["UI/ALARM.wav", "UI/ALERT.wav", "UI/WARNING.wav"];
    var sIdx = parseInt(Pip.alarmState.sound);
    if (isNaN(sIdx) || sIdx < 0 || sIdx >= sounds.length) sIdx = 0;

    Pip.audioStart(sounds[sIdx]);
    Pip.showNotification("> WAKE UP", "ALARM TRIGGERED AT " + Pip.alarmState.time);
};

if (Pip.alarmInterval) clearInterval(Pip.alarmInterval);
Pip.alarmInterval = setInterval(function () {
    if (!Pip.alarmState.enabled) return;

    var d = new Date();
    var current = zPad(d.getHours()) + ":" + zPad(d.getMinutes());

    if (current === Pip.alarmState.time || current === Pip.alarmState.snoozeTime) {
        if (!Pip.alarmState.isRinging) {
            Pip.alarmState.isRinging = true;
            Pip.alarmState.snoozeTime = null;
            Pip.triggerAlarm();

            if (!Pip.alarmState.repeat && current === Pip.alarmState.time) {
                Pip.alarmState.enabled = false;
            }
            setTimeout(function () { Pip.alarmState.isRinging = false; }, 61000);
        }
    }
}, 10000);

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

// --- 5. NATIVE INBOX UI ---
Pip.readNotification = function (idx) {
    Pip.releaseKnob();
    Pip.currentMenuTitle = "READING_MESSAGE";
    var n = Pip.notifications[idx];
    bC.clear(1);
    bC.setColor(g.theme.fg).setFont("Vector", 20).setFontAlign(-1, -1);
    bC.drawString("FROM: " + n.title, 20, 20).drawLine(20, 45, 380, 45);
    bC.setFont("Vector", 18);
    var cx = 20, cy = 60;
    for (var i = 0; i < n.body.length; i++) {
        if (n.body[i] === '\n' || n.body[i] === '\r') continue;
        bC.drawString(n.body[i], cx, cy);
        cx += 14;
        if (cx > 370) { cx = 20; cy += 24; }
        if (cy > 160) break;
    }
    bC.drawLine(20, 175, 380, 175).drawString("Click: DELETE   Scroll: BACK", 20, 185);
    bC.setFont("6x8", 1);
    bC.flip();

    var knobHandler = function (dir) {
        Pip.releaseKnob();
        if (dir === 0) {
            Pip.notifications.splice(idx, 1);
            Pip.audioStart("UI/CANCEL.wav");
        } else {
            Pip.audioStart("UI/ROT_V_1.wav");
        }
        Pip.submenuUplink();
    };
    Pip.on('knob1', knobHandler);
    Pip.removeSubmenu = function () { Pip.removeListener('knob1', knobHandler); };
};

Pip.submenuUplink = function () {
    Pip.releaseKnob();
    var menu = { "": { title: "COMMUNICATIONS UPLINK" } };
    if (Pip.notifications.length === 0) {
        menu["NO MESSAGES"] = function () { };
    } else {
        Pip.notifications.forEach(function (n, idx) {
            menu[(idx + 1) + ". " + n.title] = function () { Pip.readNotification(idx); };
        });
        menu["CLEAR ALL"] = function () {
            Pip.notifications = [];
            Pip.audioStart("UI/CANCEL.wav");
            Pip.submenuUplink();
        };
    }
    E.showMenu(menu);
};


// --- 7. HOME DASHBOARD SCREEN ---
Pip.drawHome = function () {
    bC.clear(1); // Wipe the buffer clean

    // Header
    bC.setColor(g.theme.fg).setFont("Vector", 20).setFontAlign(0, -1);
    bC.drawString("ROBCO OS HOMESCREEN", bC.getWidth() / 2, 20);
    bC.drawLine(20, 45, 364, 45);

    // Fallbacks if telemetry isn't ready
    var bpm = (Pip.telemetry && Pip.telemetry.BIO) ? Pip.telemetry.BIO : "AWAITING SIGNAL";
    var env = (Pip.telemetry && Pip.telemetry.WEAT) ? Pip.telemetry.WEAT : "ANALYZING...";

    // Data Readouts
    bC.setFontAlign(-1, -1).setFont("Vector", 18);
    bC.drawString("HEART RATE:   " + bpm, 30, 80);
    bC.drawString("ENVIRONMENT:  " + env, 30, 130);

    bC.flip(); // Push to the physical screen
};

Pip.screenHome = function () {
    Pip.currentMenuTitle = "HOME";
    Pip.drawHome(); // Initial render
};


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