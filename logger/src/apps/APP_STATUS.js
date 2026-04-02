Pip.isStatusActive = false;

if (typeof Pip.removeSubmenu === 'function') {
    Pip.removeSubmenu();
    Pip.removeSubmenu = null;
}

Pip.drawStatus = function () {
    Pip.isStatusActive = true;



    const c = {
        x: 137,
        y: 65,
        repeat: !0
    };
    Pip.videoStart(`STAT/VB01.avi`, c);
}

Pip.removeSubmenu = function () {
    Pip.isStatusActive = false;
    Pip.currentMenuTitle = "";

    if (typeof Pip.videoStop === 'function') {
        Pip.videoStop();
    }
    delete Pip.drawStatus;

    Pip.removeSubmenu = null;
};

Pip.drawStatus();
