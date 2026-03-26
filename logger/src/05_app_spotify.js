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
    bC.drawRect(10, 20, 310, 220);
    bC.setFontAlign(0, 0);

    if (Pip.spotifySong === "") {
        bC.setFont("Vector", 25);
        bC.drawString("NOT PLAYING", 160, 120);
    } else {
        bC.setFont("Vector", 30);
        bC.drawString(Pip.spotifySong, 160, 100);
        bC.setFont("Vector", 18);
        bC.drawString(Pip.spotifyArtist, 160, 140);
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
    pinMode(A1, "input_pullup"); pinMode(E1, "input_pullup"); pinMode(E2, "input_pullup");

    Pip.spotifyDaemon = setInterval(function () {
        try {
            Pip.radioKPSS = false;
            var a1State = digitalRead(A1), e1State = digitalRead(E1), e2State = digitalRead(E2);

            if (a1State === 0 && !Pip.btnPressed) { Pip.btnPressed = true; Serial3.print("SPOT|PAUSE\n"); }
            else if (a1State === 1 && Pip.btnPressed) { Pip.btnPressed = false; }

            if (e1State === 0 && !Pip.e1Pressed) { Pip.e1Pressed = true; Serial3.print("SPOT|NEXT\n"); }
            else if (e1State === 1 && Pip.e1Pressed) { Pip.e1Pressed = false; }

            if (e2State === 0 && !Pip.e2Pressed) { Pip.e2Pressed = true; Serial3.print("SPOT|PREV\n"); }
            else if (e2State === 1 && Pip.e2Pressed) { Pip.e2Pressed = false; }
        } catch (e) { }
    }, 20);

    // Teardown
    var prevRemove = Pip.removeSubmenu;
    Pip.removeSubmenu = function () {
        Pip.isSpotifyActive = false;
        if (Pip.spotifyDaemon) clearInterval(Pip.spotifyDaemon);
        if (origRadioPlayClip) radioPlayClip = origRadioPlayClip;
        if (typeof rd !== 'undefined' && Pip.origRdEnable) rd.enable = Pip.origRdEnable;
        Pip.radioKPSS = Pip.origRadioKPSS;
        if (prevRemove) prevRemove();
    };

    Pip.drawSpotify();
};