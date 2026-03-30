// ==========================================
// --- APP: SPOTIFY CORE ---
// ==========================================
Pip.spotifySong = "";
Pip.spotifyArtist = "";
Pip.isSpotifyActive = false;
Pip.btnPressed = false;
Pip.e1Pressed = false;
Pip.e2Pressed = false;

Pip.drawSpotify = function () {
    if (!Pip.isSpotifyActive) return;
    bC.clear(1);
    bC.setColor(g.theme.fg);
    bC.drawRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound);
    bC.setFontAlign(0, 0);

    if (Pip.spotifySong === "") {
        bC.setFont("Vector", 25);
        bC.drawString("NOT PLAYING", Pip.appScreenXBound / 2, Pip.appScreenYBound / 2);
    } else {
        bC.setFont("Vector", 30);
        bC.drawString(Pip.spotifySong, Pip.appScreenXBound / 2, Pip.appScreenYBound / 2);
        bC.setFont("Vector", 18);
        bC.drawString(Pip.spotifyArtist, Pip.appScreenXBound / 2, Pip.appScreenYBound / 2 + 40);
    }
    bC.flip();
};

Pip.startSpotifyApp = function () {
    Pip.isSpotifyActive = true;
    if (typeof Pip.removeSubmenu === 'function') Pip.removeSubmenu();

    // Gag Order
    Pip.origRadioKPSS = Pip.radioKPSS;
    Pip.radioKPSS = false;
    var origRadioPlayClip = typeof radioPlayClip !== 'undefined' ? radioPlayClip : null;
    if (origRadioPlayClip) radioPlayClip = function () { return; };
    if (typeof rd !== 'undefined' && !Pip.origRdEnable) {
        Pip.origRdEnable = rd.enable;
        rd.enable = function () { return; };
    }

    // Hardware Polling
    if (Pip.spotifyDaemon) clearInterval(Pip.spotifyDaemon);

    // Explicitly lock all three pins into an input state
    pinMode(A1, "input_pullup");
    pinMode(E1, "input_pullup");
    pinMode(E2, "input_pullup");

    // --- THE FIX: PRIME THE BASELINE STATE ---
    // Read the physical resting state of the pins right now.
    // This prevents the loop from thinking a resting '0' is a new button press.
    Pip.btnPressed = (digitalRead(A1) === 0);
    Pip.e1Pressed = (digitalRead(E1) === 0);
    Pip.e2Pressed = (digitalRead(E2) === 0);

    // Running at 20ms to catch fast rotary dial spins
    Pip.spotifyDaemon = setInterval(function () {
        try {
            Pip.radioKPSS = false;

            var a1State = digitalRead(A1);
            var e1State = digitalRead(E1);
            var e2State = digitalRead(E2);

            // --- BUTTON LOGIC (A1: Play/Pause) ---
            if (a1State === 0 && !Pip.btnPressed) {
                Pip.btnPressed = true;
                Serial3.print("SPOT|PAUSE\n");
            } else if (a1State === 1 && Pip.btnPressed) {
                Pip.btnPressed = false;
            }

            // --- TUNE UP LOGIC (E1: Next Track) ---
            if (e1State === 0 && !Pip.e1Pressed) {
                Pip.e1Pressed = true;
                Serial3.print("SPOT|NEXT\n");
            } else if (e1State === 1 && Pip.e1Pressed) {
                Pip.e1Pressed = false;
            }

            // --- TUNE DOWN LOGIC (E2: Prev Track) ---
            if (e2State === 0 && !Pip.e2Pressed) {
                Pip.e2Pressed = true;
                Serial3.print("SPOT|PREV\n");
            } else if (e2State === 1 && Pip.e2Pressed) {
                Pip.e2Pressed = false;
            }

        } catch (e) { }
    }, 20);

    // Remove any existing listeners so ours is the only one
    Pip.removeAllListeners("knob1");

    // When left knob is rotated or clicked, log the event
    Pip.on("knob1", (d) =>
        d !== 0 ? Serial3.write("SPOT|" + (d > 0 ? "UP" : "DOWN") + "\n") : Serial3.write("SPOT|CLICK\n")
    );

    // Teardown
    var prevRemove = Pip.removeSubmenu;
    Pip.removeSubmenu = function () {
        Pip.isSpotifyActive = false;
        if (Pip.spotifyDaemon) clearInterval(Pip.spotifyDaemon);
        if (origRadioPlayClip) radioPlayClip = origRadioPlayClip;
        if (typeof rd !== 'undefined' && Pip.origRdEnable) rd.enable = Pip.origRdEnable;
        Pip.radioKPSS = Pip.origRadioKPSS;
        Pip.removeAllListeners("knob1");
        if (prevRemove) prevRemove();
    };

    Pip.drawSpotify();
};