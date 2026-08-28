const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const archiver = require('archiver');

// Bảng tra cứu MIME type đầy đủ cho Cocos, Unity WebGL, Phaser, Construct,...
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.data': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.unityweb': 'application/octet-stream',
    '.mem': 'application/octet-stream'
};

/**
 * Nén file bằng Gzip Level 9 và chuyển sang mã Base64
 */
function compressToBase64Gzip(filePath) {
    const data = fs.readFileSync(filePath);
    const compressed = zlib.gzipSync(data, { level: 9 });
    return compressed.toString('base64');
}

/**
 * Đọc tất cả các file trong thư mục theo dạng đệ quy
 */
function getAllFiles(dirPath, arrayOfFiles = [], baseDir = dirPath) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles, baseDir);
        } else {
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            arrayOfFiles.push({ fullPath, relativePath });
        }
    });

    return arrayOfFiles;
}

/**
 * Chuyển đổi file thành Base64 Data URI
 */
function fileToBase64(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Đóng gói tối ưu hóa riêng cho Unity WebGL (Gzip Compression Level 9 + Browser DecompressionStream + Blob URLs)
 */
async function bundleUnityPlayableGzip(gameDir) {
    const files = fs.readdirSync(gameDir);

    let buildDir = path.join(gameDir, 'Build');
    if (!fs.existsSync(buildDir)) {
        buildDir = gameDir;
    }

    const buildFiles = fs.readdirSync(buildDir);

    let dataFile = buildFiles.find(f => f.endsWith('.data'));
    let wasmFile = buildFiles.find(f => f.endsWith('.wasm'));
    let frameworkFile = buildFiles.find(f => f.includes('framework') && f.endsWith('.js'));
    let loaderFile = buildFiles.find(f => f.includes('loader') && f.endsWith('.js'));

    if (!dataFile || !wasmFile || !frameworkFile || !loaderFile) {
        throw new Error('Thiếu cấu trúc file build Unity WebGL (.data, .wasm, .framework.js, .loader.js)!');
    }

    const dataB64Gz = compressToBase64Gzip(path.join(buildDir, dataFile));
    const wasmB64Gz = compressToBase64Gzip(path.join(buildDir, wasmFile));
    const frameworkB64Gz = compressToBase64Gzip(path.join(buildDir, frameworkFile));
    
    // Đọc loaderCode giữ nguyên cấu trúc gốc của Unity (không dùng regex minify gây hỏng cú pháp JS)
    const loaderCode = fs.readFileSync(path.join(buildDir, loaderFile), 'utf8');

    const templateHtml = `<!DOCTYPE html>
<html lang="en-us">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>Unity WebGL Playable Ad (Gzip Optimized)</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #000; font-family: Helvetica, Arial, sans-serif; }
      #unity-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
      #unity-canvas { width: 100% !important; height: 100% !important; display: block; }
      #loading-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #231f20; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 999; transition: opacity 0.5s ease; }
      .spinner { border: 4px solid rgba(255, 255, 255, 0.1); width: 50px; height: 50px; border-radius: 50%; border-left-color: #fff; animation: spin 1s linear infinite; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div id="unity-container">
      <canvas id="unity-canvas" tabindex="-1"></canvas>
      <div id="loading-overlay">
        <div class="spinner"></div>
        <p style="color: white; margin-top: 15px; font-size: 14px;">Loading Playable Ad...</p>
      </div>
    </div>

    <script>
      //__UNITY_LOADER_CODE__
    </script>

    <script>
      // Thuật toán Lookup Table giải mã Base64 cực nhanh, giải phóng bộ nhớ RAM
      function b64ToUint8Array(b64) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
          lookup[chars.charCodeAt(i)] = i;
        }

        let bufferLength = b64.length * 0.75,
            len = b64.length, i, p = 0,
            encoded1, encoded2, encoded3, encoded4;

        if (b64[b64.length - 1] === "=") {
          bufferLength--;
          if (b64[b64.length - 2] === "=") {
            bufferLength--;
          }
        }

        const arrayBuffer = new ArrayBuffer(bufferLength),
              bytes = new Uint8Array(arrayBuffer);

        for (i = 0; i < len; i += 4) {
          encoded1 = lookup[b64.charCodeAt(i)];
          encoded2 = lookup[b64.charCodeAt(i + 1)];
          encoded3 = lookup[b64.charCodeAt(i + 2)];
          encoded4 = lookup[b64.charCodeAt(i + 3)];

          bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
          bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
          bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }

        return bytes;
      }

      async function decompressBlobUrl(b64Data, contentType) {
        const compressedUint8 = b64ToUint8Array(b64Data);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(compressedUint8);
            controller.close();
          }
        });
        const decompressionStream = new DecompressionStream('gzip');
        const decompressedStream = stream.pipeThrough(decompressionStream);
        
        const response = new Response(decompressedStream);
        const blob = await response.blob();
        const finalBlob = new Blob([blob], { type: contentType });
        return URL.createObjectURL(finalBlob);
      }

      async function initPlayable() {
        console.log("⚙️ Decompressing Core Unity Assets safely...");
        try {
          const [dataUrl, wasmUrl, frameworkUrl] = await Promise.all([
            decompressBlobUrl("__UNITY_DATA_B64_GZ__", "application/octet-stream"),
            decompressBlobUrl("__UNITY_WASM_B64_GZ__", "application/wasm"),
            decompressBlobUrl("__UNITY_FRAMEWORK_B64_GZ__", "application/javascript")
          ]);

          const canvas = document.querySelector("#unity-canvas");
          const loadingOverlay = document.querySelector("#loading-overlay");

          const config = {
            dataUrl: dataUrl,
            frameworkUrl: frameworkUrl, 
            codeUrl: wasmUrl,
            streamingAssetsUrl: "StreamingAssets",
            companyName: "DefaultCompany",
            productName: "PlayableAd",
            productVersion: "1.0",
          };

          const script = document.createElement("script");
          script.src = frameworkUrl;
          
          script.onload = () => {
            if (typeof createUnityInstance === 'function') {
              createUnityInstance(canvas, config, (progress) => {})
                .then((unityInstance) => {
                  console.log("🚀 Unity Loaded Successfully!");
                  loadingOverlay.style.opacity = 0;
                  setTimeout(() => loadingOverlay.style.display = "none", 500);
                })
                .catch((err) => { alert("Unity Launch Error: " + err); });
            } else {
              console.error("createUnityInstance is not defined after framework script load");
            }
          };
          document.body.appendChild(script);

        } catch (error) {
          console.error("❌ Lỗi giải nén data:", error);
        }
      }

      // === PLAYABLE AD CTA HANDLER ===
      window.openAppStore = function(customUrl) {
          console.log('[Playable Ad] CTA Clicked');
          if (window.mraid && typeof mraid.open === 'function') {
              mraid.open(customUrl || '');
          } else if (window.FbPlayableAd && typeof FbPlayableAd.onCTAClick === 'function') {
              FbPlayableAd.onCTAClick();
          } else if (window.ExitApi && typeof ExitApi.exit === 'function') {
              ExitApi.exit();
          } else if (customUrl) {
              window.open(customUrl, '_blank');
          } else {
              alert('CTA Clicked! (MRAID / AppStore Link trigger)');
          }
      };

      initPlayable();
    </script>
  </body>
</html>`;

    let outputContent = templateHtml
        .split('//__UNITY_LOADER_CODE__').join(loaderCode)
        .split('__UNITY_DATA_B64_GZ__').join(dataB64Gz)
        .split('__UNITY_WASM_B64_GZ__').join(wasmB64Gz)
        .split('__UNITY_FRAMEWORK_B64_GZ__').join(frameworkB64Gz);

    return outputContent;
}

/**
 * Đóng gói game thành Single-File HTML cho Cocos Creator & HTML5 Games
 */
async function bundleGeneralPlayableHtml(gameDir) {
    const allFiles = getAllFiles(gameDir);

    let indexFile = allFiles.find(f => f.relativePath === 'index.html');
    if (!indexFile) {
        indexFile = allFiles.find(f => f.relativePath.endsWith('.html'));
    }

    if (!indexFile) {
        throw new Error('Không tìm thấy file HTML chính (index.html) trong thư mục game.');
    }

    let htmlContent = fs.readFileSync(indexFile.fullPath, 'utf8');

    const assetsMap = {};
    const jsMap = {};

    allFiles.forEach(file => {
        const ext = path.extname(file.fullPath).toLowerCase();
        if (ext === '.js') {
            jsMap[file.relativePath] = fs.readFileSync(file.fullPath, 'utf8');
        } else if (ext !== '.html' && ext !== '.css') {
            assetsMap[file.relativePath] = fileToBase64(file.fullPath);
        }
    });

    htmlContent = htmlContent.replace(/<link[^>]+rel=["'](?:stylesheet|icon|apple-touch-icon|shortcut icon)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
        const cleanHref = href.split('?')[0];
        const cssFile = allFiles.find(f => f.relativePath === cleanHref || f.relativePath.endsWith(cleanHref));
        if (cssFile) {
            const ext = path.extname(cssFile.fullPath).toLowerCase();
            if (ext === '.css') {
                let cssContent = fs.readFileSync(cssFile.fullPath, 'utf8');
                cssContent = cssContent.replace(/url\((['"]?)([^'")]+)\1\)/gi, (m, quote, urlPath) => {
                    const cleanUrl = urlPath.split('?')[0];
                    const asset = allFiles.find(f => f.relativePath === cleanUrl || f.relativePath.endsWith(cleanUrl));
                    if (asset) {
                        return `url("${fileToBase64(asset.fullPath)}")`;
                    }
                    return m;
                });
                return `<style>\n${cssContent}\n</style>`;
            } else if (assetsMap[cssFile.relativePath]) {
                return `<link rel="shortcut icon" href="${assetsMap[cssFile.relativePath]}"/>`;
            }
        }
        return match;
    });

    htmlContent = htmlContent.replace(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
        const cleanSrc = src.split('?')[0];
        const jsFile = allFiles.find(f => f.relativePath === cleanSrc || f.relativePath.endsWith(cleanSrc));
        if (jsFile) {
            let jsContent = fs.readFileSync(jsFile.fullPath, 'utf8');
            return `<script>\n${jsContent}\n</script>`;
        }
        return match;
    });

    const safeAssetsJson = JSON.stringify(assetsMap).replace(/<\/script/gi, '<\\/script');
    const safeJsJson = JSON.stringify(jsMap).replace(/<\/script/gi, '<\\/script');

    const injectScript = `
<script>
window.__PLAYABLE_ASSETS__ = ${safeAssetsJson};
window.__PLAYABLE_JS__ = ${safeJsJson};

(function() {
    function getCleanPath(url) {
        if (!url || typeof url !== 'string') return '';
        return url.replace(/^\\.\\//, '').replace(/^\\//, '').split('?')[0];
    }

    function b64ToUint8Array(b64) {
        var parts = b64.split(',');
        var str = atob(parts[1] || parts[0]);
        var len = str.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = str.charCodeAt(i);
        }
        return bytes;
    }

    function b64ToText(b64) {
        var parts = b64.split(',');
        return atob(parts[1] || parts[0]);
    }

    function getBase64Asset(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.startsWith('data:')) return url;
        var cleanUrl = getCleanPath(url);
        if (window.__PLAYABLE_ASSETS__[cleanUrl]) return window.__PLAYABLE_ASSETS__[cleanUrl];
        if (window.__PLAYABLE_ASSETS__[url]) return window.__PLAYABLE_ASSETS__[url];
        if (window.__PLAYABLE_JS__[cleanUrl]) {
            try {
                return 'data:application/javascript;base64,' + btoa(unescape(encodeURIComponent(window.__PLAYABLE_JS__[cleanUrl])));
            } catch(e) {}
        }
        return url;
    }

    var origCreateElement = document.createElement;
    document.createElement = function(tagName) {
        var elem = origCreateElement.call(document, tagName);
        if (tagName && tagName.toLowerCase() === 'script') {
            var srcVal = '';
            Object.defineProperty(elem, 'src', {
                get: function() { return srcVal; },
                set: function(val) {
                    srcVal = val;
                    var jsCode = null;
                    var cleanUrl = getCleanPath(val);

                    if (val.startsWith('data:application/javascript;base64,')) {
                        jsCode = b64ToText(val);
                    } else {
                        jsCode = window.__PLAYABLE_JS__[cleanUrl] || window.__PLAYABLE_JS__[val];
                    }

                    if (jsCode) {
                        try {
                            (0, eval)(jsCode);
                        } catch(e) {
                            console.error('[Playable Script Loader] Eval error:', e);
                        }

                        setTimeout(function() {
                            if (typeof elem.onload === 'function') elem.onload();
                            elem.dispatchEvent(new Event('load'));
                        }, 0);
                    }
                }
            });
        }
        return elem;
    };

    var origImageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origImageSrc && origImageSrc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            get: origImageSrc.get,
            set: function(val) {
                origImageSrc.set.call(this, getBase64Asset(val));
            }
        });
    }

    if (window.HTMLAudioElement) {
        var origAudioSrc = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, 'src');
        if (origAudioSrc && origAudioSrc.set) {
            Object.defineProperty(HTMLAudioElement.prototype, 'src', {
                get: origAudioSrc.get,
                set: function(val) {
                    origAudioSrc.set.call(this, getBase64Asset(val));
                }
            });
        }
    }

    if (window.XMLHttpRequest) {
        var origXHR = window.XMLHttpRequest;
        function MockXHR() {
            var xhr = new origXHR();
            var targetUrl = '';
            var targetB64 = null;
            var responseTypeVal = '';

            var origOpen = xhr.open;
            xhr.open = function(method, url, async, user, password) {
                targetUrl = url;
                targetB64 = getBase64Asset(url);
                if (targetB64 && targetB64.startsWith('data:')) {
                } else {
                    origOpen.apply(this, arguments);
                }
            };

            Object.defineProperty(xhr, 'responseType', {
                get: function() { return responseTypeVal; },
                set: function(val) {
                    responseTypeVal = val;
                    try { xhr.__resType = val; } catch(e){}
                }
            });

            var origSend = xhr.send;
            xhr.send = function(body) {
                if (targetB64 && targetB64.startsWith('data:')) {
                    setTimeout(function() {
                        var mime = targetB64.split(';')[0].replace('data:', '');
                        var bytes = b64ToUint8Array(targetB64);
                        var responseVal = null;

                        if (responseTypeVal === 'arraybuffer') {
                            responseVal = bytes.buffer;
                        } else if (responseTypeVal === 'json') {
                            try { responseVal = JSON.parse(b64ToText(targetB64)); } catch(e) { responseVal = {}; }
                        } else if (responseTypeVal === 'blob') {
                            responseVal = new Blob([bytes], { type: mime });
                        } else {
                            responseVal = b64ToText(targetB64);
                        }

                        Object.defineProperty(xhr, 'readyState', { value: 4, writable: true });
                        Object.defineProperty(xhr, 'status', { value: 200, writable: true });
                        Object.defineProperty(xhr, 'statusText', { value: 'OK', writable: true });
                        Object.defineProperty(xhr, 'responseText', { value: (typeof responseVal === 'string' ? responseVal : JSON.stringify(responseVal)), writable: true });
                        Object.defineProperty(xhr, 'response', { value: responseVal, writable: true });

                        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                        if (typeof xhr.onload === 'function') xhr.onload();
                        xhr.dispatchEvent(new Event('load'));
                    }, 0);
                } else {
                    origSend.apply(this, arguments);
                }
            };

            return xhr;
        }
        window.XMLHttpRequest = MockXHR;
    }

    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url);
            var b64 = getBase64Asset(url);
            if (b64 && b64.startsWith('data:')) {
                var mime = b64.split(';')[0].replace('data:', '');
                var bytes = b64ToUint8Array(b64);
                var textStr = b64ToText(b64);
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: {
                        get: function(headerName) {
                            if (!headerName) return null;
                            var h = headerName.toLowerCase();
                            if (h === 'content-length') return String(bytes.length);
                            if (h === 'content-type') return mime;
                            return null;
                        }
                    },
                    body: null,
                    text: function() { return Promise.resolve(textStr); },
                    json: function() { return Promise.resolve(JSON.parse(textStr)); },
                    arrayBuffer: function() { return Promise.resolve(bytes.buffer); },
                    blob: function() { return Promise.resolve(new Blob([bytes], { type: mime })); }
                });
            }
            return origFetch.apply(this, arguments);
        };
    }
})();

window.openAppStore = function(customUrl) {
    console.log('[Playable Ad] CTA Clicked');
    if (window.mraid && typeof mraid.open === 'function') {
        mraid.open(customUrl || '');
    } else if (window.FbPlayableAd && typeof FbPlayableAd.onCTAClick === 'function') {
        FbPlayableAd.onCTAClick();
    } else if (window.ExitApi && typeof ExitApi.exit === 'function') {
        ExitApi.exit();
    } else if (customUrl) {
        window.open(customUrl, '_blank');
    } else {
        alert('CTA Clicked! (MRAID / AppStore Link trigger)');
    }
};
</script>
`;

    if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', `<head>${injectScript}`);
    } else {
        htmlContent = `${injectScript}\n${htmlContent}`;
    }

    return htmlContent;
}

/**
 * Đóng gói game thành tệp ZIP cho Ad Networks
 */
async function bundleZipAd(gameDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(outputPath));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(gameDir, false);
        archive.finalize();
    });
}

