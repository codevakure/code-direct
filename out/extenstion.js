"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsTracker = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
class MetricsTracker {
    constructor() {
        this.disposables = [];
        const storageDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".code-direct");
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir);
        }
        this.metricsFile = path.join(storageDir, "metrics.json");
        this.currentMetrics = this.loadMetrics();
    }
    static getInstance() {
        if (!MetricsTracker.instance) {
            MetricsTracker.instance = new MetricsTracker();
        }
        return MetricsTracker.instance;
    }
    loadMetrics() {
        try {
            if (fs.existsSync(this.metricsFile)) {
                const data = fs.readFileSync(this.metricsFile, "utf8");
                const parsed = JSON.parse(data);
                return {
                    ...parsed,
                    modifiedFiles: new Set(parsed.modifiedFiles),
                };
            }
        }
        catch (error) {
            console.error("Error loading metrics:", error);
        }
        return {
            startTime: Date.now(),
            endTime: Date.now(),
            totalTime: 0,
            queries: [],
            suggestionsUsed: 0,
            modifiedFiles: new Set(),
            documentationCount: 0,
            testCasesCount: 0,
        };
    }
    saveMetrics() {
        try {
            const serializableMetrics = {
                ...this.currentMetrics,
                modifiedFiles: Array.from(this.currentMetrics.modifiedFiles),
            };
            fs.writeFileSync(this.metricsFile, JSON.stringify(serializableMetrics));
        }
        catch (error) {
            console.error("Error saving metrics:", error);
        }
    }
    startSession() {
        this.currentMetrics.sessionStartTime = Date.now();
    }
    endSession() {
        if (this.currentMetrics.sessionStartTime) {
            const sessionDuration = Date.now() - this.currentMetrics.sessionStartTime;
            this.currentMetrics.totalTime += sessionDuration;
            this.currentMetrics.endTime = Date.now();
            this.currentMetrics.sessionStartTime = undefined;
            this.saveMetrics();
        }
    }
    trackQuery(query) {
        this.currentMetrics.queries.push(query);
        this.saveMetrics();
    }
    trackSuggestionUsed() {
        this.currentMetrics.suggestionsUsed++;
        this.saveMetrics();
    }
    trackFileModification(filePath) {
        this.currentMetrics.modifiedFiles.add(filePath);
        this.saveMetrics();
    }
    trackDocumentation() {
        this.currentMetrics.documentationCount++;
        this.saveMetrics();
    }
    trackTestCase() {
        this.currentMetrics.testCasesCount++;
        this.saveMetrics();
    }
    calculateDeveloperEfficiency() {
        const totalSuggestions = this.currentMetrics.suggestionsUsed;
        const totalModifiedFiles = this.currentMetrics.modifiedFiles.size;
        const totalTime = this.currentMetrics.totalTime / (1000 * 60 * 60); // Convert to hours
        // Efficiency formula:
        // (suggestions_used + modified_files + documentation + test_cases) / total_hours
        const efficiency = (totalSuggestions +
            totalModifiedFiles +
            this.currentMetrics.documentationCount +
            this.currentMetrics.testCasesCount) /
            totalTime;
        return Number(efficiency.toFixed(2));
    }
    async generateReport() {
        const startDate = (0, moment_1.default)(this.currentMetrics.startTime).format("YYYY-MM-DD");
        const endDate = (0, moment_1.default)(this.currentMetrics.endTime).format("YYYY-MM-DD");
        const efficiency = this.calculateDeveloperEfficiency();
        const report = `
## Copilot Usage Report (${startDate} to ${endDate})

### Time Metrics
- Total time spent: ${(this.currentMetrics.totalTime /
            (1000 * 60 * 60)).toFixed(2)} hours

### Usage Metrics
- Total queries: ${this.currentMetrics.queries.length}
- Suggestions used: ${this.currentMetrics.suggestionsUsed}
- Files modified: ${this.currentMetrics.modifiedFiles.size}
- Documentation generated: ${this.currentMetrics.documentationCount}
- Test cases generated: ${this.currentMetrics.testCasesCount}

### Developer Efficiency
- Efficiency Score: ${efficiency} (actions/hour)

### Modified Files
${Array.from(this.currentMetrics.modifiedFiles)
            .map((file) => `- ${file}`)
            .join("\n")}
`;
        return report;
    }
    async sendTeamsNotification() {
        const config = vscode.workspace.getConfiguration("copilotMetrics");
        const webhookUrl = config.get("teamsWebhookUrl");
        if (!webhookUrl) {
            throw new Error("Teams webhook URL not configured");
        }
        const report = await this.generateReport();
        const message = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            summary: "Copilot Metrics Weekly Report",
            themeColor: "0076D7",
            title: "Copilot Usage Weekly Report",
            sections: [
                {
                    text: report,
                },
            ],
        };
        try {
            await axios_1.default.post(webhookUrl, message);
        }
        catch (error) {
            console.error("Error sending Teams notification:", error);
            throw error;
        }
    }
}
exports.MetricsTracker = MetricsTracker;
// Register extension
function activate(context) {
    // Add this at the start of activate
    console.log('Extension is being activated');
    const tracker = MetricsTracker.getInstance();
    tracker.startSession();
    // Add this before command registration
    console.log('Registering command: code-direct.generateReport');
    let disposable = vscode.commands.registerCommand('code-direct.generateReport', () => {
        console.log('Command executed!'); // Add this
        vscode.window.showInformationMessage('Command executed successfully!');
    });
    context.subscriptions.push(disposable);
    // Add this at the end of activate
    console.log('Extension activation completed');
}
function deactivate() {
    const tracker = MetricsTracker.getInstance();
    tracker.endSession();
}
//# sourceMappingURL=extenstion.js.map