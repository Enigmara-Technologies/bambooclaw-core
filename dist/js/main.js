// =========== DASHBOARD ENTRY ===========
window.enterDashboard = async function() {
    try {
        appendLog("boot-log", "[DASH] enterDashboard() called");
        localStorage.setItem("bambooclaw-installed", "true");
        document.getElementById("wizard-view").style.display = "none";
        var dashEl = document.getElementById("dashboard-view");
        dashEl.style.display = "block";
        dashEl.classList.remove("hidden");
        await loadConfig();
    } catch(e) {
        appendLog("boot-log", "[ERROR] enterDashboard failed: " + (e.message || e));
    }
};

// =========== TAB SWITCHING ===========
document.querySelectorAll(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
        var target = this.getAttribute("data-tab");
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        this.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.add("hidden"); });
        document.getElementById(target).classList.remove("hidden");
    });
});

// =========== LLM PROVIDER CHANGE ===========
document.getElementById("llm-provider").addEventListener("change", function() {
    var provider = this.value;
    var isOR = provider === "openrouter";
    var keyInput = document.getElementById("llm-api-key");
    var activeKey = "";
    if (keyInput) {
        keyInput.value = (currentConfig.api_keys && currentConfig.api_keys[provider]) || "";
        activeKey = keyInput.value;
    }
    var group = document.getElementById("llm-model-group");
    if (group) group.style.display = isOR ? "none" : "block";
    var orArea = document.getElementById("or-models-area");
    if (isOR) {
        if (orArea) { orArea.classList.remove("hidden"); orArea.style.display = "block"; }
        if (orModels.length === 0 && activeKey.length > 10) window.fetchORModels();
    } else {
        if (orArea) { orArea.classList.add("hidden"); orArea.style.display = "none"; }
        if (activeKey.length > 5 || provider === "ollama") {
            autoFetchModels(provider, activeKey);
        } else {
            var models = providerModels[provider] || [];
            var sel = document.getElementById("llm-model");
            if (sel) {
                sel.innerHTML = "";
                models.forEach(function(m) { var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt); });
            }
        }
    }
});

document.getElementById("llm-api-key").addEventListener("input", function() {
    var provider = document.getElementById("llm-provider").value;
    var val = this.value.trim();
    if (!currentConfig.api_keys) currentConfig.api_keys = {};
    currentConfig.api_keys[provider] = val;
    if (val.length > 5 || provider === "ollama") {
        if (provider === "openrouter" && orModels.length === 0) window.fetchORModels();
        else if (provider !== "openrouter") autoFetchModels(provider, val);
    }
    var r = document.getElementById("llm-save-reminder"); if (r) r.classList.add("visible");
});

document.getElementById("llm-provider").dispatchEvent(new Event("change"));

// =========== SETTINGS CHANGE LISTENERS ===========
["set-autonomy","set-port","set-tunnel","set-identity","set-runtime","set-loglevel","set-tool-iterations","settings-system-prompt"].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function() {
        if (id === "set-identity") {
            activePersonaIndex = parseInt(el.value);
            if (isNaN(activePersonaIndex)) activePersonaIndex = -1;
            savePersonas();
            renderPersonas();
        }
        var sr = document.getElementById("settings-save-reminder"); if (sr) sr.classList.add("visible");
    });
    el.addEventListener("input", function() {
        if (id === "set-tool-iterations") {
            var lbl = document.getElementById("tool-iter-value");
            if (lbl) lbl.textContent = el.value;
        }
        var sr = document.getElementById("settings-save-reminder"); if (sr) sr.classList.add("visible");
    });
});

// =========== BUTTON WIRING ===========
document.getElementById("btn-copy-boot-log").addEventListener("click", function() { copyLog("boot-log"); });
document.getElementById("btn-copy-install-log").addEventListener("click", function() { copyLog("install-log"); });
document.getElementById("btn-copy-cap-log").addEventListener("click", function() { copyLog("capability-log"); });
document.getElementById("btn-copy-log").addEventListener("click", function() { copyLog("unified-log"); });
document.getElementById("btn-copy-payload").addEventListener("click", function() { copyLog("llm-payload-display"); });
document.getElementById("btn-back-step1").addEventListener("click", function() { wizardGo(0); });
document.getElementById("btn-back-step2").addEventListener("click", function() { wizardGo(1); });
document.getElementById("btn-step0-next").addEventListener("click", function() { wizardGo(1); });
document.getElementById("btn-step1-next").addEventListener("click", function() { wizardGo(2); });
document.getElementById("btn-enter-dashboard").addEventListener("click", function() { window.enterDashboard(); });

