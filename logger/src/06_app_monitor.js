// ==========================================
// --- APP: UPLINK MONITOR ---
// ==========================================
Pip.serialLogs = ["UPLINK MONITOR INITIALIZED", "Awaiting Serial data..."];
Pip.isMonitorActive = false;
Pip.maxLogs = 11;

Pip.logMonitor = function (msg) {
    var cleanMsg = msg.replace(/\r/g, "").replace(/\n/g, "");
    Pip.serialLogs.push("> " + cleanMsg);
    if (Pip.serialLogs.length > Pip.maxLogs) Pip.serialLogs.shift();
    if (Pip.isMonitorActive) Pip.drawMonitor();
};

Pip.drawMonitor = function () {
    if (!Pip.isMonitorActive) return;
    bC.clear(1);
    bC.setColor(g.theme.fg);

    bC.drawRect(5, 20, Pip.appScreenXBound, Pip.appScreenYBound);
    bC.setFont("Vector", 18);
    bC.setFontAlign(0, 0);
    bC.drawString("RAW TELEMETRY (SERIAL3)", 160, 33);

    bC.drawRect(5, 50, Pip.appScreenXBound, Pip.appScreenYBound);
    bC.setFont("Vector", 12);
    bC.setFontAlign(-1, -1);

    var yPos = 60;
    for (var i = 0; i < Pip.serialLogs.length; i++) {
        bC.drawString(Pip.serialLogs[i], 15, yPos);
        yPos += 14;
    }
    bC.flip();
};

Pip.startMonitorApp = function () {
    Pip.isMonitorActive = true;
    if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();
    var prevRemove = Pip.removeSubmenu;
    Pip.removeSubmenu = function () {
        Pip.isMonitorActive = false;
        if (prevRemove) prevRemove();
    };
    Pip.drawMonitor();
};