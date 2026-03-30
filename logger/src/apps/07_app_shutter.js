// ==========================================
// --- APP: CAMERA SHUTTER ---
// ==========================================
Pip.camTimer = 0;
Pip.isCamActive = false;
Pip.isCountingDown = false;
Pip.camInterval = null;

Pip.drawCamera = function () {
    if (!Pip.isCamActive) return;

    bC.clear(1);
    bC.setColor(g.theme.fg);
    bC.drawRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound); // Lore-accurate frame

    // Header
    bC.setFontAlign(0, 0);
    bC.setFont("Vector", 20);
    bC.drawString("UPLINK CAMERA SHUTTER", Pip.appScreenXBound / 2, 50);

    // The Giant Counter
    bC.setFont("Vector", 80);
    bC.drawString(Pip.camTimer.toString(), Pip.appScreenXBound / 2, 120);

    // Status Text
    bC.setFont("Vector", 15);
    if (Pip.isCountingDown) {
        bC.drawString("AUTO-SEQUENCE INITIATED...", Pip.appScreenXBound / 2, 190);
    } else {
        bC.drawString("TURN DIAL TO SET DELAY", Pip.appScreenXBound / 2, 190);
    }

    bC.flip();
};

Pip.startCameraApp = function () {
    Pip.isCamActive = true;
    Pip.camTimer = 0;
    Pip.isCountingDown = false;

    // Clear previous menu listeners
    if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();

    // --- 1. THE KNOB LOGIC (Set Timer) ---
    Pip.camKnobHandler = function (dir) {
        if (!Pip.isCamActive) return;

        if (Pip.isCountingDown) return; // Lock the dial while the countdown is running

        if (dir > 0) Pip.camTimer++;
        else if (dir < 0 && Pip.camTimer > 0) Pip.camTimer--; // Prevent negative numbers

        Pip.drawCamera();
    };

    // --- 2. THE BUTTON LOGIC (Trigger Shutter) ---
    Pip.camBtnHandler = function () {

        if (!Pip.isCamActive) return;
        // If we are already counting down, pressing the button again cancels it
        if (Pip.isCountingDown) {
            clearInterval(Pip.camInterval);
            Pip.isCountingDown = false;
            Pip.drawCamera();
            return;
        }

        if (Pip.camTimer === 0) {
            // STATE: INSTANT SHUTTER
            Serial3.print("CAM|TAKE\n");

            // Visual & Audio Feedback
            if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
            bC.setColor(0xFFFF); bC.fillRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound); bC.flip(); // Flash screen white
            setTimeout(Pip.drawCamera, 100); // Return to normal UI

        } else {
            // STATE: START COUNTDOWN
            Pip.isCountingDown = true;
            if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
            Pip.drawCamera();

            Pip.camInterval = setInterval(function () {
                Pip.camTimer--;

                if (Pip.camTimer <= 0) {
                    // Timer hit zero! Take the photo!
                    clearInterval(Pip.camInterval);
                    Pip.isCountingDown = false;
                    Pip.camTimer = 0; // Reset for the next shot

                    Serial3.print("CAM|TAKE\n");
                    if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");

                    // Flash screen white
                    bC.setColor(0xFFFF); bC.fillRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound); bC.flip();
                    setTimeout(Pip.drawCamera, 100);
                } else {
                    // Just a normal tick
                    if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
                    Pip.drawCamera();
                }
            }, 1000); // Run exactly once per second
        }
    };


    Pip.camUnifiedHandler = function (d) {
        if (d !== 0) {
            Pip.camKnobHandler(d);
        } else {
            Pip.camBtnHandler();
        }
    };

    // Bind the named function to the Wand OS event
    Pip.on("knob1", Pip.camUnifiedHandler);

    // --- 3. TEARDOWN ---
    var prevRemove = Pip.removeSubmenu;
    Pip.removeSubmenu = function () {
        Pip.isCamActive = false;
        if (Pip.camInterval) clearInterval(Pip.camInterval);

        Pip.removeListener("knob1", Pip.camUnifiedHandler);

        if (prevRemove) prevRemove();
    };

    Pip.drawCamera();
};