document.getElementById("btn-step2-skip").addEventListener("click", async function() {
    var log = "capability-log";
    document.getElementById(log).textContent = "";
    appendLog(log, "[INFO] Skipping agent capabilities.");
    await deployBinary(log);
    wizardGo(3);
});

document.getElementById("btn-step2-install").addEventListener("click", async function() {
    var log = "capability-log";
    document.getElementById(log).textContent = "";
    this.disabled = true;
    document.getElementById("btn-step2-skip").disabled = true;

    var wantPython = document.getElementById("cap-python").checked;
    var wantBrowser = document.getElementById("cap-browser").checked;
    var wantNode = document.getElementById("cap-node").checked;
    var pipCmd = detectedOS === "windows" ? "pip" : "pip3";
    var pythonCmd = detectedOS === "windows" ? "python" : "python3";

    if (wantPython || wantBrowser || wantNode) {
        if (wantPython) {
            var pyBadge = document.getElementById("chk-python");
            if (pyBadge && pyBadge.classList.contains("status-found")) {
                appendLog(log, "[SKIP] Python already installed.");
            } else {
                appendLog(log, "[INFO] Installing Python 3.12...");
                try {
                    var r;
                    if (detectedOS === "windows") r = await invokeLong("run_shell_command", { commandName: "winget", args: ["install", "Python.Python.3.12", "--silent", "--accept-package-agreements", "--accept-source-agreements"] });
                    else if (detectedOS === "macos") r = await invokeLong("run_shell_command", { commandName: "brew", args: ["install", "python3"] });
                    else r = await invokeLong("run_shell_command", { commandName: "sh", args: ["-c", "sudo apt install -y python3 python3-pip"] });
                    appendLog(log, r); appendLog(log, "[OK] Python installed.");
                } catch(e) { appendLog(log, "[ERROR] Python installation failed: " + (e.message || e)); }
            }
            appendLog(log, "[INFO] Installing Python packages...");
            try {
                var r2 = await invokeLong("run_shell_command", { commandName: pipCmd, args: ["install", "pyautogui", "pillow", "requests", "beautifulsoup4", "psutil", "pandas", "numpy"] });
                appendLog(log, r2); appendLog(log, "[OK] Python packages installed.");
            } catch(e) { appendLog(log, "[ERROR] pip install failed: " + (e.message || e)); }
        }
        if (wantBrowser) {
            appendLog(log, "[INFO] Installing Playwright...");
            try {
                var r3 = await invokeLong("run_shell_command", { commandName: pipCmd, args: ["install", "playwright"] });
                appendLog(log, r3);
                var r4 = await invokeLong("run_shell_command", { commandName: pythonCmd, args: ["-m", "playwright", "install", "chromium"] });
                appendLog(log, r4); appendLog(log, "[OK] Playwright + Chromium installed.");
            } catch(e) { appendLog(log, "[ERROR] Playwright installation failed: " + (e.message || e)); }
        }
        if (wantNode) {
            var nodeBadge = document.getElementById("chk-node");
            if (nodeBadge && nodeBadge.classList.contains("status-found")) {
                appendLog(log, "[SKIP] Node.js already installed.");
            } else {
                appendLog(log, "[INFO] Installing Node.js LTS...");
                try {
                    var r5;
                    if (detectedOS === "windows") r5 = await invokeLong("run_shell_command", { commandName: "winget", args: ["install", "OpenJS.NodeJS.LTS", "--silent", "--accept-package-agreements", "--accept-source-agreements"] });
                    else if (detectedOS === "macos") r5 = await invokeLong("run_shell_command", { commandName: "brew", args: ["install", "node"] });
                    else r5 = await invokeLong("run_shell_command", { commandName: "sh", args: ["-c", "sudo apt install -y nodejs npm"] });
                    appendLog(log, r5); appendLog(log, "[OK] Node.js installed.");
                } catch(e) { appendLog(log, "[ERROR] Node.js installation failed: " + (e.message || e)); }
            }
        }
        appendLog(log, "[DONE] Agent capability setup complete.");
    }
    await deployBinary(log);
    this.disabled = false;
    document.getElementById("btn-step2-skip").disabled = false;
    wizardGo(3);
});

