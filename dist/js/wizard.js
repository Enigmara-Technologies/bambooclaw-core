// =========== WIZARD ===========
var currentStep = 0;

function wizardGo(step) {
    document.querySelectorAll(".wizard-step").forEach(function(s, i) {
        s.classList.toggle("hidden", i !== step);
    });
    document.querySelectorAll(".step-dot").forEach(function(d, i) {
        d.classList.toggle("active", i <= step);
    });
    currentStep = step;
    if (step === 0) runSystemChecks();
    if (step === 1) runPrereqInstall();
}

function updateBadge(id, text, cls) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; el.className = "status-badge " + cls; }
}

async function runSystemChecks() {
    appendLog("boot-log", "[CHECK] runSystemChecks() called");

    var checkOS = invokeShort("get_platform").then(function(os) {
        detectedOS = os || "unknown";
        var osLabel = detectedOS === "windows" ? "Windows" : detectedOS === "macos" ? "macOS" : detectedOS === "linux" ? "Linux" : detectedOS;
        updateBadge("chk-os", osLabel, "status-found");
    }).catch(function() {
        detectedOS = "windows";
        updateBadge("chk-os", "Windows (assumed)", "status-not-installed");
    });

    var checkRust = invokeShort("check_prerequisite", { name: "rustc" }).then(function(rv) {
        updateBadge("chk-rust", rv.trim().split("\n")[0], "status-found");
    }).catch(function() {
        updateBadge("chk-rust", "Not Installed", "status-not-installed");
    });

    var checkGit = invokeShort("run_shell_command", { commandName: "git", args: ["--version"] }).then(function(gv) {
        updateBadge("chk-git", gv.trim().split("\n")[0], "status-found");
    }).catch(function() {
        updateBadge("chk-git", "Not Installed", "status-not-installed");
    });

    var checkBuild = invokeShort("check_prerequisite", { name: "vs_build_tools" }).then(function(bv) {
        updateBadge("chk-build", bv.trim() || "Found", "status-found");
    }).catch(function() {
        updateBadge("chk-build", detectedOS === "windows" ? "Not Installed" : "N/A", detectedOS === "windows" ? "status-not-installed" : "status-found");
    });

    var checkPython = invokeShort("run_shell_command", { commandName: "python", args: ["--version"] }).then(function(pv) {
        updateBadge("chk-python", pv.trim().split("\n")[0], "status-found");
    }).catch(function() {
        return invokeShort("run_shell_command", { commandName: "python3", args: ["--version"] }).then(function(pv) {
            updateBadge("chk-python", pv.trim().split("\n")[0], "status-found");
        }).catch(function() {
            updateBadge("chk-python", "Not Installed", "status-not-installed");
        });
    });

    var checkNode = invokeShort("run_shell_command", { commandName: "node", args: ["--version"] }).then(function(nv) {
        updateBadge("chk-node", nv.trim().split("\n")[0], "status-found");
    }).catch(function() {
        updateBadge("chk-node", "Not Installed", "status-not-installed");
    });

    await Promise.allSettled([checkOS, checkRust, checkGit, checkBuild, checkPython, checkNode]);
    document.getElementById("btn-step0-next").disabled = false;
}

async function runPrereqInstall() {
    var log = "install-log";
    document.getElementById(log).textContent = "";
    appendLog(log, "[INFO] Detected OS: " + detectedOS);
    appendLog(log, "[INFO] Starting prerequisite installation...");

    var rustBadge = document.getElementById("chk-rust");
    var rustInstalled = rustBadge && rustBadge.classList.contains("status-found");

    if (rustInstalled) {
        appendLog(log, "[SKIP] Rust already installed.");
    } else {
        appendLog(log, "[INFO] Installing Rust toolchain...");
        try {
            var result;
            if (detectedOS === "windows") {
                result = await invokeLong("run_shell_command", { commandName: "winget", args: ["install", "--id", "Rustlang.Rustup", "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"] });
            } else {
                result = await invokeLong("run_shell_command", { commandName: "sh", args: ["-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"] });
            }
            appendLog(log, result);
            appendLog(log, "[OK] Rust installation completed.");
        } catch(e) {
            appendLog(log, "[ERROR] Rust installation failed: " + (e.message || e));
        }
    }

    var buildBadge = document.getElementById("chk-build");
    var buildInstalled = buildBadge && buildBadge.classList.contains("status-found");

    if (detectedOS === "windows" && !buildInstalled) {
        appendLog(log, "[INFO] Installing Visual Studio Build Tools...");
        try {
            var result = await invokeLong("run_shell_command", {
                commandName: "winget",
                args: ["install", "--id", "Microsoft.VisualStudio.2022.BuildTools", "-e", "--silent", "--override", "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended", "--accept-package-agreements", "--accept-source-agreements"]
            });
            appendLog(log, result);
            appendLog(log, "[OK] Build Tools installation completed.");
        } catch(e) {
            appendLog(log, "[ERROR] Build Tools installation failed: " + (e.message || e));
        }
    } else if (detectedOS === "macos") {
        appendLog(log, "[INFO] Checking Xcode Command Line Tools...");
        try {
            var result = await invokeLong("run_shell_command", { commandName: "xcode-select", args: ["--install"] }, 120000);
            appendLog(log, result || "[OK] Xcode CLT ready.");
        } catch(e) {
            appendLog(log, "[INFO] Xcode CLT may already be installed: " + (e.message || e));
        }
    }

    appendLog(log, "[DONE] All prerequisites ready.");
    document.getElementById("btn-step1-next").disabled = false;
}

