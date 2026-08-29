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
 * Đóng gói tối ưu hóa riêng cho Unity WebGL (Gzip Level 9 + Browser DecompressionStream + Blob URLs)
 */
async function bundleUnityPlayableGzip(gameDir) {
    let buildDir = path.join(gameDir, 'Build');
    if (!fs.existsSync(buildDir)) {
        buildDir = gameDir;
    }

    const buildFiles = fs.readdirSync(buildDir);

    let dataFile      = buildFiles.find(f => f.endsWith('.data') || f.endsWith('.data.unityweb'));
    let wasmFile      = buildFiles.find(f => f.endsWith('.wasm') || f.endsWith('.wasm.unityweb'));
    let frameworkFile = buildFiles.find(f => f.includes('framework') && f.endsWith('.js'));
    let loaderFile    = buildFiles.find(f => f.includes('loader') && f.endsWith('.js'));

    if (!dataFile || !wasmFile || !frameworkFile || !loaderFile) {
        throw new Error('Thiếu cấu trúc file build Unity WebGL (.data, .wasm, .framework.js, .loader.js)!');
    }

    console.log('[Playable Exporter] Gzip Level 9 nén dữ liệu Unity...');
    const dataB64Gz      = compressToBase64Gzip(path.join(buildDir, dataFile));
    const wasmB64Gz      = compressToBase64Gzip(path.join(buildDir, wasmFile));
    const frameworkB64Gz = compressToBase64Gzip(path.join(buildDir, frameworkFile));
    const loaderCode     = fs.readFileSync(path.join(buildDir, loaderFile), 'utf8');

    const safeLoader = loaderCode.replace(/<\/script/gi, '<\\/script');

    const templateHtml = `<!DOCTYPE html>
<html lang="en-us">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Unity WebGL Playable Ad</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      #unity-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
      #unity-canvas { width: 100% !important; height: 100% !important; display: block; }
      #loading-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #1a1a1a; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 999; transition: opacity 0.4s ease; }
      .spinner { border: 4px solid rgba(255, 255, 255, 0.15); width: 44px; height: 44px; border-radius: 50%; border-left-color: #3b82f6; animation: spin 0.9s linear infinite; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      #load-progress { color: #e5e7eb; margin-top: 14px; font-size: 14px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div id="unity-container">
      <canvas id="unity-canvas" tabindex="-1"></canvas>
      <div id="loading-overlay">
        <div class="spinner"></div>
        <p id="load-progress">Đang chuẩn bị Playable Ad...</p>
      </div>
    </div>

    <!-- Unity Loader Code -->
    <script>
      ${safeLoader}
    </script>

    <script>
      // Fast Base64 Lookup Table Decoder
      function b64ToUint8Array(b64) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var lut = new Uint8Array(256);
        for (var i = 0; i < chars.length; i++) lut[chars.charCodeAt(i)] = i;
        var bLen = b64.length * 0.75, len = b64.length, p = 0;
        if (b64[len - 1] === '=') { bLen--; if (b64[len - 2] === '=') bLen--; }
        var ab = new ArrayBuffer(bLen), bytes = new Uint8Array(ab);
        for (var i = 0; i < len; i += 4) {
          var e1 = lut[b64.charCodeAt(i)], e2 = lut[b64.charCodeAt(i + 1)],
              e3 = lut[b64.charCodeAt(i + 2)], e4 = lut[b64.charCodeAt(i + 3)];
          bytes[p++] = (e1 << 2) | (e2 >> 4);
          bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
          bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
        }
        return bytes;
      }

      // Native Browser Gzip Decompressor -> Blob URL
      async function decompressBlobUrl(b64Data, contentType) {
        var compressedUint8 = b64ToUint8Array(b64Data);
        var stream = new ReadableStream({
          start: function(controller) {
            controller.enqueue(compressedUint8);
            controller.close();
          }
        });
        var ds = new DecompressionStream('gzip');
        var decompressedStream = stream.pipeThrough(ds);
        var response = new Response(decompressedStream);
        var blob = await response.blob();
        return URL.createObjectURL(new Blob([blob], { type: contentType }));
      }

      var progressEl = document.getElementById('load-progress');

      async function initPlayable() {
        console.log('[Playable] Decompressing Unity Assets via native DecompressionStream...');
        try {
          if (progressEl) progressEl.textContent = 'Đang giải nén tài nguyên...';

          var results = await Promise.all([
            decompressBlobUrl('__UNITY_DATA_B64_GZ__', 'application/octet-stream'),
            decompressBlobUrl('__UNITY_WASM_B64_GZ__', 'application/wasm'),
            decompressBlobUrl('__UNITY_FRAMEWORK_B64_GZ__', 'application/javascript')
          ]);

          var dataUrl      = results[0];
          var wasmUrl      = results[1];
          var frameworkUrl = results[2];

          var canvas = document.querySelector('#unity-canvas');
          var loadingOverlay = document.querySelector('#loading-overlay');

          var config = {
            dataUrl: dataUrl,
            frameworkUrl: frameworkUrl,
            codeUrl: wasmUrl,
            streamingAssetsUrl: 'StreamingAssets',
            companyName: 'DefaultCompany',
            productName: 'PlayableAd',
            productVersion: '1.0'
          };

          var script = document.createElement('script');
          script.src = frameworkUrl;
          script.onload = function() {
            if (typeof createUnityInstance === 'function') {
              createUnityInstance(canvas, config, function(progress) {
                if (progressEl) progressEl.textContent = 'Đang tải trò chơi: ' + Math.round(progress * 100) + '%';
              })
              .then(function(unityInstance) {
                console.log('[Playable] 🚀 Unity Loaded Successfully!');
                if (loadingOverlay) {
                  loadingOverlay.style.opacity = '0';
                  setTimeout(function() { loadingOverlay.style.display = 'none'; }, 400);
                }
              })
              .catch(function(err) {
                console.error('[Playable] Unity launch error:', err);
                alert('Unity Error: ' + err);
              });
            } else {
              console.error('[Playable] createUnityInstance not defined after framework load');
            }
          };
          document.body.appendChild(script);

        } catch (error) {
          console.error('[Playable] ❌ Decompression error:', error);
          if (progressEl) progressEl.textContent = 'Lỗi giải nén: ' + error.message;
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

    const outputContent = templateHtml
        .split('__UNITY_DATA_B64_GZ__').join(dataB64Gz)
        .split('__UNITY_WASM_B64_GZ__').join(wasmB64Gz)
        .split('__UNITY_FRAMEWORK_B64_GZ__').join(frameworkB64Gz);

    return outputContent;
}

/**
 * Đóng gói tối ưu game thành Single-File HTML cho Cocos Creator & HTML5 Games
 * Dùng Gzip Level 9 cho JS/JSON + Browser DecompressionStream API để giải nén runtime
 */
async function bundleGeneralPlayableHtml(gameDir) {
    const allFiles = getAllFiles(gameDir);

    // Bỏ qua các file không cần thiết cho production playable ad
    const SKIP_EXTENSIONS = new Set(['.map', '.md', '.txt', '.DS_Store', '.gitignore', '.npmignore', '.log', '.bat', '.sh']);
    const filteredFiles = allFiles.filter(f => {
        const ext = path.extname(f.fullPath).toLowerCase();
        const base = path.basename(f.fullPath);
        if (SKIP_EXTENSIONS.has(ext)) return false;
        if (base === '.DS_Store' || base === 'Thumbs.db') return false;
        if (f.relativePath.startsWith('__MACOSX/')) return false;
        return true;
    });

    let indexFile = filteredFiles.find(f => f.relativePath === 'index.html');
    if (!indexFile) {
        indexFile = filteredFiles.find(f => f.relativePath.endsWith('.html'));
    }
    if (!indexFile) {
        throw new Error('Không tìm thấy file HTML chính (index.html) trong thư mục game.');
    }

    let htmlContent = fs.readFileSync(indexFile.fullPath, 'utf8');

    // 1. Phân loại tài nguyên
    const staticScriptPaths = new Set();
    const scriptTagRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
    let sm;
    while ((sm = scriptTagRegex.exec(htmlContent)) !== null) {
        const src = sm[1].split('?')[0];
        const jsFile = filteredFiles.find(f =>
            f.relativePath === src ||
            f.relativePath.endsWith('/' + src) ||
            src.endsWith(f.relativePath)
        );
        if (jsFile) {
            staticScriptPaths.add(jsFile.relativePath);
        }
    }

    const COMPRESSIBLE_EXTS = new Set(['.json', '.svg', '.xml', '.atlas', '.plist']);

    const assetsMap = {};     // PNG/JPG/Audio/Font: base64 data URI
    const assetsGzMap = {};   // JSON/SVG/XML: gzip+base64
    const jsGzMap = {};       // Dynamic JS (không static inline): gzip+base64

    filteredFiles.forEach(file => {
        const ext = path.extname(file.fullPath).toLowerCase();
        if (ext === '.html' || ext === '.css') return;

        // Nếu là script tĩnh có sẵn trong index.html -> sẽ được inline trực tiếp
        if (staticScriptPaths.has(file.relativePath)) return;

        if (ext === '.js') {
            jsGzMap[file.relativePath] = compressToBase64Gzip(file.fullPath);
        } else if (COMPRESSIBLE_EXTS.has(ext)) {
            assetsGzMap[file.relativePath] = compressToBase64Gzip(file.fullPath);
        } else {
            assetsMap[file.relativePath] = fileToBase64(file.fullPath);
        }
    });

    // 2. Inline CSS & icon links
    htmlContent = htmlContent.replace(/<link[^>]+rel=["'](?:stylesheet|icon|apple-touch-icon|shortcut icon)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
        const cleanHref = href.split('?')[0];
        const cssFile = filteredFiles.find(f => f.relativePath === cleanHref || f.relativePath.endsWith(cleanHref));
        if (cssFile) {
            const ext = path.extname(cssFile.fullPath).toLowerCase();
            if (ext === '.css') {
                let cssContent = fs.readFileSync(cssFile.fullPath, 'utf8');
                cssContent = cssContent.replace(/url\((['"]?)([^'")(]+)\1\)/gi, (m, quote, urlPath) => {
                    const cleanUrl = urlPath.split('?')[0];
                    const asset = filteredFiles.find(f => f.relativePath === cleanUrl || f.relativePath.endsWith(cleanUrl));
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

    // 3. Inline các static <script src="..."> trực tiếp vào đúng vị trí để giữ nguyên thứ tự thực thi đồng bộ
    htmlContent = htmlContent.replace(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
        const cleanSrc = src.split('?')[0];
        const jsFile = filteredFiles.find(f =>
            f.relativePath === cleanSrc ||
            f.relativePath.endsWith('/' + cleanSrc) ||
            cleanSrc.endsWith(f.relativePath)
        );
        if (jsFile) {
            let jsContent = fs.readFileSync(jsFile.fullPath, 'utf8');
            return `<script>\n${jsContent}\n</script>`;
        }
        return match;
    });

    // 4. Build injection script (Runtime interceptors)
    const safeAssetsJson   = JSON.stringify(assetsMap).replace(/<\/script/gi, '<\\/script');
    const safeAssetsGzJson = JSON.stringify(assetsGzMap).replace(/<\/script/gi, '<\\/script');
    const safeJsGzJson     = JSON.stringify(jsGzMap).replace(/<\/script/gi, '<\\/script');

    const injectScript = `
<script>
// ======== PLAYABLE AD RUNTIME — Gzip Optimized ========
window.__PLAYABLE_ASSETS__    = ${safeAssetsJson};
window.__PLAYABLE_ASSETS_GZ__ = ${safeAssetsGzJson};
window.__PLAYABLE_JS_GZ__     = ${safeJsGzJson};

// --- Gzip Decompressor dùng Browser DecompressionStream API ---
async function __decompressGz__(b64gz) {
    var bytes = Uint8Array.from(atob(b64gz), function(c) { return c.charCodeAt(0); });
    var ds = new DecompressionStream('gzip');
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var reader = ds.readable.getReader();
    var chunks = [];
    while (true) {
        var res = await reader.read();
        if (res.done) break;
        chunks.push(res.value);
    }
    var totalLen = chunks.reduce(function(acc, chunk) { return acc + chunk.length; }, 0);
    var total = new Uint8Array(totalLen);
    var offset = 0;
    for (var i = 0; i < chunks.length; i++) {
        total.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return new TextDecoder().decode(total);
}

// --- Runtime Interceptors (XHR, fetch, Image, Audio, Script) ---
(function () {
    function getCleanPath(url) {
        if (!url || typeof url !== 'string') return '';
        return url.replace(/^\\.\\//,'').replace(/^\\//,'').split('?')[0];
    }

    function b64ToUint8Array(b64) {
        var parts = b64.split(',');
        var str = atob(parts[1] || parts[0]);
        var len = str.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) { bytes[i] = str.charCodeAt(i); }
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
        return url;
    }

    function getGzData(url) {
        var cleanUrl = getCleanPath(url);
        return (window.__PLAYABLE_ASSETS_GZ__[cleanUrl] || window.__PLAYABLE_ASSETS_GZ__[url] ||
                window.__PLAYABLE_JS_GZ__[cleanUrl]     || window.__PLAYABLE_JS_GZ__[url]) || null;
    }

    function isGzJs(url) {
        var cleanUrl = getCleanPath(url);
        return !!(window.__PLAYABLE_JS_GZ__[cleanUrl] || window.__PLAYABLE_JS_GZ__[url]);
    }

    // Script createElement interceptor — hỗ trợ dynamic gzip JS
    var origCreateElement = document.createElement;
    document.createElement = function (tagName) {
        var elem = origCreateElement.call(document, tagName);
        if (tagName && tagName.toLowerCase() === 'script') {
            var srcVal = '';
            Object.defineProperty(elem, 'src', {
                get: function () { return srcVal; },
                set: function (val) {
                    srcVal = val;
                    var gz = getGzData(val);
                    if (gz) {
                        __decompressGz__(gz).then(function (jsCode) {
                            try { (0, eval)(jsCode); } catch (e) { console.error('[Playable] Script eval error:', e); }
                            setTimeout(function () {
                                if (typeof elem.onload === 'function') elem.onload();
                                elem.dispatchEvent(new Event('load'));
                            }, 0);
                        });
                        return;
                    }
                }
            });
        }
        return elem;
    };

    // Image src interceptor
    var origImageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origImageSrc && origImageSrc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            get: origImageSrc.get,
            set: function (val) { origImageSrc.set.call(this, getBase64Asset(val)); }
        });
    }

    // Audio src interceptor
    if (window.HTMLAudioElement) {
        var origAudioSrc = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, 'src');
        if (origAudioSrc && origAudioSrc.set) {
            Object.defineProperty(HTMLAudioElement.prototype, 'src', {
                get: origAudioSrc.get,
                set: function (val) { origAudioSrc.set.call(this, getBase64Asset(val)); }
            });
        }
    }

    // XHR interceptor — hỗ trợ gzip assets và plain base64
    if (window.XMLHttpRequest) {
        var origXHR = window.XMLHttpRequest;
        function MockXHR() {
            var xhr = new origXHR();
            var targetUrl  = '';
            var targetB64  = null;
            var targetGz   = null;
            var responseTypeVal = '';

            var origOpen = xhr.open;
            xhr.open = function (method, url, async, user, password) {
                targetUrl = url;
                targetB64 = getBase64Asset(url);
                if (targetB64 && targetB64.startsWith('data:')) {
                    // plain asset — handle in send
                } else {
                    targetGz = getGzData(url);
                    if (!targetGz) {
                        origOpen.apply(this, arguments);
                    }
                    // gzip asset — handle in send, don't call origOpen
                }
            };

            Object.defineProperty(xhr, 'responseType', {
                get: function () { return responseTypeVal; },
                set: function (val) { responseTypeVal = val; try { xhr.__resType = val; } catch (e) {} }
            });

            var origSend = xhr.send;
            xhr.send = function (body) {
                // --- Gzip asset/JS ---
                if (targetGz) {
                    var _isJs = isGzJs(targetUrl);
                    __decompressGz__(targetGz).then(function (text) {
                        var responseVal;
                        if (responseTypeVal === 'json') {
                            try { responseVal = JSON.parse(text); } catch (e) { responseVal = {}; }
                        } else if (responseTypeVal === 'arraybuffer') {
                            responseVal = new TextEncoder().encode(text).buffer;
                        } else if (responseTypeVal === 'blob') {
                            responseVal = new Blob([text], { type: _isJs ? 'application/javascript' : 'application/json' });
                        } else {
                            responseVal = text;
                        }
                        Object.defineProperty(xhr, 'readyState',   { value: 4,    writable: true });
                        Object.defineProperty(xhr, 'status',       { value: 200,  writable: true });
                        Object.defineProperty(xhr, 'statusText',   { value: 'OK', writable: true });
                        Object.defineProperty(xhr, 'responseText', { value: (typeof responseVal === 'string' ? responseVal : JSON.stringify(responseVal)), writable: true });
                        Object.defineProperty(xhr, 'response',     { value: responseVal, writable: true });
                        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                        if (typeof xhr.onload === 'function') xhr.onload();
                        xhr.dispatchEvent(new Event('load'));
                    }).catch(function (e) {
                        console.error('[Playable XHR] Decompress error:', e);
                    });
                    return;
                }

                // --- Plain base64 asset ---
                if (targetB64 && targetB64.startsWith('data:')) {
                    setTimeout(function () {
                        var mime = targetB64.split(';')[0].replace('data:', '');
                        var bytes = b64ToUint8Array(targetB64);
                        var responseVal;
                        if (responseTypeVal === 'arraybuffer') {
                            responseVal = bytes.buffer;
                        } else if (responseTypeVal === 'json') {
                            try { responseVal = JSON.parse(b64ToText(targetB64)); } catch (e) { responseVal = {}; }
                        } else if (responseTypeVal === 'blob') {
                            responseVal = new Blob([bytes], { type: mime });
                        } else {
                            responseVal = b64ToText(targetB64);
                        }
                        Object.defineProperty(xhr, 'readyState',   { value: 4,    writable: true });
                        Object.defineProperty(xhr, 'status',       { value: 200,  writable: true });
                        Object.defineProperty(xhr, 'statusText',   { value: 'OK', writable: true });
                        Object.defineProperty(xhr, 'responseText', { value: (typeof responseVal === 'string' ? responseVal : JSON.stringify(responseVal)), writable: true });
                        Object.defineProperty(xhr, 'response',     { value: responseVal, writable: true });
                        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                        if (typeof xhr.onload === 'function') xhr.onload();
                        xhr.dispatchEvent(new Event('load'));
                    }, 0);
                    return;
                }

                origSend.apply(this, arguments);
            };

            return xhr;
        }
        window.XMLHttpRequest = MockXHR;
    }

    // Fetch interceptor — hỗ trợ gzip và plain base64
    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url);

            // Gzip asset/JS
            var gz = getGzData(url);
            if (gz) {
                var _isJs = isGzJs(url);
                return __decompressGz__(gz).then(function (text) {
                    var bytes = new TextEncoder().encode(text);
                    var mime = _isJs ? 'application/javascript' : 'application/json';
                    return {
                        ok: true, status: 200, statusText: 'OK',
                        headers: { get: function (h) {
                            if (!h) return null; h = h.toLowerCase();
                            if (h === 'content-type') return mime;
                            if (h === 'content-length') return String(bytes.length);
                            return null;
                        }},
                        body: null,
                        text:        function () { return Promise.resolve(text); },
                        json:        function () { try { return Promise.resolve(JSON.parse(text)); } catch (e) { return Promise.resolve({}); } },
                        arrayBuffer: function () { return Promise.resolve(bytes.buffer); },
                        blob:        function () { return Promise.resolve(new Blob([bytes], { type: mime })); }
                    };
                });
            }

            // Plain base64 asset
            var b64 = getBase64Asset(url);
            if (b64 && b64.startsWith('data:')) {
                var mime = b64.split(';')[0].replace('data:', '');
                var bytes = b64ToUint8Array(b64);
                var textStr = b64ToText(b64);
                return Promise.resolve({
                    ok: true, status: 200, statusText: 'OK',
                    headers: { get: function (h) {
                        if (!h) return null; h = h.toLowerCase();
                        if (h === 'content-length') return String(bytes.length);
                        if (h === 'content-type') return mime;
                        return null;
                    }},
                    body: null,
                    text:        function () { return Promise.resolve(textStr); },
                    json:        function () { return Promise.resolve(JSON.parse(textStr)); },
                    arrayBuffer: function () { return Promise.resolve(bytes.buffer); },
                    blob:        function () { return Promise.resolve(new Blob([bytes], { type: mime })); }
                });
            }

            return origFetch.apply(this, arguments);
        };
    }
})();

// === PLAYABLE AD CTA HANDLER ===
window.openAppStore = function (customUrl) {
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
 * Đóng gói game thành tệp ZIP cho Ad Networks (bỏ source maps & non-essential files)
 */
async function bundleZipAd(gameDir, outputPath) {
    const SKIP_EXTENSIONS = new Set(['.map', '.md', '.txt', '.DS_Store', '.gitignore', '.npmignore', '.log', '.bat', '.sh']);
    const allFiles = getAllFiles(gameDir);
    const filteredFiles = allFiles.filter(f => {
        const ext = path.extname(f.fullPath).toLowerCase();
        const base = path.basename(f.fullPath);
        if (SKIP_EXTENSIONS.has(ext)) return false;
        if (base === '.DS_Store' || base === 'Thumbs.db') return false;
        if (f.relativePath.startsWith('__MACOSX/')) return false;
        return true;
    });

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(outputPath));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        filteredFiles.forEach(file => {
            archive.file(file.fullPath, { name: file.relativePath });
        });
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
