const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const { SerialPort } = require('serialport');

// --- PATH CONFIGURATION ---
const srcDir = path.join(__dirname, 'src');
const appsDir = path.join(srcDir, 'apps');
const outDir = path.join(__dirname, 'USER_BOOT');
const outputFile = path.join(outDir, 'daemon.min.js');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

console.log("RobCo OS Build Pipeline Initialized...");

async function build() {
    const fileList = [];

    // 1. Collect Core Files from /src/ (00, 01, 02, 98, 99)
    const coreFiles = fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(item => !item.isDirectory() && item.name.endsWith('.js'))
        .map(item => ({
            name: item.name,
            fullPath: path.join(srcDir, item.name)
        }));

    // 2. Collect App Files from /src/apps/ (03, 04, 05, etc.)
    let appFiles = [];
    if (fs.existsSync(appsDir)) {
        appFiles = fs.readdirSync(appsDir)
            .filter(f => f.endsWith('.js'))
            .map(f => ({
                name: f,
                fullPath: path.join(appsDir, f)
            }));
    }

    // 3. Combine and Sort by the XX_ prefix
    const allFiles = [...coreFiles, ...appFiles].sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    console.log(`-> Detected ${allFiles.length} files for the build sequence.`);

    let combinedCode = "";

    // 4. Merge content
    allFiles.forEach(file => {
        console.log(`-> Merging: ${file.name}`);
        combinedCode += fs.readFileSync(file.fullPath, 'utf8') + "\n";
    });

    console.log("-> Running Terser Minification...");

    try {
        const minified = await minify(combinedCode, {
            compress: {
                dead_code: true,
                drop_console: false, // Keep consoles for ESP32-S3 USB debugging
                passes: 2
            },
            mangle: {
                // Protecting native Wand OS hooks
                reserved: [
                    'Pip', 'bC', 'g', 'E', 'MODE', 'Serial3', 'USB',
                    'checkMode', 'drawFooter', 'drawHeader', 'setTime'
                ]
            },
            format: {
                comments: false 
            }
        });

        fs.writeFileSync(outputFile, minified.code);

        const originalSize = Buffer.byteLength(combinedCode, 'utf8');
        const newSize = Buffer.byteLength(minified.code, 'utf8');
        const savings = ((1 - (newSize / originalSize)) * 100).toFixed(2);

        console.log(`\nBuild Complete!`);
        console.log(`Original Size : ${originalSize} bytes`);
        console.log(`Minified Size : ${newSize} bytes (-${savings}%)`);
        
        // Upload to the Pip-Boy hardware
        await uploadToPipboy(minified.code, 'COM8');

    } catch (err) {
        console.error("Minification Failed:", err);
    }
}

// ... (uploadToPipboy remains unchanged)
async function uploadToPipboy(code, portPath) {
    console.log(`\n-> Initiating Upload to Pipboy on ${portPath}...`);
    const targetPath = 'USER_BOOT/daemon.min.js';

    return new Promise((resolve, reject) => {
        const port = new SerialPort({ path: portPath, baudRate: 115200 });
        port.on('open', async () => {
            const sendCmd = (str, delayMs = 50) => {
                return new Promise(res => {
                    port.write(str, () => {
                        port.drain(() => { setTimeout(res, delayMs); });
                    });
                });
            };

            try {
                await sendCmd('\x10', 100);
                await sendCmd(`try{require('fs').mkdirSync('USER_BOOT');}catch(e){}\n`, 100);
                await sendCmd(`require('fs').writeFileSync('${targetPath}', '');\n`, 200);

                const chunkSize = 256;
                for (let i = 0; i < code.length; i += chunkSize) {
                    const chunk = code.substring(i, i + chunkSize);
                    const safeChunk = JSON.stringify(chunk);
                    await sendCmd(`require('fs').appendFileSync('${targetPath}', ${safeChunk});\n`, 30);
                    process.stdout.write('.');
                }

                console.log("\n-> Upload Complete! Rebooting RobCo OS...");
                await sendCmd('\n\x10load();\n', 500);
                port.close();
                resolve();
            } catch (err) {
                console.error("\n[!] Upload interrupted.");
                reject(err);
            }
        });

        port.on('error', (err) => {
            console.error(`\n[!] Serial Port Error: ${err.message}`);
            reject(err);
        });
    });
}

build();