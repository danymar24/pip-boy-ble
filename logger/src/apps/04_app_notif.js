
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
