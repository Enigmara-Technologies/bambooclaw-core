# BambooClaw Companion App - Complete dist/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BambooClaw Companion App</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-dark: #0a0a0f;
            --card-bg: #1a1a2e;
            --accent-emerald: #00c896;
            --accent-emerald-dark: #009a73;
            --text-primary: #e0e0e0;
            --text-secondary: #a0a0a0;
            --error: #ff5252;
            --success: #00c896;
            --warning: #ffc400;
            --border-radius: 8px;
            --transition: all 0.3s ease;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        body {
            background-color: var(--bg-dark);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 20px;
            overflow-x: hidden;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 30px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .logo-icon {
            font-size: 2.5rem;
            color: var(--accent-emerald);
        }

        .logo-text {
            font-size: 2rem;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent-emerald), #00a878);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }

        .theme-toggle {
            background: var(--card-bg);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
            border-radius: var(--border-radius);
            padding: 8px 15px;
            cursor: pointer;
            transition: var(--transition);
        }

        .theme-toggle:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        /* Installer Wizard */
        .wizard-container {
            background: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            margin-bottom: 30px;
        }

        .step-indicator {
            display: flex;
            justify-content: space-between;
            position: relative;
            margin-bottom: 40px;
        }

        .step-indicator::before {
            content: '';
            position: absolute;
            top: 20px;
            left: 0;
            right: 0;
            height: 2px;
            background: rgba(255, 255, 255, 0.1);
            z-index: 1;
        }

        .step {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 2;
            width: 25%;
        }

        .step-number {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            font-weight: bold;
            transition: var(--transition);
        }

        .step.active .step-number {
            background: var(--accent-emerald);
            color: var(--bg-dark);
        }

        .step.completed .step-number {
            background: var(--accent-emerald);
            color: var(--bg-dark);
        }

        .step-label {
            font-size: 0.9rem;
            text-align: center;
        }

        .step.active .step-label {
            color: var(--accent-emerald);
            font-weight: 600;
        }

        .step-content {
            display: none;
        }

        .step-content.active {
            display: block;
            animation: fadeIn 0.5s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .step-title {
            font-size: 1.8rem;
            margin-bottom: 20px;
            color: var(--accent-emerald);
        }

        .step-description {
            margin-bottom: 30px;
            line-height: 1.6;
            color: var(--text-secondary);
        }

        /* System Check */
        .system-checks {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .check-item {
            background: rgba(255, 255, 255, 0.05);
            border-radius: var(--border-radius);
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            transition: var(--transition);
        }

        .check-item:hover {
            border-color: rgba(0, 200, 150, 0.3);
            transform: translateY(-3px);
        }

        .check-icon {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
        }

        .check-icon.success {
            background: rgba(0, 200, 150, 0.2);
            color: var(--success);
        }

        .check-icon.error {
            background: rgba(255, 82, 82, 0.2);
            color: var(--error);
        }

        .check-icon.pending {
            background: rgba(255, 196, 0, 0.2);
            color: var(--warning);
        }

        .check-info {
            flex: 1;
        }

        .check-name {
            font-size: 1.1rem;
            margin-bottom: 5px;
        }

        .check-version {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }

        .next-btn {
            background: var(--accent-emerald);
            color: var(--bg-dark);
            border: none;
            padding: 12px 30px;
            font-size: 1.1rem;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-weight: 600;
            transition: var(--transition);
            margin-top: 20px;
            display: block;
            margin-left: auto;
        }

        .next-btn:hover:not(:disabled) {
            background: var(--accent-emerald-dark);
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 200, 150, 0.3);
        }

        .next-btn:disabled {
            background: rgba(255, 255, 255, 0.1);
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        /* Install Prerequisites */
        .install-log {
            background: rgba(0, 0, 0, 0.3);
            border-radius: var(--border-radius);
            padding: 20px;
            margin-bottom: 20px;
            max-height: 300px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 0.9rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .log-line {
            margin-bottom: 5px;
            padding: 5px 0;
        }

        .log-info {
            color: #7aa3c9;
        }

        .log-success {
            color: var(--success);
        }

        .log-error {
            color: var(--error);
        }

        .log-skip {
            color: var(--warning);
        }

        .copy-log-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: var(--text-primary);
            border-radius: var(--border-radius);
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.9rem;
            margin-bottom: 15px;
            transition: var(--transition);
        }

        .copy-log-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: var(--accent-emerald);
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Dashboard */
        .dashboard-container {
            display: none;
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }

        .tab-container {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }

        .tab {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px 25px;
            border-radius: var(--border-radius);
            cursor: pointer;
            transition: var(--transition);
            border: 1px solid transparent;
        }

        .tab.active {
            background: var(--accent-emerald);
            color: var(--bg-dark);
            border-color: rgba(0, 0, 0, 0.2);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }

        .form-control {
            width: 100%;
            padding: 12px 15px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: var(--border-radius);
            color: var(--text-primary);
            font-size: 1rem;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--accent-emerald);
        }

        .save-btn {
            background: var(--accent-emerald);
            color: var(--bg-dark);
            border: none;
            padding: 12px 30px;
            font-size: 1rem;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-weight: 600;
            transition: var(--transition);
        }

        .save-btn:hover {
            background: var(--accent-emerald-dark);
        }

        .test-btn {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 10px 20px;
            border-radius: var(--border-radius);
            cursor: pointer;
            transition: var(--transition);
        }

        .test-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .status-badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            margin-top: 5px;
        }

        .status-online {
            background: rgba(0, 200, 150, 0.2);
            color: var(--success);
        }

        .status-offline {
            background: rgba(255, 82, 82, 0.2);
            color: var(--error);
        }

        .agent-controls {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .control-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: var(--border-radius);
            padding: 20px;
        }

        .control-title {
            font-size: 1.2rem;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.1);
            transition: .4s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--accent-emerald);
        }

        input:checked + .slider:before {
            transform: translateX(26px);
        }

        .status-container {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
        }

        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--error);
        }

        .status-indicator.online {
            background: var(--success);
        }

        footer {
            text-align: center;
            padding: 20px;
            color: var(--text-secondary);
            font-size: 0.9rem;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            margin-top: 30px;
        }

        @media (max-width: 768px) {
            .step-indicator {
                flex-wrap: wrap;
                gap: 10px;
            }
            
            .step {
                width: 50%;
            }
            
            .system-checks {
                grid-template-columns: 1fr;
            }
            
            .dashboard-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">
                <i class="fas fa-leaf logo-icon"></i>
                <div class="logo-text">BambooClaw</div>
            </div>
            <button class="theme-toggle" id="themeToggle">
                <i class="fas fa-moon"></i> Dark Mode
            </button>
        </header>

        <!-- Installer Wizard -->
        <div class="wizard-container" id="installerContainer">
            <div class="step-indicator">
                <div class="step active" id="step1Indicator">
                    <div class="step-number">1</div>
                    <div class="step-label">System Check</div>
                </div>
                <div class="step" id="step2Indicator">
                    <div class="step-number">2</div>
                    <div class="step-label">Install Prerequisites</div>
                </div>
                <div class="step" id="step3Indicator">
                    <div class="step-number">3</div>
                    <div class="step-label">Install BambooClaw</div>
                </div>
                <div class="step" id="step4Indicator">
                    <div class="step-number">4</div>
                    <div class="step-label">Finalization</div>
                </div>
            </div>

            <!-- Step 1: System Check -->
            <div class="step