Pip.isBridgeActive = true;
Pip.currentMenuTitle = "OTA UPLINK";

if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

Pip.drawBridge = function () {
    if (!Pip.isBridgeActive) return;
    bC.clear(1).setColor(g.theme.fg);
    bC.drawRect(10, 20, 370, 194);
    
    bC.setFont("Vector", 20).setFontAlign(0, 0);
    bC.drawString("WIFI OTA UPLINK ACTIVE", 190, 45);
    bC.drawLine(20, 60, 360, 60);
    
    bC.setFont("Vector", 15);
    bC.drawString("ESP32 RADIO: TRANSMITTING", 190, 95);
    bC.drawString("NETWORK: WAITING FOR IDE...", 190, 125);
    
    bC.setFont("Vector", 14);
    bC.drawString("FLASH WIRELESSLY FROM PC.", 190, 160);
    bC.flip();
};

// 1. Send the trigger command at the standard 9600 baud rate
Serial3.print("SYS|UPLOAD\n");

// 2. The Escape Hatch
Pip.bridgeKnobHandler = function(d) {
    if (d === 0) { 
        if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();
        if (typeof MODEINFO !== 'undefined' && typeof E !== 'undefined') {
            E.showMenu(MODEINFO[3].submenu); 
        }
    }
};

Pip.on("knob1", Pip.bridgeKnobHandler);
Pip.origBridgeShowMenu = E.showMenu;

// 3. Teardown & Garbage Collection
Pip.removeSubmenu = function () {
    Pip.isBridgeActive = false;
    
    // Nudge the ESP32 to restart and exit OTA mode if you cancel
    Serial3.print("SYS|REBOOT\n"); 

    Pip.removeListener("knob1", Pip.bridgeKnobHandler);
    if (Pip.origBridgeShowMenu) E.showMenu = Pip.origBridgeShowMenu;

    delete Pip.drawBridge;
    delete Pip.bridgeKnobHandler;
    delete Pip.origBridgeShowMenu;
    Pip.removeSubmenu = null;
};

Pip.drawBridge();