async function deployBinary(log) {
    appendLog(log, "[INFO] Deploying pre-built binary...");
    try {
        var metaRes = await fetch(PROXY_URL);
        if (!metaRes.ok) throw new Error("Proxy returned " + metaRes.status);
        var meta = await metaRes.json();

        var assets = meta.assets || [];
        var asset;
        if (detectedOS === "windows") {
            asset = assets.find(function(a) { return a.name.endsWith(".exe"); }) || assets.find(function(a) { return a.name.endsWith(".msi"); });
        } else if (detectedOS === "macos") {
            asset = assets.find(function(a) { return a.name.endsWith(".dmg"); }) || assets.find(function(a) { return a.name.includes("macos"); });
        } else {
            asset = assets.find(function(a) { return a.name.endsWith(".AppImage"); }) || assets.find(function(a) { return a.name.includes("linux"); });
        }
        var assetName = asset ? asset.name : "";

        if (!assetName) {
            appendLog(log, "[ERROR] Could not find a pre-built binary for your platform.");
            return;
        }

        var homePath = "~";
        try {
            if (detectedOS === "windows") {
                homePath = (await invokeShort("run_shell_command", { commandName: "cmd", args: ["/C", "echo %USERPROFILE%"] })).trim();
            } else {
                homePath = (await invokeShort("run_shell_command", { commandName: "sh", args: ["-c", "echo $HOME"] })).trim();
            }
        } catch(e) {}

        var sep = detectedOS === "windows" ? "\\" : "/";
        var destDir = homePath + sep + ".bambooclaw";
        var destFile = destDir + sep + (detectedOS === "windows" ? "bambooclaw.exe" : "bambooclaw");

        try {
            if (detectedOS === "windows") {
                await invokeShort("run_shell_command", { commandName: "cmd", args: ["/C", "mkdir \"" + destDir + "\" 2>nul || echo exists"] });
            } else {
                await invokeShort("run_shell_command", { commandName: "mkdir", args: ["-p", destDir] });
            }
        } catch(e) {}

        var dlUrl = PROXY_URL + "?asset=" + encodeURIComponent(assetName);
        await invokeLong("download_binary", { url: dlUrl, dest: destFile });
        appendLog(log, "[OK] Binary downloaded successfully.");

        if (detectedOS !== "windows") {
            try { await invokeShort("run_shell_command", { commandName: "chmod", args: ["+x", destFile] }); } catch(e) {}
        }

        document.getElementById("install-path-display").value = destFile;
        appendLog(log, "[DONE] BambooClaw deployed.");
    } catch(e) {
        appendLog(log, "[ERROR] Binary download failed: " + (e.message || e));
    }
}

// =========== CONFIG SERIALIZATION ===========
function buildConfigToml() {
    var lines = ["# BambooClaw Agent Configuration", "# Auto-generated by BambooClaw Companion", ""];

    if (currentConfig.llm) {
        lines.push("[llm]");
        if (currentConfig.llm.provider) lines.push('provider = ' + JSON.stringify(currentConfig.llm.provider));
        // Write active provider's key as api_key (for the Rust daemon)
        var activeKey = (currentConfig.llm.api_keys && currentConfig.llm.api_keys[currentConfig.llm.provider]) || currentConfig.llm.api_key || "";
        if (activeKey) lines.push('api_key = ' + JSON.stringify(activeKey));
        if (currentConfig.llm.model) lines.push('model = ' + JSON.stringify(currentConfig.llm.model));
        if (currentConfig.llm.local_url) lines.push('local_url = ' + JSON.stringify(currentConfig.llm.local_url));
        lines.push("");
    }

    // Persist all per-provider API keys so switching providers doesn't lose them
    if (currentConfig.llm && currentConfig.llm.api_keys) {
        var keys = currentConfig.llm.api_keys;
        var providers = Object.keys(keys).filter(function(p) { return keys[p]; });
        if (providers.length > 0) {
            lines.push("[llm_keys]");
            providers.forEach(function(p) {
                lines.push(p + ' = ' + JSON.stringify(keys[p]));
            });
            lines.push("");
        }
    }

    // Persist per-provider local URLs
    if (currentConfig.llm && currentConfig.llm.local_urls) {
        var lurls = currentConfig.llm.local_urls;
        var lProviders = Object.keys(lurls).filter(function(p) { return lurls[p]; });
        if (lProviders.length > 0) {
            lines.push("[llm_local_urls]");
            lProviders.forEach(function(p) {
                lines.push(p + ' = ' + JSON.stringify(lurls[p]));
            });
            lines.push("");
        }
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
        if (s.identity) lines.push('identity = ' + JSON.stringify(s.identity));
        if (s.loglevel) lines.push('log_level = ' + JSON.stringify(s.loglevel));
        if (currentConfig.composioApiKey) lines.push('composio_api_key = ' + JSON.stringify(currentConfig.composioApiKey));
        lines.push("");
    }

    return lines.join("\n");
}

