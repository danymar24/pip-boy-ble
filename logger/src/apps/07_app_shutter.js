// --- APP: CAMERA SHUTTER ---
Pip.camTimer = 0;
Pip.isCamActive = false;
Pip.isCountingDown = false;
Pip.camInterval = null;

Pip.drawCamera = function () {
    if (!Pip.isCamActive) return;
    Pip.drawApp(0, "UPLINK CAMERA", Pip.camTimer.toString(), Pip.isCountingDown ? "AUTO-SEQUENCE..." : "TURN DIAL TO SET");
};

Pip.startCameraApp = function () {
    Pip.isCamActive = true; Pip.camTimer = 0; Pip.isCountingDown = false;
    if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();

    Pip.camUnifiedHandler = function (d) {
        if (!Pip.isCamActive) return;
        if (d !== 0) {
            if (Pip.isCountingDown) return;
            if (d > 0) Pip.camTimer++; else if (d < 0 && Pip.camTimer > 0) Pip.camTimer--;
            Pip.drawCamera();
        } else {
            if (Pip.isCountingDown) { clearInterval(Pip.camInterval); Pip.isCountingDown = false; Pip.drawCamera(); return; }
            var trigger = function() {
                Serial3.print("CAM|TAKE\n");
                if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
                bC.setColor(0xFFFF); bC.fillRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound); bC.flip();
                setTimeout(Pip.drawCamera, 100);
            };
            if (Pip.camTimer === 0) trigger();
            else {
                Pip.isCountingDown = true;
                if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
                Pip.drawCamera();
                Pip.camInterval = setInterval(function () {
                    Pip.camTimer--;
                    if (Pip.camTimer <= 0) { clearInterval(Pip.camInterval); Pip.isCountingDown = false; Pip.camTimer = 0; trigger(); }
                    else { if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav"); Pip.drawCamera(); }
                }, 1000);
            }
        }
    };

    Pip.on("knob1", Pip.camUnifiedHandler);
    var prevRemove = Pip.removeSubmenu;
    Pip.removeSubmenu = function () {
        Pip.isCamActive = false;
        if (Pip.camInterval) clearInterval(Pip.camInterval);
        Pip.removeListener("knob1", Pip.camUnifiedHandler);
        if (prevRemove) prevRemove();
    };
    Pip.drawCamera();
};