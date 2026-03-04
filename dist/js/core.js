// =========== GLOBALS ===========
var detectedOS = "unknown";
var daemonRunning = false;
var currentConfig = {};
var PROXY_URL = "https://mjmdhqglpratbyzmgndm.supabase.co/functions/v1/github-release-proxy";

// =========== KEY VISIBILITY TOGGLE ===========
// Defined early and on window so inline onclick handlers in static HTML can reach it immediately.
window.toggleKeyVisibility = function(inputId, btnElement) {
    var input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        btnElement.textContent = "🙈";
    } else {
        input.type = "password";
        btnElement.textContent = "👁️";
    }
};

// Safe version for dynamically-created inputs that are passed directly (not by id).
window.toggleKeyVisibilityEl = function(inputEl, btnElement) {
    if (!inputEl) return;
    if (inputEl.type === "password") {
        inputEl.type = "text";
        btnElement.textContent = "🙈";
    } else {
        inputEl.type = "password";
        btnElement.textContent = "👁️";
    }
};

// =========== SESSION ID ===========
var SESSION_ID = (function() {
    var d = new Date();
    var pad = function(n) { return n < 10 ? "0" + n : "" + n; };
    var hex = Math.random().toString(16).substring(2, 8);
    return "session-" + d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "-" + hex;
})();
var LOG_FOLDER = "~/.bambooclaw/logs/";
var LOG_FILE_PATH = LOG_FOLDER + SESSION_ID + ".log";

setTimeout(function() {
    var lbl = document.getElementById("session-id-label");
    if (lbl) lbl.textContent = SESSION_ID;
    var pathEl = document.getElementById("log-path-display");
    if (pathEl) pathEl.value = LOG_FILE_PATH;
    var aboutVer = document.getElementById("about-version");
    var appVer = document.getElementById("app-version");
    if (aboutVer && appVer) aboutVer.textContent = appVer.textContent;
    var copyrightEl = document.getElementById("about-copyright");
    if (copyrightEl) copyrightEl.textContent = "© " + new Date().getFullYear() + " Bamboo Synergy Technologies, Inc.";
}, 0);

// =========== TOAST ===========
function showToast(message, type) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(function() {
        t.style.animation = "slideOut 0.3s ease forwards";
        setTimeout(function() { t.remove(); }, 300);
    }, 3000);
}

// =========== TAURI HELPERS ===========
function tauriInvoke(cmd, args) {
    if (!window.__TAURI__) return Promise.reject(new Error("Tauri not available (running in browser)"));
    var inv = (window.__TAURI__.core && window.__TAURI__.core.invoke)
           || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)
           || window.__TAURI__.invoke;
    if (typeof inv === "function") return inv(cmd, args || {});
    if (typeof window.__TAURI__.transformCallback === "function" && typeof window.__TAURI_IPC__ === "function") {
        return new Promise(function(resolve, reject) {
            var cbId = window.__TAURI__.transformCallback(function(r) { resolve(r); }, true);
            var errId = window.__TAURI__.transformCallback(function(e) { reject(e); }, true);
            var payload = Object.assign({ cmd: cmd, callback: cbId, error: errId }, args || {});
            window.__TAURI_IPC__(payload);
        });
    }
    return Promise.reject(new Error("Tauri invoke not found."));
}
function invokeShort(cmd, args) {
    return Promise.race([
        tauriInvoke(cmd, args),
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error("Timeout: " + cmd)); }, 8000); })
    ]);
}
function invokeLong(cmd, args, ms) {
    return Promise.race([
        tauriInvoke(cmd, args),
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error("Timeout: " + cmd)); }, ms || 600000); })
    ]);
}

// =========== LOGGING ===========
function copyLog(logId) {
    try {
        var el = document.getElementById(logId);
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(function() {
            showToast("Log copied to clipboard", "success");
        }).catch(function() {
            var ta = document.createElement("textarea");
            ta.value = el.textContent;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            showToast("Log copied to clipboard", "success");
        });
    } catch(e) {
        console.error("[copyLog error]", e);
    }
}

