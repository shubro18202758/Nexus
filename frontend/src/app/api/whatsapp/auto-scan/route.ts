// ===================================================================
// Auto-Scan API — Autonomous NanoClaw Scanner Control
//
// POST /api/whatsapp/auto-scan  → Start / stop / force-scan / configure
// GET  /api/whatsapp/auto-scan  → Get scanner stats + recent detections
// PUT  /api/whatsapp/auto-scan  → Update scanner configuration
//
// This is the REST control plane for the autonomous scanner daemon.
// Once started, the scanner runs fully autonomously — no manual
// intervention required. The student only needs to:
//   1. Link WhatsApp once (QR scan)
//   2. Hit POST { action: "start" }
//   3. Everything else is automatic
// ===================================================================

import { NextResponse } from "next/server";
import {
    getAutonomousScanner,
    type ScannerConfig,
    type GroupClassification,
} from "@/lib/msg/autonomous-scanner";

export const dynamic = "force-dynamic";

/** GET — Return scanner stats, recent scans, auto-detected events, group configs */
export async function GET() {
    try {
        const scanner = getAutonomousScanner();
        const stats = scanner.getStats();

        return NextResponse.json({
            ...stats,
            // Add abbreviated event list for lightweight polling
            recentEventsCount: stats.autoDetectedEvents.length,
            recentScansCount: stats.recentScans.length,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to get scanner stats", details: String(error) },
            { status: 500 },
        );
    }
}

/**
 * POST — Scanner actions:
 *   { action: "start", config?: {...} }  → Start autonomous scanning
 *   { action: "stop" }                   → Stop scanner
 *   { action: "pause" }                  → Pause scanner
 *   { action: "resume" }                 → Resume scanner
 *   { action: "force-scan" }             → Trigger immediate scan
 *   { action: "classify-group", groupId, classification, enabled? }
 *   { action: "clear-data" }             → Clear accumulated scan data
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action } = body;

        const scanner = getAutonomousScanner();

        switch (action) {
            case "start": {
                const config: ScannerConfig | undefined = body.config;
                await scanner.start(config);
                return NextResponse.json({
                    success: true,
                    message: "Autonomous scanner started",
                    stats: scanner.getStats(),
                });
            }

            case "stop": {
                scanner.stop();
                return NextResponse.json({
                    success: true,
                    message: "Autonomous scanner stopped",
                });
            }

            case "pause": {
                scanner.pause();
                return NextResponse.json({
                    success: true,
                    message: "Autonomous scanner paused",
                });
            }

            case "resume": {
                scanner.resume();
                return NextResponse.json({
                    success: true,
                    message: "Autonomous scanner resumed",
                });
            }

            case "force-scan": {
                const result = await scanner.forceScan();
                return NextResponse.json({
                    success: true,
                    message: result
                        ? `Scan complete: ${result.messagesProcessed} msgs → ${result.eventsDetected} events`
                        : "No scan performed (already scanning or no new messages)",
                    result,
                });
            }

            case "classify-group": {
                const { groupId, classification, enabled } = body;
                if (!groupId || !classification) {
                    return NextResponse.json(
                        { error: "Provide groupId and classification" },
                        { status: 400 },
                    );
                }
                const validClassifications: GroupClassification[] = [
                    "academic", "non-academic", "monitored", "unclassified",
                ];
                if (!validClassifications.includes(classification)) {
                    return NextResponse.json(
                        { error: `Invalid classification. Use: ${validClassifications.join(", ")}` },
                        { status: 400 },
                    );
                }
                scanner.classifyGroup(groupId, classification, enabled ?? true);
                return NextResponse.json({
                    success: true,
                    message: `Group ${groupId} classified as ${classification}`,
                });
            }

            case "sync-groups": {
                scanner.syncGroups();
                const stats = scanner.getStats();
                return NextResponse.json({
                    success: true,
                    message: `Synced ${stats.groups.length} groups`,
                    groups: stats.groups,
                });
            }

            case "clear-data": {
                scanner.clearData();
                return NextResponse.json({
                    success: true,
                    message: "Scanner data cleared",
                });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: "${action}". Use: start, stop, pause, resume, force-scan, classify-group, sync-groups, clear-data` },
                    { status: 400 },
                );
        }
    } catch (error) {
        return NextResponse.json(
            { error: "Auto-scan action failed", details: String(error) },
            { status: 500 },
        );
    }
}

/** PUT — Update scanner configuration on-the-fly */
export async function PUT(req: Request) {
    try {
        const config: ScannerConfig = await req.json();
        const scanner = getAutonomousScanner();

        scanner.configure(config);

        return NextResponse.json({
            success: true,
            message: "Scanner configuration updated",
            stats: scanner.getStats(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to update scanner config", details: String(error) },
            { status: 500 },
        );
    }
}
