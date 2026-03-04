// =========== CHANNEL SETUP ===========
// All channel setup panels are built with DOM methods (no innerHTML with inline onclick).
// This is the fix for the broken eye-icon buttons: previously escaped onclick="window.toggleKeyVisibility(\\'id\\', this)"
// was producing malformed HTML. Now we use addEventListener on properly constructed DOM nodes.

function closeChannelSetup() {
    document.getElementById("channel-setup-area").classList.add("hidden");
}

// --- Telegram ---
function setupTelegram() {
    var savedToken = (currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token) || "";
    document.getElementById("channel-setup-title").textContent = "Telegram Bot Setup";

    var body = document.getElementById("channel-setup-body");
    body.innerHTML = "";

    var info = document.createElement("p");
    info.style.cssText = "margin-bottom:1rem;color:var(--text-dim);";
    info.innerHTML = "1. Open Telegram and talk to <strong>@BotFather</strong><br>2. Send /newbot and follow the prompts<br>3. Copy the bot token and paste it below";
    body.appendChild(info);

    var fg = document.createElement("div");
    fg.className = "form-group";
    var lbl = document.createElement("label");
    lbl.textContent = "Bot Token";
    fg.appendChild(lbl);
    fg.appendChild(buildPasswordField("tg-token", "123456:ABC-DEF1234ghIkl...", savedToken));
    body.appendChild(fg);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-sm";
    saveBtn.textContent = "Save Token";
    saveBtn.addEventListener("click", saveTelegramToken);

    var testBtn = document.createElement("button");
    testBtn.className = "btn btn-sm btn-outline";
    testBtn.style.marginLeft = "0.5rem";
    testBtn.textContent = "Test";
    testBtn.addEventListener("click", function() { testChannel("telegram"); });

    body.appendChild(saveBtn);
    body.appendChild(testBtn);

    document.getElementById("channel-setup-area").classList.remove("hidden");

    try {
        if (window.__TAURI__) {
            var opener = (window.__TAURI__.opener && window.__TAURI__.opener.openUrl) || (window.__TAURI__.shell && window.__TAURI__.shell.open);
            if (opener) opener("https://t.me/BotFather");
        }
    } catch(e) {}
}

function saveTelegramToken() {
    var token = document.getElementById("tg-token").value.trim();
    if (!token) { showToast("Please enter a bot token", "error"); return; }
    if (!currentConfig.channels) currentConfig.channels = {};
    currentConfig.channels.telegram = { token: token };
    document.getElementById("tg-status").textContent = "Token: " + token.substring(0, 8) + "...";
    saveAllConfig();
    showToast("Telegram bot token saved", "success");
    closeChannelSetup();
}

// --- Discord ---
function setupDiscord() {
    var savedToken = (currentConfig.channels && currentConfig.channels.discord && currentConfig.channels.discord.token) || "";
    var savedGuild = (currentConfig.channels && currentConfig.channels.discord && currentConfig.channels.discord.guild_id) || "";
    document.getElementById("channel-setup-title").textContent = "Discord App Setup";

    var body = document.getElementById("channel-setup-body");
    body.innerHTML = "";

    var info = document.createElement("p");
    info.style.cssText = "margin-bottom:1rem;color:var(--text-dim);";
    info.innerHTML = "1. Go to <strong>discord.com/developers/applications</strong><br>2. Create a new application → Bot → Reset Token<br>3. Enable MESSAGE CONTENT INTENT<br>4. Paste the bot token below";
    body.appendChild(info);

    var fg1 = document.createElement("div");
    fg1.className = "form-group";
    var lbl1 = document.createElement("label");
    lbl1.textContent = "Bot Token";
    fg1.appendChild(lbl1);
    fg1.appendChild(buildPasswordField("dc-token", "MTA...", savedToken));
    body.appendChild(fg1);

    var fg2 = document.createElement("div");
    fg2.className = "form-group";
    var lbl2 = document.createElement("label");
    lbl2.textContent = "Guild ID (optional)";
    fg2.appendChild(lbl2);
    var guildInput = document.createElement("input");
    guildInput.type = "text";
    guildInput.id = "dc-guild";
    guildInput.placeholder = "Server ID for slash commands";
    guildInput.value = savedGuild;
    fg2.appendChild(guildInput);
    body.appendChild(fg2);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-sm";
    saveBtn.textContent = "Save Token";
    saveBtn.addEventListener("click", saveDiscordToken);

    var testBtn = document.createElement("button");
    testBtn.className = "btn btn-sm btn-outline";
    testBtn.style.marginLeft = "0.5rem";
    testBtn.textContent = "Test";
    testBtn.addEventListener("click", function() { testChannel("discord"); });

    body.appendChild(saveBtn);
    body.appendChild(testBtn);

    document.getElementById("channel-setup-area").classList.remove("hidden");
}

