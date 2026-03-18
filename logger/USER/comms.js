USB.setConsole();
g.setFontAlign(-1, -1); 

function drawInterface(header, bodyText) {
  g.clear();
  g.setColor("#14FF14");
  g.setFont("Vector", 18);
  g.drawString(header, 30, 40);
  g.drawLine(30, 60, 290, 60);
  
  g.setFont("Vector", 15);
  var cx = 60;
  var cy = 80;
  for(var i=0; i < bodyText.length; i++) {
    if(bodyText[i] === '\\n' || bodyText[i] === '\\r') continue; 
    
    g.drawString(bodyText[i], cx, cy);
    cx += 12;
    if(cx > 260) { cx = 30; cy += 20; }
    if(cy > 220) break; 
  }
}

function processCommand(cmd) {
  var parts = cmd.split("|");
  if (parts.length > 1) {
    if (parts[0] === "NOTIF") drawInterface("> INCOMING TRANSMISSION", parts[1]);
    else if (parts[0] === "SPOT") drawInterface("> ROBCO MEDIA PLAYER", parts[1]);
    else drawInterface("> SYSTEM LOG", cmd);
  } else {
    drawInterface("> SYSTEM LOG", cmd);
  }
}

var serialBuffer = "";
var timeout;

function handleData(d) {
  serialBuffer += d;
  
  if (timeout) clearTimeout(timeout);
  
  // Wait 200ms after the last character arrives, then process the whole chunk
  timeout = setTimeout(function() {
    processCommand(serialBuffer.trim());
    serialBuffer = ""; // Reset for the next message
  }, 200);
}

// Bring back the Omni-Net! Listen to every possible port.
try { Serial1.on('data', handleData); } catch(e){}
try { Serial2.on('data', handleData); } catch(e){}
try { Serial3.on('data', handleData); } catch(e){}
try { Serial4.on('data', handleData); } catch(e){}

drawInterface("> UPLINK STANDBY", "Awaiting Bluetooth telemetry...");

setWatch(function() {
  try { Serial1.removeAllListeners('data'); } catch(e){}
  try { Serial2.removeAllListeners('data'); } catch(e){}
  try { Serial3.removeAllListeners('data'); } catch(e){}
  try { Serial4.removeAllListeners('data'); } catch(e){}
  g.clear(); 
  load();
}, BTN4, { repeat: false, edge: 'falling' });