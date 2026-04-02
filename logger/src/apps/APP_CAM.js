// --- DYNAMICALLY LOADED CAMERA APP ---
Pip.cT = 0; Pip.cA = !0; Pip.cC = !1; Pip.cI = null;

Pip.drawCam = function () {
  if (!Pip.cA) return;
  Pip.drawApp(0, "UPLINK CAMERA", Pip.cT.toString(), Pip.cC ? "AUTO-SEQUENCE..." : "TURN DIAL TO SET");
};

if (typeof Pip.removeSubmenu === 'function') {
  Pip.removeSubmenu();
  Pip.removeSubmenu = null;
}

Pip.camHnd = function (d) {
  if (!Pip.cA) return;
  if (d !== 0) {
    if (Pip.cC) return;
    if (d > 0) Pip.cT++; else if (Pip.cT > 0) Pip.cT--;
    Pip.drawCam();
  } else {
    if (Pip.cC) { clearInterval(Pip.cI); Pip.cC = !1; Pip.drawCam(); return; }
    var fire = function () {
      Serial3.print("CAM|TAKE\n");
      if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav");
      bC.setColor(65535); bC.fillRect(10, 20, 380, 204); bC.flip();
      setTimeout(Pip.drawCam, 100);
    };
    if (Pip.cT === 0) fire();
    else {
      Pip.cC = !0; if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav"); Pip.drawCam();
      Pip.cI = setInterval(function () {
        Pip.cT--;
        if (Pip.cT <= 0) { clearInterval(Pip.cI); Pip.cC = !1; Pip.cT = 0; fire(); }
        else { if (typeof Pip.audioStart === 'function') Pip.audioStart("UI/ROW.wav"); Pip.drawCam(); }
      }, 1000);
    }
  }
};

Pip.on("knob1", Pip.camHnd);

Pip.removeSubmenu = function () {
  Pip.currentMenuTitle = "";

  Pip.cA = !1;if (Pip.cI) clearInterval(Pip.cI);
  Pip.removeListener("knob1", Pip.camHnd);

  // ==========================================
  // THE JANITOR: Erase the app from RAM!
  // ==========================================
  delete Pip.drawCam;
  delete Pip.camHnd;
  delete Pip.cT;
  delete Pip.cA;
  delete Pip.cC;
  delete Pip.cI;

  Pip.removeSubmenu = null;
};

Pip.drawCam();