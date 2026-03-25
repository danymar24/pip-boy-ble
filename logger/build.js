const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const { SerialPort } = require('serialport');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'USER_BOOT');
const outputFile = path.join(outDir, 'daemon.min.js');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
files.sort();

console.log("RobCo OS Build Pipeline Initialized...");

async function build() {
    let combinedCode = "";

    files.forEach(file => {
        console.log(`-> Merging: ${file}`);
        combinedCode += fs.readFileSync(path.join(srcDir, file), 'utf8') + "\n";
    });

    console.log("-> Running Terser Minification...");

    try {
        const minified = await minify(combinedCode, {
            compress: {
                dead_code: true,
                drop_console: false, // Keep consoles if you are debugging over USB
                passes: 2
            },
            mangle: {
                // CRITICAL: Do not let Terser rename the native Wand OS hooks!
                reserved: [
                    'Pip', 'bC', 'g', 'E', 'MODE', 'Serial3', 'USB',
                    'checkMode', 'drawFooter', 'drawHeader', 'setTime'
                ]
            },
            format: {
                comments: false // Strip all comments to save bytes
            }
        });

        fs.writeFileSync(outputFile, minified.code);

        const originalSize = Buffer.byteLength(combinedCode, 'utf8');
        const newSize = Buffer.byteLength(minified.code, 'utf8');
        const savings = ((1 - (newSize / originalSize)) * 100).toFixed(2);

        console.log(`\nBuild Complete!`);
        console.log(`Original Size : ${originalSize} bytes`);
        console.log(`Minified Size : ${newSize} bytes (-${savings}%)`);
        console.log(`Output saved to: ${outputFile}`);

        await uploadToPipboy(minified.code, 'COM8');

    } catch (err) {
        console.error("Minification Failed:", err);
    }
}

async function uploadToPipboy(code, portPath) {
    console.log(`\n-> Initiating Upload to Pipboy on ${portPath}...`);

    // Define the exact path on the Pipboy's SD card
    const targetPath = 'USER_BOOT/daemon.min.js';

    return new Promise((resolve, reject) => {
        const port = new SerialPort({ path: portPath, baudRate: 115200 });

        port.on('open', async () => {
            console.log("-> Serial port opened. Preparing Pipboy file system...");

            const sendCmd = (str, delayMs = 50) => {
                return new Promise(res => {
                    port.write(str, () => {
                        port.drain(() => {
                            setTimeout(res, delayMs);
                        });
                    });
                });
            };

            try {
                await sendCmd('\x10', 100);

                // Ensure the USER_BOOT directory exists before trying to write to it
                // We wrap it in a try/catch so it doesn't crash if the folder is already there
                console.log("-> Checking directories...");
                await sendCmd(`try{require('fs').mkdirSync('USER_BOOT');}catch(e){}\n`, 100);

                // Use the targetPath variable
                console.log(`-> Initializing ${targetPath}...`);
                await sendCmd(`require('fs').writeFileSync('${targetPath}', '');\n`, 200);

                const chunkSize = 256;
                console.log(`-> Writing data in chunks of ${chunkSize} bytes...`);

                for (let i = 0; i < code.length; i += chunkSize) {
                    const chunk = code.substring(i, i + chunkSize);
                    const safeChunk = JSON.stringify(chunk);

                    // Use the targetPath variable here too
                    const cmd = `require('fs').appendFileSync('${targetPath}', ${safeChunk});\n`;
                    await sendCmd(cmd, 30);

                    process.stdout.write('.');
                }

                console.log("\n-> Upload Complete! Rebooting RobCo OS...");

                // Send \x10 to re-enable echo, then load() to trigger the soft reboot
                await sendCmd('\n\x10load();\n', 500);

                // We use a 500ms delay above so the command fully transmits 
                // before Node.js forcefully closes the serial connection.
                port.close();
                resolve();

            } catch (err) {
                console.error("\n[!] Upload interrupted.");
                reject(err);
            }
        });

        port.on('error', (err) => {
            console.error(`\n[!] Serial Port Error: ${err.message}`);
            console.error("[!] Double-check that VSCode or the Web IDE is disconnected from the port.");
            reject(err);
        });
    });
}

build();