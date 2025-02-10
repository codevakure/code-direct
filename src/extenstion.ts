import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as moment from 'moment';

interface CopilotMetrics {
    startTime: number;
    endTime: number;
    totalTime: number;
    queries: string[];
    suggestionsUsed: number;
    modifiedFiles: Set<string>;
    documentationCount: number;
    testCasesCount: number;
    sessionStartTime?: number;
}

export class MetricsTracker {
    private static instance: MetricsTracker;
    private metricsFile: string;
    private currentMetrics: CopilotMetrics;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        const storageDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.code-direct');
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir);
        }
        this.metricsFile = path.join(storageDir, 'metrics.json');
        this.currentMetrics = this.loadMetrics();
    }

    static getInstance(): MetricsTracker {
        if (!MetricsTracker.instance) {
            MetricsTracker.instance = new MetricsTracker();
        }
        return MetricsTracker.instance;
    }

    private loadMetrics(): CopilotMetrics {
        try {
            if (fs.existsSync(this.metricsFile)) {
                const data = fs.readFileSync(this.metricsFile, 'utf8');
                const parsed = JSON.parse(data);
                return {
                    ...parsed,
                    modifiedFiles: new Set(parsed.modifiedFiles)
                };
            }
        } catch (error) {
            console.error('Error loading metrics:', error);
        }
        return {
            startTime: Date.now(),
            endTime: Date.now(),
            totalTime: 0,
            queries: [],
            suggestionsUsed: 0,
            modifiedFiles: new Set<string>(),
            documentationCount: 0,
            testCasesCount: 0
        };
    }

    private saveMetrics(): void {
        try {
            const serializableMetrics = {
                ...this.currentMetrics,
                modifiedFiles: Array.from(this.currentMetrics.modifiedFiles)
            };
            fs.writeFileSync(this.metricsFile, JSON.stringify(serializableMetrics));
        } catch (error) {
            console.error('Error saving metrics:', error);
        }
    }

    startSession(): void {
        this.currentMetrics.sessionStartTime = Date.now();
    }

    endSession(): void {
        if (this.currentMetrics.sessionStartTime) {
            const sessionDuration = Date.now() - this.currentMetrics.sessionStartTime;
            this.currentMetrics.totalTime += sessionDuration;
            this.currentMetrics.endTime = Date.now();
            this.currentMetrics.sessionStartTime = undefined;
            this.saveMetrics();
        }
    }

    trackQuery(query: string): void {
        this.currentMetrics.queries.push(query);
        this.saveMetrics();
    }

    trackSuggestionUsed(): void {
        this.currentMetrics.suggestionsUsed++;
        this.saveMetrics();
    }

    trackFileModification(filePath: string): void {
        this.currentMetrics.modifiedFiles.add(filePath);
        this.saveMetrics();
    }

    trackDocumentation(): void {
        this.currentMetrics.documentationCount++;
        this.saveMetrics();
    }

    trackTestCase(): void {
        this.currentMetrics.testCasesCount++;
        this.saveMetrics();
    }

    calculateDeveloperEfficiency(): number {
        const totalSuggestions = this.currentMetrics.suggestionsUsed;
        const totalModifiedFiles = this.currentMetrics.modifiedFiles.size;
        const totalTime = this.currentMetrics.totalTime / (1000 * 60 * 60); // Convert to hours

        // Efficiency formula:
        // (suggestions_used + modified_files + documentation + test_cases) / total_hours
        const efficiency = (totalSuggestions + totalModifiedFiles + 
            this.currentMetrics.documentationCount + this.currentMetrics.testCasesCount) / totalTime;

        return Number(efficiency.toFixed(2));
    }

    async generateReport(): Promise<string> {
        const startDate = moment(this.currentMetrics.startTime).format('YYYY-MM-DD');
        const endDate = moment(this.currentMetrics.endTime).format('YYYY-MM-DD');
        const efficiency = this.calculateDeveloperEfficiency();

        const report = `
## Copilot Usage Report (${startDate} to ${endDate})

### Time Metrics
- Total time spent: ${(this.currentMetrics.totalTime / (1000 * 60 * 60)).toFixed(2)} hours

### Usage Metrics
- Total queries: ${this.currentMetrics.queries.length}
- Suggestions used: ${this.currentMetrics.suggestionsUsed}
- Files modified: ${this.currentMetrics.modifiedFiles.size}
- Documentation generated: ${this.currentMetrics.documentationCount}
- Test cases generated: ${this.currentMetrics.testCasesCount}

### Developer Efficiency
- Efficiency Score: ${efficiency} (actions/hour)

### Modified Files
${Array.from(this.currentMetrics.modifiedFiles).map(file => `- ${file}`).join('\n')}
`;
        return report;
    }

    async sendTeamsNotification(): Promise<void> {
        const config = vscode.workspace.getConfiguration('copilotMetrics');
        const webhookUrl = config.get<string>('teamsWebhookUrl');

        if (!webhookUrl) {
            throw new Error('Teams webhook URL not configured');
        }

        const report = await this.generateReport();
        const message = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": "Copilot Metrics Weekly Report",
            "themeColor": "0076D7",
            "title": "Copilot Usage Weekly Report",
            "sections": [{
                "text": report
            }]
        };

        try {
            await axios.post(webhookUrl, message);
        } catch (error) {
            console.error('Error sending Teams notification:', error);
            throw error;
        }
    }
}

// Register extension
export function activate(context: vscode.ExtensionContext) {
    const tracker = MetricsTracker.getInstance();
    tracker.startSession();

    // Track when Copilot is activated
    const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
    if (copilotExtension) {
        // Track Copilot suggestions
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.contentChanges.length > 0) {
                    tracker.trackFileModification(event.document.fileName);
                }
            })
        );

        // Track documentation (comments)
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const changes = event.contentChanges[0]?.text || '';
                if (changes.includes('/**') || changes.includes('///')) {
                    tracker.trackDocumentation();
                }
            })
        );

        // Track test cases
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const changes = event.contentChanges[0]?.text || '';
                if (changes.includes('test') || changes.includes('describe') || changes.includes('it(')) {
                    tracker.trackTestCase();
                }
            })
        );
    }

    // Register command to generate report
    let disposable = vscode.commands.registerCommand('code-direct.generateReport', async () => {
        try {
            await tracker.sendTeamsNotification();
            vscode.window.showInformationMessage('Copilot metrics report sent to Teams');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to send report to Teams');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    const tracker = MetricsTracker.getInstance();
    tracker.endSession();
}