function saveDiscordToken() {
    var token = document.getElementById("dc-token").value.trim();
    if (!token) { showToast("Please enter a bot token", "error"); return; }
    if (!currentConfig.channels) currentConfig.channels = {};
    currentConfig.channels.discord = { token: token, guild_id: document.getElementById("dc-guild").value.trim() };
    document.getElementById("dc-status").textContent = "Token: " + token.substring(0, 8) + "...";
    saveAllConfig();
    showToast("Discord bot token saved", "success");
    closeChannelSetup();
}

// --- WhatsApp ---
function setupWhatsApp() {
    document.getElementById("channel-setup-title").textContent = "WhatsApp Business Setup";

    var body = document.getElementById("channel-setup-body");
    body.innerHTML = "";

    var info = document.createElement("p");
    info.style.cssText = "margin-bottom:1rem;color:var(--text-dim);";
    info.textContent = "WhatsApp Business Cloud API requires a Meta Business account and approved app.";
    body.appendChild(info);

    var fg1 = document.createElement("div");
    fg1.className = "form-group";
    var lbl1 = document.createElement("label");
    lbl1.textContent = "Phone Number ID";
    fg1.appendChild(lbl1);
    var phoneInput = document.createElement("input");
    phoneInput.type = "text";
    phoneInput.id = "wa-phone-id";
    phoneInput.placeholder = "From Meta Developer Console";
    fg1.appendChild(phoneInput);
    body.appendChild(fg1);

    var fg2 = document.createElement("div");
    fg2.className = "form-group";
    var lbl2 = document.createElement("label");
    lbl2.textContent = "Access Token";
    fg2.appendChild(lbl2);
    fg2.appendChild(buildPasswordField("wa-token", "EAA..."));
    body.appendChild(fg2);

    var fg3 = document.createElement("div");
    fg3.className = "form-group";
    var lbl3 = document.createElement("label");
    lbl3.textContent = "Webhook Verify Token";
    fg3.appendChild(lbl3);
    var verifyInput = document.createElement("input");
    verifyInput.type = "text";
    verifyInput.id = "wa-verify";
    verifyInput.placeholder = "Your custom verify string";
    fg3.appendChild(verifyInput);
    body.appendChild(fg3);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-sm";
    saveBtn.textContent = "Save Configuration";
    saveBtn.addEventListener("click", saveWhatsApp);

    var testBtn = document.createElement("button");
    testBtn.className = "btn btn-sm btn-outline";
    testBtn.style.marginLeft = "0.5rem";
    testBtn.textContent = "Test";
    testBtn.addEventListener("click", function() { testChannel("whatsapp"); });

    body.appendChild(saveBtn);
    body.appendChild(testBtn);

    document.getElementById("channel-setup-area").classList.remove("hidden");
}

function saveWhatsApp() {
    var phoneId = document.getElementById("wa-phone-id").value.trim();
    var token = document.getElementById("wa-token").value.trim();
    var verify = document.getElementById("wa-verify").value.trim();
    if (!phoneId || !token) { showToast("Phone Number ID and Access Token are required", "error"); return; }
    if (!currentConfig.channels) currentConfig.channels = {};
    currentConfig.channels.whatsapp = { phone_number_id: phoneId, access_token: token, verify_token: verify };
    document.getElementById("wa-status").textContent = "Phone: " + phoneId;
    saveAllConfig();
    showToast("WhatsApp configuration saved", "success");
    closeChannelSetup();
}

