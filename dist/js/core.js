// =========== GLOBALS ===========
var detectedOS = "unknown";
var daemonRunning = false;
var currentConfig = {};
var PROXY_URL = "https://mjmdhqglpratbyzmgndm.supabase.co/functions/v1/github-release-proxy";

// =========== EYE ICON TOGGLE (Fixed via Event Delegation) ===========
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.toggle-password-btn');
    if (btn) {
        var targetId = btn.getAttribute('data-target');
        var input = document.getElementById(targetId);
        if (input) {
            if (input.type === "password") {
                input.type = "text";
                btn.textContent = "🙈";
            } else {
                input.type = "password";
                btn.textContent = "👁️";
            }
        }
    }
});

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
        if (el) {
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
        }
    } catch(e) { console.error("[copyLog error]", e); }
}

function appendLog(logId, line) {
    try {
        var now = new Date();
        var ts = "[" + ("0"+now.getHours()).slice(-2) + ":" + ("0"+now.getMinutes()).slice(-2) + ":" + ("0"+now.getSeconds()).slice(-2) + "." + ("00"+now.getMilliseconds()).slice(-3) + "]";
        var taggedLine = ts + " " + line;

        var logLevel = (currentConfig.settings && currentConfig.settings.loglevel) || "info";
        var shouldShow = true;
        if (logLevel === "error") shouldShow = /ERROR|FAIL|EXCEPTION/i.test(line);
        else if (logLevel === "warn") shouldShow = /ERROR|FAIL|EXCEPTION|WARN|WARNING/i.test(line);
        else if (logLevel === "info") shouldShow = !/^\[DEBUG\]/i.test(line);

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
    } catch(e) { console.error("[appendLog error]", e); }
}

// =========== FORMATTING HELPERS ===========
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    return str.replace(/^###+ (.+)$/gm, '\u25b8 $1');
}

// =========== CONFIG SERIALIZATION ===========
function buildConfigToml() {
    var lines = ["# BambooClaw Agent Configuration", "# Auto-generated by BambooClaw Companion", ""];

    if (currentConfig.llm) {
        lines.push("[llm]");
        if (currentConfig.llm.provider) lines.push('provider = ' + JSON.stringify(currentConfig.llm.provider));
        if (currentConfig.llm.api_key) lines.push('api_key = ' + JSON.stringify(currentConfig.llm.api_key));
        if (currentConfig.llm.model) lines.push('model = ' + JSON.stringify(currentConfig.llm.model));
        if (currentConfig.llm.system_prompt != null) lines.push('system_prompt = ' + JSON.stringify(currentConfig.llm.system_prompt));
        lines.push("");
    }

    if (currentConfig.channels) {
        Object.keys(currentConfig.channels).forEach(function(ch) {
            lines.push("[channels." + ch + "]");
            var c = currentConfig.channels[ch];
            Object.keys(c).forEach(function(k) {
                lines.push(k + ' = ' + JSON.stringify(c[k] || ""));
            });
            lines.push("");
        });
    }

    if (currentConfig.settings) {
        lines.push("[agent]");
        var s = currentConfig.settings;
        if (s.autonomy) lines.push('autonomy = ' + JSON.stringify(s.autonomy));
        if (s.port) lines.push("gateway_port = " + s.port);
        if (s.tunnel) lines.push('tunnel = ' + JSON.stringify(s.tunnel));
        if (s.identity) lines.push('identity = ' + JSON.stringify(s.identity));
        if (s.runtime) lines.push('runtime = ' + JSON.stringify(s.runtime));
        if (s.loglevel) lines.push('log_level = ' + JSON.stringify(s.loglevel));
        if (currentConfig.composioApiKey) lines.push('composio_api_key = ' + JSON.stringify(currentConfig.composioApiKey));
        lines.push("");
    }

    return lines.join("\n");
}

async function loadConfig() {
    appendLog("dash-log", "[CONFIG] loadConfig() started...");
    try {
        var raw = await invokeShort("read_config");
        appendLog("dash-log", "[CONFIG] Loaded from disk successfully. Length: " + raw.length);
        showToast("Configuration loaded from disk", "info");
        parseAndApplyConfig(raw);
    } catch(e) {
        appendLog("dash-log", "[CONFIG] Failed to read from disk: " + (e.message || e));
        var saved = localStorage.getItem("bambooclaw-config");
        if (saved) {
            appendLog("dash-log", "[CONFIG] Falling back to localStorage data.");
            try {
                currentConfig = JSON.parse(saved);
                applyConfigToUI();
            } catch(e2) { appendLog("dash-log", "[CONFIG] LocalStorage parse error."); }
        }
    }
}

