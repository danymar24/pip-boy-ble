Pip.isSpotifyActive = true;
Pip.currentMenuTitle = "SPOTIFY UPLINK";

// 1. Wipe out any existing hooks immediately 
if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

// Ensure string defaults if data hasn't arrived yet
if (!Pip.spotifySong) Pip.spotifySong = "NOT PLAYING";
if (!Pip.spotifyArtist) Pip.spotifyArtist = "";

Pip.drawSpotify = function () {
    if (!Pip.isSpotifyActive) return;
    bC.clear(1);
    bC.setColor(g.theme.fg);
    bC.drawRect(10, 20, Pip.appScreenXBound, Pip.appScreenYBound);
    bC.setFontAlign(0, 0);

    if (Pip.spotifySong === "" || Pip.spotifySong === "NOT PLAYING") {
        bC.setFont("Vector", 25);
        bC.drawString("NOT PLAYING", Pip.appScreenXBound / 2, 120);
    } else {
        bC.setFont("Vector", 30);
        bC.drawString(Pip.spotifySong, Pip.appScreenXBound / 2, 100);
        bC.setFont("Vector", 18);
        bC.drawString(Pip.spotifyArtist, Pip.appScreenXBound / 2, 140);
    }
    bC.flip();
};

// ==========================================
// MUTE THE NATIVE RADIO
// ==========================================
Pip.origRadioKPSS = Pip.radioKPSS; 
Pip.radioKPSS = false;
Pip.origRadioPlayClip = typeof radioPlayClip !== 'undefined' ? radioPlayClip : null;
if (Pip.origRadioPlayClip) radioPlayClip = function () { return; };
if (typeof rd !== 'undefined' && !Pip.origRdEnable) { 
    Pip.origRdEnable = rd.enable; 
    rd.enable = function () { return; }; 
}

// ==========================================
// THE FIX: HARDWARE INTERRUPTS
// ==========================================
pinMode(A1, "input_pullup"); 
pinMode(E1, "input_pullup"); 
pinMode(E2, "input_pullup");

// Instead of a 20ms loop, these sit completely idle until the button is physically pushed.
// "debounce: 50" prevents the physical metal spring in the button from registering double-clicks.
Pip.wA1 = setWatch(function() { Serial3.print("SPOT|PAUSE\n"); }, A1, { repeat: true, edge: "falling", debounce: 50 });
Pip.wE1 = setWatch(function() { Serial3.print("SPOT|NEXT\n"); }, E1, { repeat: true, edge: "falling", debounce: 50 });
Pip.wE2 = setWatch(function() { Serial3.print("SPOT|PREV\n"); }, E2, { repeat: true, edge: "falling", debounce: 50 });

// Handle the top dial turning and clicking
Pip.removeAllListeners("knob1");
Pip.on("knob1", (d) => d !== 0 ? Serial3.write("SPOT|" + (d > 0 ? "UP" : "DOWN") + "\n") : Serial3.write("SPOT|CLICK\n"));

// ==========================================
// TEARDOWN & GARBAGE COLLECTION
// ==========================================
Pip.removeSubmenu = function () {
    Pip.isSpotifyActive = false;
    Pip.currentMenuTitle = "";

    // 1. Destroy the hardware interrupt tripwires
    clearWatch(Pip.wA1);
    clearWatch(Pip.wE1);
    clearWatch(Pip.wE2);
    Pip.removeAllListeners("knob1");

    // 2. Restore the native radio functionality
    if (Pip.origRadioPlayClip) radioPlayClip = Pip.origRadioPlayClip;
    if (typeof rd !== 'undefined' && Pip.origRdEnable) rd.enable = Pip.origRdEnable;
    Pip.radioKPSS = Pip.origRadioKPSS;

    // 3. Clear RAM
    delete Pip.drawSpotify;
    delete Pip.wA1;
    delete Pip.wE1;
    delete Pip.wE2;
    delete Pip.origRadioPlayClip;
    delete Pip.origRadioKPSS;
    delete Pip.origRdEnable;

    Pip.removeSubmenu = null;
};

Pip.drawSpotify();