document.getElementById("btn-apply-llm").addEventListener("click", applyLLMConfig);
document.getElementById("btn-test-llm").addEventListener("click", testLLMConfig);
document.getElementById("btn-setup-tg").addEventListener("click", setupTelegram);
document.getElementById("btn-setup-dc").addEventListener("click", setupDiscord);
document.getElementById("btn-setup-wa").addEventListener("click", setupWhatsApp);
document.getElementById("btn-setup-sl").addEventListener("click", setupSlack);
document.getElementById("btn-close-channel").addEventListener("click", closeChannelSetup);
document.getElementById("btn-daemon-toggle").addEventListener("click", toggleDaemon);
document.getElementById("btn-emergency-flush").addEventListener("click", emergencyFlush);
document.getElementById("btn-send-chat").addEventListener("click", sendAgentMessage);
document.getElementById("agent-chat-input").addEventListener("keydown", function(e) { if (e.key === "Enter") sendAgentMessage(e); });
document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
document.getElementById("btn-reset-settings").addEventListener("click", resetSettings);
document.getElementById("btn-save-composio").addEventListener("click", saveComposioKey);

setTimeout(function() {
    var btn = document.getElementById("btn-create-persona");
    if (btn) btn.addEventListener("click", createPersona);
}, 0);

// OR model list
document.getElementById("or-model-list").addEventListener("click", function(e) {
    var row = e.target.closest ? e.target.closest(".or-model-row") : null;
    if (!row) { var el = e.target; while (el && el !== this) { if (el.classList && el.classList.contains("or-model-row")) { row = el; break; } el = el.parentElement; } }
    if (row) window.selectORModel(row.getAttribute("data-model-id"));
});
document.getElementById("or-model-search").addEventListener("input", renderORModels);
document.getElementById("or-sort-name").addEventListener("click", function() { window.sortORModels("name"); });
document.getElementById("or-sort-input").addEventListener("click", function() { window.sortORModels("input"); });
document.getElementById("or-sort-output").addEventListener("click", function() { window.sortORModels("output"); });
document.getElementById("btn-fetch-models").addEventListener("click", function() { window.fetchORModels(); });

// Skills events
document.getElementById("skills-builtin").addEventListener("click", function(e) {
    var infoBtn = e.target.closest ? e.target.closest(".skill-info-btn") : (e.target.classList.contains("skill-info-btn") ? e.target : null);
    if (infoBtn) {
        e.stopPropagation();
        var card = infoBtn.closest ? infoBtn.closest(".skill-card") : null;
        if (card) { var descEl = card.querySelector(".skill-desc-full"); if (descEl) descEl.classList.toggle("visible"); }
    }
});

document.getElementById("skills-composio").addEventListener("click", function(e) {
    var toolRow = e.target.closest ? e.target.closest(".toolkit-tool-row") : null;
    if (toolRow) {
        e.stopPropagation();
        var paramsEl = document.getElementById("tool-params-" + toolRow.getAttribute("data-toolkit-slug") + "-" + toolRow.getAttribute("data-tool-idx"));
        if (paramsEl) paramsEl.classList.toggle("visible");
        return;
    }
    var infoBtn = e.target.closest ? e.target.closest(".skill-info-btn") : (e.target.classList.contains("skill-info-btn") ? e.target : null);
    if (infoBtn) {
        e.stopPropagation();
        var card = infoBtn.closest ? infoBtn.closest(".skill-card") : null;
        if (card) {
            var descEl = card.querySelector(".skill-desc-full");
            if (descEl) {
                var wasVisible = descEl.classList.contains("visible");
                descEl.classList.toggle("visible");
                if (!wasVisible) { var tkSlug = descEl.getAttribute("data-toolkit-slug"); if (tkSlug) loadToolkitToolsOnDemand(tkSlug); }
            }
        }
        return;
    }
    var card2 = e.target.closest ? e.target.closest(".skill-card") : null;
    if (!card2) { var el2 = e.target; while (el2 && el2 !== this) { if (el2.classList && el2.classList.contains("skill-card")) { card2 = el2; break; } el2 = el2.parentElement; } }
    if (card2) { var skillId = card2.getAttribute("data-skill-id"); if (skillId) toggleSkill(skillId); }
});