// --- Slack ---
function setupSlack() {
    document.getElementById("channel-setup-title").textContent = "Slack App Setup";

    var body = document.getElementById("channel-setup-body");
    body.innerHTML = "";

    var info = document.createElement("p");
    info.style.cssText = "margin-bottom:1rem;color:var(--text-dim);";
    info.innerHTML = "1. Go to <strong>api.slack.com/apps</strong> and create a new app<br>2. Enable Socket Mode and Event Subscriptions<br>3. Add bot scopes: chat:write, app_mentions:read, channels:history";
    body.appendChild(info);

    var fg1 = document.createElement("div");
    fg1.className = "form-group";
    var lbl1 = document.createElement("label");
    lbl1.textContent = "Bot Token";
    fg1.appendChild(lbl1);
    fg1.appendChild(buildPasswordField("sl-bot-token", "xoxb-..."));
    body.appendChild(fg1);

    var fg2 = document.createElement("div");
    fg2.className = "form-group";
    var lbl2 = document.createElement("label");
    lbl2.textContent = "App Token";
    fg2.appendChild(lbl2);
    fg2.appendChild(buildPasswordField("sl-app-token", "xapp-..."));
    body.appendChild(fg2);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-sm";
    saveBtn.textContent = "Save Configuration";
    saveBtn.addEventListener("click", saveSlack);

    var testBtn = document.createElement("button");
    testBtn.className = "btn btn-sm btn-outline";
    testBtn.style.marginLeft = "0.5rem";
    testBtn.textContent = "Test";
    testBtn.addEventListener("click", function() { testChannel("slack"); });

    body.appendChild(saveBtn);
    body.appendChild(testBtn);

    document.getElementById("channel-setup-area").classList.remove("hidden");
}

function saveSlack() {
    var botToken = document.getElementById("sl-bot-token").value.trim();
    var appToken = document.getElementById("sl-app-token").value.trim();
    if (!botToken) { showToast("Bot token is required", "error"); return; }
    if (!currentConfig.channels) currentConfig.channels = {};
    currentConfig.channels.slack = { bot_token: botToken, app_token: appToken };
    document.getElementById("sl-status").textContent = "Token: " + botToken.substring(0, 10) + "...";
    saveAllConfig();
    showToast("Slack configuration saved", "success");
    closeChannelSetup();
}

// --- Test Channel ---
async function testChannel(channel) {
    showToast("Testing " + channel + " connection...", "info");
    try {
        if (channel === "telegram") {
            var token = (currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token) || "";
            if (!token) { var el = document.getElementById("tg-token"); if (el) token = el.value.trim(); }
            if (!token) { showToast("No Telegram bot token configured.", "error"); return; }
            var resp = await fetch("https://api.telegram.org/bot" + token + "/getMe");
            var data = await resp.json();
            showToast(data.ok ? "Telegram bot @" + data.result.username + " is valid!" : "Invalid Telegram token: " + (data.description || "unknown error"), data.ok ? "success" : "error");
        } else if (channel === "discord") {
            var dToken = (currentConfig.channels && currentConfig.channels.discord && currentConfig.channels.discord.token) || "";
            if (!dToken) { var dcEl = document.getElementById("dc-token"); if (dcEl) dToken = dcEl.value.trim(); }
            if (!dToken) { showToast("No Discord bot token configured", "error"); return; }
            var dresp = await fetch("https://discord.com/api/v10/users/@me", { headers: { "Authorization": "Bot " + dToken } });
            if (dresp.ok) {
                var ddata = await dresp.json();
                showToast("Discord bot " + ddata.username + " is valid!", "success");
            } else {
                showToast("Invalid Discord token (HTTP " + dresp.status + ")", "error");
            }
        } else {
            showToast("Configuration saved. Full " + channel + " test available when agent is running.", "info");
        }
    } catch(e) {
        showToast(channel + " test error: " + (e.message || e), "error");
    }
}