async function saveAllConfig() {
    var toml = buildConfigToml();
    try {
        await invokeShort("write_config", { content: toml });
    } catch(e) {
        localStorage.setItem("bambooclaw-config", JSON.stringify(currentConfig));
    }
}

async function loadConfig() {
    appendLog("dash-log", "[CONFIG] loadConfig() started...");
    try {
        var raw = await invokeShort("read_config");
        appendLog("dash-log", "[CONFIG] Loaded from disk. Length: " + raw.length);
        showToast("Configuration loaded from disk", "info");
        parseAndApplyConfig(raw);
    } catch(e) {
        appendLog("dash-log", "[CONFIG] Failed to read from disk: " + (e.message || e));
        var saved = localStorage.getItem("bambooclaw-config");
        if (saved) {
            try {
                currentConfig = JSON.parse(saved);
                applyConfigToUI();
            } catch(e2) {
                appendLog("dash-log", "[CONFIG] LocalStorage parse error.");
            }
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
            if (section === "llm_keys") {
                if (!currentConfig.llm) currentConfig.llm = {};
                if (!currentConfig.llm.api_keys) currentConfig.llm.api_keys = {};
                currentConfig.llm.api_keys[key] = String(val);
            }
            if (section === "llm_local_urls") {
                if (!currentConfig.llm) currentConfig.llm = {};
                if (!currentConfig.llm.local_urls) currentConfig.llm.local_urls = {};
                currentConfig.llm.local_urls[key] = String(val);
            }
            if (section.startsWith("channels.")) {
                var ch = section.replace("channels.", "");
                if (!currentConfig.channels) currentConfig.channels = {};
                if (!currentConfig.channels[ch]) currentConfig.channels[ch] = {};
                currentConfig.channels[ch][key] = String(val);
            }
            if (section === "agent") {
                if (key === "composio_api_key") {
                    currentConfig.composioApiKey = String(val);
                } else {
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
        // Restore the key for the active provider from the per-provider map (fallback to legacy api_key)
        var activeProvider = currentConfig.llm.provider;
        var restoredKey = (currentConfig.llm.api_keys && activeProvider && currentConfig.llm.api_keys[activeProvider])
            || currentConfig.llm.api_key || "";
        if (restoredKey) document.getElementById("llm-api-key").value = restoredKey;
        // Restore local URL for this provider
        var restoredUrl = (currentConfig.llm.local_urls && activeProvider && currentConfig.llm.local_urls[activeProvider])
            || currentConfig.llm.local_url || "";
        var localUrlEl = document.getElementById("llm-local-url");
        if (localUrlEl && restoredUrl) localUrlEl.value = restoredUrl;
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
    }
    if (currentConfig.channels) {
        if (currentConfig.channels.telegram) document.getElementById("tg-status").textContent = "Token: " + currentConfig.channels.telegram.token.substring(0, 8) + "...";
        if (currentConfig.channels.discord) document.getElementById("dc-status").textContent = "Token: " + currentConfig.channels.discord.token.substring(0, 8) + "...";
    }
    if (currentConfig.settings) {
        var s = currentConfig.settings;
        if (s.autonomy) document.getElementById("set-autonomy").value = s.autonomy;
        if (s.loglevel || s.log_level) document.getElementById("set-loglevel").value = s.loglevel || s.log_level;
        if (s.identity !== undefined) {
            var identVal = parseInt(s.identity);
            if (!isNaN(identVal)) { activePersonaIndex = identVal; } else { activePersonaIndex = -1; }
            var identEl = document.getElementById("set-identity");
            if (identEl) identEl.value = activePersonaIndex >= 0 ? activePersonaIndex : "-1";
        }
        if (s.maxToolIterations) {
            var iterEl = document.getElementById("set-tool-iterations");
            var iterLbl = document.getElementById("tool-iter-value");
            if (iterEl) { iterEl.value = s.maxToolIterations; MAX_TOOL_ITERATIONS = parseInt(s.maxToolIterations); }
            if (iterLbl) iterLbl.textContent = s.maxToolIterations;
        }
        if (window.applyRawModeUI) window.applyRawModeUI(!!s.rawMode);
    }
}