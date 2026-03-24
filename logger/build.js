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

    return new Promise((resolve, reject) => {
        const port = new SerialPort({ path: portPath, baudRate: 115200 });

        port.on('open', async () => {
            console.log("-> Serial port opened. Preparing Pipboy file system...");

            // Helper function to send a command and wait for the SD card to process it
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
                // \x10 turns off the Espruino terminal echo
                await sendCmd('\x10', 100);

                // Step 1: Create/Clear the file on the SD Card
                console.log("-> Initializing daemon.min.js...");
                await sendCmd(`require('fs').writeFileSync('daemon.min.js', '');\n`, 200);

                // Step 2: Append the file in small, safe chunks
                const chunkSize = 256;
                console.log(`-> Writing data in chunks of ${chunkSize} bytes...`);

                for (let i = 0; i < code.length; i += chunkSize) {
                    const chunk = code.substring(i, i + chunkSize);
                    // JSON.stringify safely wraps this specific chunk in quotes and escapes characters
                    const safeChunk = JSON.stringify(chunk);

                    const cmd = `require('fs').appendFileSync('daemon.min.js', ${safeChunk});\n`;
                    await sendCmd(cmd, 30); // 30ms delay gives the SD card time to write

                    // Print a dot to the console so you know it's working
                    process.stdout.write('.');
                }

                console.log("\n-> Upload Complete!");

                // Send a final newline and \x10 to re-enable terminal echo
                await sendCmd('\n\x10', 50);

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