/**
 * Kiểm tra xem thư mục có phải là Unity WebGL build hay không
 */
function isUnityBuildDir(gameDir) {
    const files = fs.readdirSync(gameDir);
    let buildDir = gameDir;
    if (files.includes('Build')) {
        buildDir = path.join(gameDir, 'Build');
    }
    if (fs.existsSync(buildDir)) {
        const buildFiles = fs.readdirSync(buildDir);
        const hasData = buildFiles.some(f => f.endsWith('.data'));
        const hasWasm = buildFiles.some(f => f.endsWith('.wasm'));
        if (hasData && hasWasm) return true;
    }
    return false;
}

/**
 * Hàm export chính
 */
async function exportPlayableAd(gameDir, format = 'single-html', outputDir) {
    if (!fs.existsSync(gameDir)) {
        throw new Error('Thư mục game không tồn tại.');
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const folderName = path.basename(gameDir);

    if (format === 'single-html') {
        let htmlContent;
        if (isUnityBuildDir(gameDir)) {
            console.log(`[Playable Exporter] Phát hiện Unity WebGL build cho "${folderName}". Đang áp dụng thuật toán nén Gzip cực hạn + Blob URLs...`);
            htmlContent = await bundleUnityPlayableGzip(gameDir);
        } else {
            console.log(`[Playable Exporter] Áp dụng đóng gói Single-HTML tổng quát cho "${folderName}"...`);
            htmlContent = await bundleGeneralPlayableHtml(gameDir);
        }

        const outputPath = path.join(outputDir, `${folderName}_playable.html`);
        fs.writeFileSync(outputPath, htmlContent, 'utf8');

        const stats = fs.statSync(outputPath);
        const sizeBytes = stats.size;
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

        return {
            filePath: outputPath,
            filename: `${folderName}_playable.html`,
            sizeBytes,
            sizeMB,
            isWithinLimit2MB: sizeBytes <= 2 * 1024 * 1024,
            isWithinLimit5MB: sizeBytes <= 5 * 1024 * 1024,
            format: 'single-html'
        };
    } else if (format === 'zip') {
        const outputPath = path.join(outputDir, `${folderName}_playable.zip`);
        await bundleZipAd(gameDir, outputPath);

        const stats = fs.statSync(outputPath);
        const sizeBytes = stats.size;
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

        return {
            filePath: outputPath,
            filename: `${folderName}_playable.zip`,
            sizeBytes,
            sizeMB,
            isWithinLimit2MB: sizeBytes <= 2 * 1024 * 1024,
            isWithinLimit5MB: sizeBytes <= 5 * 1024 * 1024,
            format: 'zip'
        };
    } else {
        throw new Error('Định dạng xuất bản không hợp lệ (hỗ trợ "single-html" hoặc "zip").');
    }
}

module.exports = {
    exportPlayableAd,
    bundleUnityPlayableGzip,
    bundleGeneralPlayableHtml,
    bundleZipAd
};