function appendLog(logId, line) {
    try {
        var now = new Date();
        var ts = "[" + ("0"+now.getHours()).slice(-2) + ":" + ("0"+now.getMinutes()).slice(-2) + ":" + ("0"+now.getSeconds()).slice(-2) + "." + ("00"+now.getMilliseconds()).slice(-3) + "]";
        var taggedLine = ts + " " + line;

        var logLevel = (currentConfig.settings && currentConfig.settings.loglevel) || "info";
        var shouldShow = true;
        if (logLevel === "error") {
            shouldShow = /ERROR|FAIL|EXCEPTION/i.test(line);
        } else if (logLevel === "warn") {
            shouldShow = /ERROR|FAIL|EXCEPTION|WARN|WARNING/i.test(line);
        } else if (logLevel === "info") {
            shouldShow = !/^\[DEBUG\]/i.test(line);
        }

        var el = document.getElementById(logId);
        if (el && el.style.display !== "none" && shouldShow) {
            el.textContent += taggedLine + "\n";
            el.scrollTop = el.scrollHeight;
        }

        var unified = document.getElementById("unified-log");
        if (unified && shouldShow && logId !== "unified-log") {
            unified.textContent += taggedLine + "\n";
            unified.scrollTop = unified.scrollHeight;
        }

        if (window.__TAURI__) {
            try {
                tauriInvoke("run_shell_command", {
                    commandName: detectedOS === "windows" ? "cmd" : "sh",
                    args: detectedOS === "windows"
                        ? ["/C", "mkdir \"" + LOG_FOLDER.replace("~/", "%USERPROFILE%\\") + "\" 2>nul & echo " + taggedLine.replace(/"/g, '\\"').replace(/&/g, "^&").replace(/[<>|]/g, "") + " >> \"" + LOG_FILE_PATH.replace("~/", "%USERPROFILE%\\") + "\""]
                        : ["-c", "mkdir -p " + LOG_FOLDER.replace("~", "$HOME") + " && echo " + JSON.stringify(taggedLine) + " >> " + LOG_FILE_PATH.replace("~", "$HOME")]
                }).catch(function(){});
            } catch(e) {}
        }
    } catch(e) {
        console.error("[appendLog error]", e);
    }
}

// =========== HTML HELPERS ===========
function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMarkdownToHtml(str) {
    var s = escapeHtml(str);
    var BT = String.fromCharCode(96);
    s = s.replace(/^### (.+)$/gm, '<h4 style="margin:0.6em 0 0.3em;font-size:0.95em;color:var(--accent);">$1</h4>');
    s = s.replace(/^## (.+)$/gm, '<h3 style="margin:0.7em 0 0.3em;font-size:1.05em;color:var(--accent);">$1</h3>');
    s = s.replace(/^# (.+)$/gm, '<h2 style="margin:0.8em 0 0.4em;font-size:1.15em;color:var(--accent);">$1</h2>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var codeRe = new RegExp(BT + '([^' + BT + ']+)' + BT, 'g');
    s = s.replace(codeRe, '<code style="background:rgba(0,255,136,0.1);padding:0.1em 0.4em;border-radius:3px;font-size:0.9em;">$1</code>');
    s = s.replace(/^[\*\-] (.+)$/gm, '<li style="margin-left:1.2em;list-style:disc;">$1</li>');
    s = s.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:1.2em;list-style:decimal;">$1</li>');
    s = s.replace(/((<li[^>]*>.*<\/li>\s*)+)/g, '<ul style="margin:0.3em 0;padding-left:0.5em;">$1</ul>');
    s = s.replace(/\n/g, '<br>');
    s = s.replace(/<br>\s*(<h[234]|<ul|<\/ul>)/g, '$1');
    s = s.replace(/(<\/h[234]>|<\/ul>)\s*<br>/g, '$1');
    return s;
}

function stripMarkdownForTelegram(str) {
    if (!str) return "";
    return str
        .replace(/```[\s\S]*?```/g, function(m) {         // fenced code blocks → keep content, strip fences
            return m.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
        })
        .replace(/`([^`]+)`/g, "$1")                      // inline code
        .replace(/^#{1,6}\s+/gm, "")                      // headings
        .replace(/\*\*\*(.+?)\*\*\*/g, "$1")              // bold+italic
        .replace(/\*\*(.+?)\*\*/g, "$1")                  // bold
        .replace(/\*(.+?)\*/g, "$1")                      // italic *
        .replace(/_(.+?)_/g, "$1")                        // italic _
        .replace(/~~(.+?)~~/g, "$1")                      // strikethrough
        .replace(/^\s*[-*+]\s+/gm, "• ")                  // unordered lists → bullet
        .replace(/^\s*\d+\.\s+/gm, function(m, o, s) {   // ordered lists → keep number
            return m.trim() + " ";
        })
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")          // links → label only
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")         // images → alt text
        .replace(/^>\s+/gm, "")                           // blockquotes
        .replace(/^[-*_]{3,}\s*$/gm, "──────────")        // horizontal rules
        .replace(/\n{3,}/g, "\n\n")                       // collapse excess blank lines
        .trim();
}

// =========== PASSWORD FIELD BUILDER ===========
// Creates a password input + eye button pair as DOM elements (no inline onclick).
function buildPasswordField(inputId, placeholder, value) {
    var wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;background:#050507;overflow:hidden;";

    var input = document.createElement("input");
    input.type = "password";
    input.id = inputId;
    input.placeholder = placeholder || "";
    input.value = value || "";
    input.style.cssText = "border:none;border-radius:0;outline:none;background:transparent;flex:1;padding:0.75rem;";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.style.cssText = "border:none;border-radius:0;padding:0.75rem;height:100%;border-left:1px solid var(--border);";
    btn.textContent = "👁️";
    btn.addEventListener("click", function() {
        window.toggleKeyVisibilityEl(input, btn);
    });

    wrapper.appendChild(input);
    wrapper.appendChild(btn);
    return wrapper;
}