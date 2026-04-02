const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const { SerialPort } = require('serialport');

// --- PATH CONFIGURATION ---
const srcDir = path.join(__dirname, 'src');
const appsDir = path.join(srcDir, 'apps');
const outDir = path.join(__dirname, 'USER_BOOT');
const appsOutDir = path.join(outDir, 'apps');

// Ensure output directories exist
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
if (!fs.existsSync(appsOutDir)) fs.mkdirSync(appsOutDir);

// Standard Terser Config for Wand OS compatibility
const terserConfig = {
    compress: { dead_code: true, drop_console: false, passes: 2 },
    mangle: {
        reserved: [
            'Pip', 'bC', 'g', 'E', 'MODE', 'Serial3', 'USB',
            'checkMode', 'drawFooter', 'drawHeader', 'setTime'
        ]
    },
    format: { comments: false }
};

console.log("RobCo OS Build Pipeline Initialized...");

async function build() {
    // --- PHASE 1: BUNDLE CORE FILES ---
    console.log("\n-> Phase 1: Bundling Core System...");
    
    const coreFiles = fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(item => !item.isDirectory() && item.name.endsWith('.js'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map(item => path.join(srcDir, item.name));

    let coreCode = "";
    coreFiles.forEach(filePath => {
        console.log(`   + Merging Core: ${path.basename(filePath)}`);
        coreCode += fs.readFileSync(filePath, 'utf8') + "\n";
    });

    const minifiedCore = await minify(coreCode, terserConfig);
    const coreOutPath = path.join(outDir, 'daemon.min.js');
    fs.writeFileSync(coreOutPath, minifiedCore.code);
    console.log(`   [!] Core Bundle Saved: ${coreOutPath}`);

    // --- PHASE 2: MINIFY INDIVIDUAL APPS ---
    console.log("\n-> Phase 2: Processing Individual Apps...");
    
    const appFiles = fs.readdirSync(appsDir).filter(f => f.endsWith('.js'));
    const processedApps = [];

    for (const file of appFiles) {
        console.log(`   + Minifying App: ${file}`);
        const appCode = fs.readFileSync(path.join(appsDir, file), 'utf8');
        const minApp = await minify(appCode, terserConfig);
        
        // Remove the XX_ prefix for the output filename if preferred, 
        // or keep it to maintain sort order on the SD card.
        const appOutPath = path.join(appsOutDir, file.replace('.js', '.min.js'));
        fs.writeFileSync(appOutPath, minApp.code);
        
        processedApps.push({
            localPath: appOutPath,
            remotePath: `USER_BOOT/apps/${path.basename(appOutPath)}`
        });
    }

    // --- PHASE 3: DEPLOY TO HARDWARE ---
    console.log("\n-> Phase 3: Deploying to Pip-Boy...");
    
    const portPath = 'COM8';
    const port = new SerialPort({ path: portPath, baudRate: 115200 });

    port.on('open', async () => {
        console.log("-> Serial Connection Established.");
        try {
            // 1. Prepare remote directories
            await sendCmd(port, '\x10', 100);
            await sendCmd(port, `try{require('fs').mkdirSync('USER_BOOT');}catch(e){}\n`, 100);
            await sendCmd(port, `try{require('fs').mkdirSync('USER_BOOT/apps');}catch(e){}\n`, 100);

            // 2. Upload Core
            await uploadFile(port, coreOutPath, 'USER_BOOT/daemon.min.js');

            // 3. Upload Apps
            for (const app of processedApps) {
                await uploadFile(port, app.localPath, app.remotePath);
            }

            console.log("\n-> All Systems Operational. Rebooting...");
            await sendCmd(port, '\n\x10load();\n', 500);
            port.close();
            console.log("Build and Deploy Complete!");

        } catch (err) {
            console.error("\n[!] Deployment Failed:", err);
            port.close();
        }
    });
}

// Reusable command sender
function sendCmd(port, str, delayMs = 50) {
    return new Promise(res => {
        port.write(str, () => {
            port.drain(() => { setTimeout(res, delayMs); });
        });
    });
}

// Reusable file uploader logic
async function uploadFile(port, localPath, remotePath) {
    const code = fs.readFileSync(localPath, 'utf8');
    console.log(`\n-> Uploading ${path.basename(localPath)} to ${remotePath}...`);
    
    await sendCmd(port, `require('fs').writeFileSync('${remotePath}', '');\n`, 200);

    const chunkSize = 256;
    for (let i = 0; i < code.length; i += chunkSize) {
        const chunk = code.substring(i, i + chunkSize);
        const cmd = `require('fs').appendFileSync('${remotePath}', ${JSON.stringify(chunk)});\n`;
        await sendCmd(port, cmd, 30);
        process.stdout.write('.');
    }
    console.log(" [OK]");
}

build();