document.getElementById("composio-category-tabs").addEventListener("click", function(e) {
    var btn = e.target.closest ? e.target.closest("[data-composio-cat]") : null;
    if (!btn) { var el = e.target; while (el && el !== this) { if (el.getAttribute && el.getAttribute("data-composio-cat")) { btn = el; break; } el = el.parentElement; } }
    if (btn) { composioActiveCategory = btn.getAttribute("data-composio-cat"); renderAllSkills(); }
});

var toggleBtn = document.getElementById("btn-toggle-tools-list");
if (toggleBtn) toggleBtn.addEventListener("click", function() { window.toggleActiveToolsList && window.toggleActiveToolsList(); });

var openComp = document.getElementById("btn-open-composio");
if (openComp) openComp.addEventListener("click", function() {
    var url = "https://app.composio.dev/settings";
    if (window.__TAURI__) { try { var opener = (window.__TAURI__.opener && window.__TAURI__.opener.openUrl) || (window.__TAURI__.shell && window.__TAURI__.shell.open); if (opener) opener(url); } catch(e) {} } else { window.open(url, "_blank"); }
});

var helpSearchEl = document.getElementById("help-search");
if (helpSearchEl) helpSearchEl.addEventListener("input", function(e) { window.filterHelp && window.filterHelp(e.target.value); });

var skillSearchEl = document.getElementById("skill-search");
if (skillSearchEl) skillSearchEl.addEventListener("input", function() { renderComposioToolkits(); });

document.getElementById("btn-open-log-folder").addEventListener("click", function() {
    if (window.__TAURI__) {
        try {
            var resolved = LOG_FOLDER.replace("~", detectedOS === "windows" ? "%USERPROFILE%" : "$HOME");
            if (window.__TAURI__.opener) window.__TAURI__.opener.openUrl(resolved);
            else if (window.__TAURI__.shell) window.__TAURI__.shell.open(resolved);
        } catch(e) {}
    }
});

// =========== MAIN BOOT ===========
async function boot() {
    try {
        var installedFlag = localStorage.getItem("bambooclaw-installed");
        fetchVersion();
        if (installedFlag === "true") {
            await window.enterDashboard();
            loadPersonas();
            if (!currentConfig.settings) {
                currentConfig.settings = { autonomy: "autonomous", port: "7331", tunnel: "none", identity: "bamboo", runtime: "native", loglevel: "info", maxToolIterations: 10 };
                saveAllConfig();
            }
            if (currentConfig.settings && currentConfig.settings.maxToolIterations) {
                MAX_TOOL_ITERATIONS = currentConfig.settings.maxToolIterations;
                var slider = document.getElementById("set-tool-iterations");
                var label = document.getElementById("tool-iter-value");
                if (slider) slider.value = MAX_TOOL_ITERATIONS;
                if (label) label.textContent = MAX_TOOL_ITERATIONS;
            }
            if (currentConfig.enabledSkills) {
                enabledSkills = currentConfig.enabledSkills;
                renderBuiltinSkills(); rebuildBuiltinTools(); renderActiveToolsSummary(); renderEnabledIntegrations();
            }
            if (currentConfig.composioApiKey) {
                var ckEl = document.getElementById("composio-api-key");
                if (ckEl) ckEl.value = currentConfig.composioApiKey;
                setTimeout(function() { saveComposioKey(); }, 1000);
            }
            setTimeout(function() { renderActiveToolsSummary(); renderEnabledIntegrations(); }, 2000);
            setTimeout(function() { if (currentConfig.llm && currentConfig.llm.api_key && !daemonRunning) toggleDaemon(); }, 500);
        } else {
            wizardGo(0);
        }
    } catch(e) {}
}

(function waitForTauri() {
    try {
        var waited = 0;
        var interval = setInterval(function() {
            waited += 50;
            if (window.__TAURI__ || waited >= 3000) { clearInterval(interval); boot(); }
        }, 50);
    } catch(e) {}
})();
