"use client";

/**
 * Velocity Tracker — measures learning speed from actual user activity.
 * 
 * Inputs:
 * - Check-in timestamps (from progress evaluations)
 * - Mastery score deltas (before/after each check-in)
 * - Session durations
 * 
 * Outputs:
 * - Current velocity (concepts/week)
 * - Trend (accelerating / stable / decelerating)
 * - Consistency score (0-100)
 * - Estimated time to next milestone
 */

export interface VelocityDataPoint {
    timestamp: number;           // Unix ms
    masteryScoreBefore: number;  // 0-100
    masteryScoreAfter: number;   // 0-100
    stage: string;               // Which copilot stage or manual check-in
}

export interface VelocityMetrics {
    currentVelocity: number;     // Score points gained per day
    trend: "accelerating" | "stable" | "decelerating" | "unknown";
    consistencyScore: number;    // 0-100 — how regularly user is engaging
    avgSessionGapHrs: number;    // Average hours between sessions
    totalPointsGained: number;   // Total mastery score delta
    dataPoints: number;          // Number of recorded check-ins
    estimatedDaysToMilestone: number; // At current velocity, days to reach 80+ score
}

const STORAGE_KEY = "kelp_velocity_log";

/**
 * Get the velocity log from localStorage.
 */
export function getVelocityLog(): VelocityDataPoint[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Record a new data point.
 */
export function recordVelocityPoint(point: VelocityDataPoint): void {
    if (typeof window === "undefined") return;
    const log = getVelocityLog();
    log.push(point);
    // Keep last 100 data points to prevent unbounded growth
    const trimmed = log.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Calculate velocity metrics from the log.
 */
export function calculateVelocityMetrics(log?: VelocityDataPoint[]): VelocityMetrics {
    const data = log || getVelocityLog();

    if (data.length < 2) {
        return {
            currentVelocity: 0,
            trend: "unknown",
            consistencyScore: 0,
            avgSessionGapHrs: 0,
            totalPointsGained: 0,
            dataPoints: data.length,
            estimatedDaysToMilestone: Infinity,
        };
    }

    // Calculate total points gained
    const totalPointsGained = data.reduce((sum, d) => sum + (d.masteryScoreAfter - d.masteryScoreBefore), 0);

    // Calculate time span in days
    const firstTimestamp = data[0].timestamp;
    const lastTimestamp = data[data.length - 1].timestamp;
    const spanDays = Math.max(1, (lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24));

    // Velocity = points per day
    const currentVelocity = Math.round((totalPointsGained / spanDays) * 10) / 10;

    // Calculate session gaps
    const gaps: number[] = [];
    for (let i = 1; i < data.length; i++) {
        gaps.push((data[i].timestamp - data[i - 1].timestamp) / (1000 * 60 * 60));
    }
    const avgSessionGapHrs = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10;

    // Consistency = inverse of standard deviation of gaps (normalized to 0-100)
    const gapMean = avgSessionGapHrs;
    const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g / 1 - gapMean, 2), 0) / gaps.length;
    const gapStdDev = Math.sqrt(gapVariance);
    const consistencyScore = Math.min(100, Math.max(0, Math.round(100 - gapStdDev * 2)));

    // Trend = compare recent velocity to overall velocity
    const recentData = data.slice(-Math.min(5, data.length));
    const recentGain = recentData.reduce((s, d) => s + (d.masteryScoreAfter - d.masteryScoreBefore), 0);
    const recentSpan = Math.max(1, (recentData[recentData.length - 1].timestamp - recentData[0].timestamp) / (1000 * 60 * 60 * 24));
    const recentVelocity = recentGain / recentSpan;

    let trend: VelocityMetrics["trend"];
    if (recentVelocity > currentVelocity * 1.2) {
        trend = "accelerating";
    } else if (recentVelocity < currentVelocity * 0.8) {
        trend = "decelerating";
    } else {
        trend = "stable";
    }

    // Estimate days to milestone (score 80)
    const latestScore = data[data.length - 1].masteryScoreAfter;
    const remaining = Math.max(0, 80 - latestScore);
    const estimatedDaysToMilestone = currentVelocity > 0 ? Math.round(remaining / currentVelocity) : Infinity;

    return {
        currentVelocity,
        trend,
        consistencyScore,
        avgSessionGapHrs,
        totalPointsGained: Math.round(totalPointsGained * 10) / 10,
        dataPoints: data.length,
        estimatedDaysToMilestone,
    };
}
