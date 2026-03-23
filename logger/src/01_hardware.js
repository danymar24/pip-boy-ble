// --- 2. THE HARDWARE WATCHDOG ---
  Pip.releaseKnob = function () {
    if (typeof Pip.removeSubmenu === 'function') {
      Pip.removeSubmenu();
      Pip.removeSubmenu = null;
    }
  };

  setInterval(function () {
    if (typeof MODE !== 'undefined' && Pip.lastMode !== MODE) {
      Pip.lastMode = MODE;
      Pip.releaseKnob();
      Pip.currentMenuTitle = "";
    }
  }, 500);