function parseAndApplyConfig(toml) {
    var lines = toml.split("\n");
    var section = "";
    lines.forEach(function(line) {
        line = line.trim();
        if (!line || line.startsWith("#")) return;
        var secMatch = line.match(/^\[(.+)\]$/);
        if (secMatch) { section = secMatch[1]; return; }
        
        var kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
        if (kvMatch) {
            var key = kvMatch[1], valRaw = kvMatch[2].trim();
            var val = valRaw;
            if (valRaw.startsWith('"')) {
                try { val = JSON.parse(valRaw); } catch(e) { val = valRaw.replace(/^"|"$/g, ''); }
            } else if (!isNaN(valRaw)) {
                val = Number(valRaw);
            }
            
            if (section === "llm") {
                if (!currentConfig.llm) currentConfig.llm = {};
                currentConfig.llm[key] = String(val);
            }
            if (section.startsWith("channels.")) {
                var ch = section.replace("channels.", "");
                if (!currentConfig.channels) currentConfig.channels = {};
                if (!currentConfig.channels[ch]) currentConfig.channels[ch] = {};
                currentConfig.channels[ch][key] = String(val);
            }
            if (section === "agent") {
                if (key === "composio_api_key") currentConfig.composioApiKey = String(val);
                else {
                    if (!currentConfig.settings) currentConfig.settings = {};
                    currentConfig.settings[key] = String(val);
                }
            }
        }
    });
    applyConfigToUI();
}

function applyConfigToUI() {
    if (currentConfig.llm) {
        if (currentConfig.llm.provider) {
            document.getElementById("llm-provider").value = currentConfig.llm.provider;
            document.getElementById("llm-provider").dispatchEvent(new Event("change"));
        }
        if (currentConfig.llm.api_key) document.getElementById("llm-api-key").value = currentConfig.llm.api_key;
        if (currentConfig.llm.model) {
            setTimeout(function() { 
                var sel = document.getElementById("llm-model");
                if (sel) sel.value = currentConfig.llm.model; 
                if (currentConfig.llm.provider === "openrouter") {
                    orSelectedModel = currentConfig.llm.model;
                    var nameEl = document.getElementById("or-active-model-name");
                    if (nameEl) nameEl.textContent = currentConfig.llm.model;
                    setTimeout(renderORModels, 200); 
                }
            }, 50);
        }
        if (currentConfig.llm.system_prompt != null) {
            var sp = document.getElementById("settings-system-prompt");
            if (sp) sp.value = currentConfig.llm.system_prompt;
        }
    }
    if (currentConfig.channels) {
        if (currentConfig.channels.telegram) document.getElementById("tg-status").textContent = "Token: " + currentConfig.channels.telegram.token.substring(0, 8) + "...";
        if (currentConfig.channels.discord) document.getElementById("dc-status").textContent = "Token: " + currentConfig.channels.discord.token.substring(0, 8) + "...";
    }
    if (currentConfig.settings) {
        var s = currentConfig.settings;
        if (s.autonomy) document.getElementById("set-autonomy").value = s.autonomy;
        if (s.port || s.gateway_port) document.getElementById("set-port").value = s.port || s.gateway_port;
        if (s.tunnel) document.getElementById("set-tunnel").value = s.tunnel;
        if (s.runtime) document.getElementById("set-runtime").value = s.runtime;
        if (s.loglevel || s.log_level) document.getElementById("set-loglevel").value = s.loglevel || s.log_level;
        
        if (s.identity !== undefined && typeof activePersonaIndex !== 'undefined') {
            var identVal = parseInt(s.identity);
            activePersonaIndex = !isNaN(identVal) ? identVal : -1;
            var identEl = document.getElementById("set-identity");
            if (identEl) identEl.value = activePersonaIndex >= 0 ? activePersonaIndex : "-1";
        }
    }
}

async function saveAllConfig() {
    var toml = buildConfigToml();
    try {
        await invokeShort("write_config", { content: toml });
    } catch(e) {
        localStorage.setItem("bambooclaw-config", JSON.stringify(currentConfig));
    }
}