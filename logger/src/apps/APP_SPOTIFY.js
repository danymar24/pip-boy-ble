// ==========================================
// --- APP: SPOTIFY ---
// ==========================================

Pip.spotifySong = "";
Pip.spotifyArtist = "";
Pip.isSpotifyActive = false;
Pip.btnPressed = false;
Pip.e1Pressed = false;
Pip.e2Pressed = false;

if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

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

Pip.isSpotifyActive = true;

Pip.origRadioKPSS = Pip.radioKPSS;
Pip.radioKPSS = false;
var origRadioPlayClip = typeof radioPlayClip !== 'undefined' ? radioPlayClip : null;
if (origRadioPlayClip) radioPlayClip = function () { return; };
if (typeof rd !== 'undefined' && !Pip.origRdEnable) {
    Pip.origRdEnable = rd.enable;
    rd.enable = function () { return; };
}

if (Pip.spotifyDaemon) clearInterval(Pip.spotifyDaemon);

pinMode(A1, "input_pullup");
pinMode(E1, "input_pullup");
pinMode(E2, "input_pullup");

Pip.btnPressed = (digitalRead(A1) === 0);
Pip.e1Pressed = (digitalRead(E1) === 0);
Pip.e2Pressed = (digitalRead(E2) === 0);

Pip.spotifyDaemon = setInterval(function () {
    try {
        Pip.radioKPSS = false;

        var a1State = digitalRead(A1);
        var e1State = digitalRead(E1);
        var e2State = digitalRead(E2);

        if (a1State === 0 && !Pip.btnPressed) {
            Pip.btnPressed = true;
            Serial3.print("SPOT|PAUSE\n");
        } else if (a1State === 1 && Pip.btnPressed) {
            Pip.btnPressed = false;
        }

        if (e1State === 0 && !Pip.e1Pressed) {
            Pip.e1Pressed = true;
            Serial3.print("SPOT|NEXT\n");
        } else if (e1State === 1 && Pip.e1Pressed) {
            Pip.e1Pressed = false;
        }

        if (e2State === 0 && !Pip.e2Pressed) {
            Pip.e2Pressed = true;
            Serial3.print("SPOT|PREV\n");
        } else if (e2State === 1 && Pip.e2Pressed) {
            Pip.e2Pressed = false;
        }

    } catch (e) { }
}, 20);

Pip.removeAllListeners("knob1");

Pip.on("knob1", (d) =>
    d !== 0 ? Serial3.write("SPOT|" + (d > 0 ? "UP" : "DOWN") + "\n") : Serial3.write("SPOT|CLICK\n")
);

Pip.removeSubmenu = function () {
    Pip.isSpotifyActive = false;
    Pip.currentMenuTitle = "";
    if (Pip.spotifyDaemon) clearInterval(Pip.spotifyDaemon);
    if (origRadioPlayClip) radioPlayClip = origRadioPlayClip;
    if (typeof rd !== 'undefined' && Pip.origRdEnable) rd.enable = Pip.origRdEnable;
    Pip.radioKPSS = Pip.origRadioKPSS;
    Pip.removeAllListeners("knob1");
    delete Pip.drawSpotify;
    
    Pip.removeSubmenu = null; 
};

Pip.drawSpotify();