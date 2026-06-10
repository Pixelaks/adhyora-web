// =================================================================
// ⚡ ADHYORA SHARED UTILITIES
// These functions are used by principalApp, teacherApp, dashboardApp.
// Load this BEFORE any app script via a plain <script> tag.
// =================================================================

// Converts "12:30 PM" format → decimal hours (e.g. 12.5)
window.toDec = function(t) {
    let [hm, m] = t.split(' ');
    let [h, min] = hm.split(':').map(Number);
    if (m === 'PM' && h !== 12) h += 12;
    if (m === 'AM' && h === 12) h = 0;
    return h + (min / 60);
};

// Given a timetable config and a period number, returns { start: "9:30 AM", end: "10:30 AM" }
window.getPeriodTiming = function(config, targetPeriod) {
    if (!config) config = {
        startTime: "09:30",
        periodDurationMin: 60,
        lunchBreakAfterPeriod: 3,
        lunchDurationMin: 45
    };

    let [hours, mins] = (config.startTime || "09:30").split(':').map(Number);
    let totalMins = (hours * 60) + mins;
    let pDuration = parseInt(config.periodDurationMin) || 60;
    let lAfter = parseInt(config.lunchBreakAfterPeriod) || 3;
    let lDuration = parseInt(config.lunchDurationMin) || 45;

    totalMins += (targetPeriod - 1) * pDuration;
    if (targetPeriod > lAfter) totalMins += lDuration;
    let endMins = totalMins + pDuration;

    const formatTime = (m) => {
        let h = Math.floor(m / 60);
        let min = Math.floor(m % 60);
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${h}:${min.toString().padStart(2, '0')} ${ampm}`;
    };

    return { start: formatTime(totalMins), end: formatTime(endMins) };
};