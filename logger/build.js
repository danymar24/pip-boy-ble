const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

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

    } catch (err) {
        console.error("Minification Failed:", err);
    }
}

build();