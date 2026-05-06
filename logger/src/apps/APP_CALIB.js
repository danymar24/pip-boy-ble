Pip.isCalibActive = true;
Pip.currentMenuTitle = "GYRO CALIBRATION";
Pip.calibState = 0; // 0: Waiting, 1: Scanning, 2: Success

// Clear old hooks safely
if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

Pip.drawCalib = function () {
    if (!Pip.isCalibActive) return;
    
    bC.clear(1).setColor(g.theme.fg);
    bC.drawRect(10, 20, 370, 194);
    
    bC.setFont("Vector", 20).setFontAlign(0, 0);
    bC.drawString("INERTIAL SENSOR SYNC", 190, 45);
    bC.drawLine(20, 60, 360, 60);

    bC.setFont("Vector", 16);
    if (Pip.calibState === 0) {
        bC.drawString("1. REMOVE DEVICE FROM WRIST", 190, 95);
        bC.drawString("2. PLACE FLAT ON LEVEL SURFACE", 190, 125);
        bC.drawString("CLICK TO BEGIN SENSOR SYNC", 190, 165);
    } 
    else if (Pip.calibState === 1) {
        bC.drawString("SYNCING ROTATION MATRICES...", 190, 110);
        bC.drawString("DO NOT MOVE DEVICE", 190, 140);
    } 
    else if (Pip.calibState === 2) {
        bC.drawString("CALIBRATION SUCCESSFUL", 190, 110);
        bC.drawString("NEW BASELINE ESTABLISHED", 190, 140);
    }
    bC.flip();
};

// ==========================================
// THE TRIGGER LOGIC
// ==========================================
Pip.calibKnobHandler = function (d) {
    // Only trigger if clicked (0) and we are in the waiting state
    if (d === 0 && Pip.calibState === 0) {
        Pip.calibState = 1;
        Pip.drawCalib();
        
        // Command the ESP32 to calculate the new angle
        Serial3.print("SYS|CALIB\n");
        if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
        
        // Simulate a 1.5 second UI delay so the user knows it's "working"
        setTimeout(function() {
            if (!Pip.isCalibActive) return;
            Pip.calibState = 2;
            Pip.drawCalib();
            if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/BURST.wav");
        }, 1500);
    }
};

Pip.on("knob1", Pip.calibKnobHandler);

// ==========================================
// TEARDOWN & GARBAGE COLLECTION
// ==========================================
Pip.origCalibShowMenu = E.showMenu;

Pip.removeSubmenu = function () {
    Pip.isCalibActive = false;
    Pip.currentMenuTitle = "";

    Pip.removeListener("knob1", Pip.calibKnobHandler);
    if (Pip.origCalibShowMenu) E.showMenu = Pip.origCalibShowMenu;

    delete Pip.drawCalib;
    delete Pip.calibKnobHandler;
    delete Pip.calibState;
    delete Pip.origCalibShowMenu;
    
    Pip.removeSubmenu = null;
};

Pip.drawCalib();