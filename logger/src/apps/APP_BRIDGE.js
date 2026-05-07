Pip.isBridgeActive = true;
Pip.currentMenuTitle = "SERIAL BRIDGE";

// Clear old hooks safely
if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

Pip.drawBridge = function () {
    if (!Pip.isBridgeActive) return;
    
    bC.clear(1).setColor(g.theme.fg);
    bC.drawRect(10, 20, 370, 194);
    
    bC.setFont("Vector", 20).setFontAlign(0, 0);
    bC.drawString("USB PASSTHROUGH ACTIVE", 190, 45);
    bC.drawLine(20, 60, 360, 60);

    bC.setFont("Vector", 15);
    bC.drawString("ROBCO OS CONSOLE: SUSPENDED", 190, 85);
    bC.drawString("BAUD RATE: 115200", 190, 110);
    
    bC.setFont("Vector", 14);
    bC.drawString("TO UPLOAD:", 190, 140);
    bC.drawString("HIT UPLOAD IN ARDUINO IDE, THEN", 190, 160);
    bC.drawString("HOLD ESP32 'BOOT' UNTIL IT CONNECTS", 190, 180);

    bC.flip();
};

// ==========================================
// THE MAGIC: CONSOLE HIJACK & PIPE
// ==========================================
Pip.startBridge = function() {
    // 1. Unhook our normal telemetry parser so it doesn't eat the upload binary
    Serial3.removeAllListeners('data');

    // 2. Change the baud rate to match the ESP32 Bootloader
    Serial3.setup(115200, { rx: A3, tx: A2, bytesize: 8, parity: 'none', stopbits: 1 });

    // 3. Move the Espruino OS Console into a black hole (Loopback) 
    // so the Arduino IDE binary data doesn't crash the JavaScript engine.
    LoopbackA.setConsole(true);

    // 4. Create the transparent, high-speed pipe
    USB.on('data', function(d) { Serial3.write(d); });
    Serial3.on('data', function(d) { USB.write(d); });
};

// ==========================================
// THE ESCAPE HATCH (Hardware Interrupt)
// ==========================================
// Because we suspended the OS console, the ONLY way out is the physical dial!
Pip.bridgeKnobHandler = function(d) {
    if (d === 0) { // On Click
        if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();
        if (typeof MODEINFO !== 'undefined' && typeof E !== 'undefined') {
            E.showMenu(MODEINFO[3].submenu); // Force back to the DATA menu
        }
    }
};
Pip.on("knob1", Pip.bridgeKnobHandler);

// ==========================================
// TEARDOWN & GARBAGE COLLECTION
// ==========================================
Pip.origBridgeShowMenu = E.showMenu;

Pip.removeSubmenu = function () {
    Pip.isBridgeActive = false;

    // 1. Break the data pipes
    USB.removeAllListeners('data');
    Serial3.removeAllListeners('data');

    // 2. Restore the console so the Espruino Web IDE works again!
    USB.setConsole(true);

    // 3. Restore the Pip-Boy Telemetry settings
    Serial3.setup(9600, { rx: A3, tx: A2, bytesize: 8, parity: 'none', stopbits: 1, rxbuf: 512 });
    if (typeof Pip.handleData === 'function') Serial3.on('data', Pip.handleData);

    // 4. Garbage Collection
    Pip.removeListener("knob1", Pip.bridgeKnobHandler);
    if (Pip.origBridgeShowMenu) E.showMenu = Pip.origBridgeShowMenu;

    delete Pip.drawBridge;
    delete Pip.startBridge;
    delete Pip.bridgeKnobHandler;
    delete Pip.origBridgeShowMenu;
    
    Pip.removeSubmenu = null;
};

// Execute
Pip.drawBridge();
Pip.startBridge();