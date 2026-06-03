import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, onSnapshot, orderBy, writeBatch, serverTimestamp, enableIndexedDbPersistence, setDoc, deleteDoc, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
    authDomain: "adhyora-5d4c1.firebaseapp.com",
    projectId: "adhyora-5d4c1",
    storageBucket: "adhyora-5d4c1.firebasestorage.app",
    messagingSenderId: "206050348148",
    appId: "1:206050348148:web:da4e421e00ec2f77429521"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-south1");
const adminAPI = httpsCallable(functions, 'principalAPI');
const messaging = getMessaging(app);

// 🚀 OPTIMIZATION: Enable Local Disk Caching to cut refresh costs to ZERO
try {
    enableIndexedDbPersistence(db).catch((err) => {
        console.warn("Firebase Offline Persistence Notice: ", err.code);
    });
} catch(e) {}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(err => console.log('SW registration failed: ', err));
    });
}

// ==========================================
// 📦 CORE VARIABLES & GLOBAL STATE
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const currentCollegeID = urlParams.get('college');
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";

let currentUserID = "";
let myRealName = "Accountant";
let myCurrentPushToken = "";

let cachedStudents = [];
let renderLimit = 50;
let rawLedgerCache = [];

let currentActiveStudentID = "";
let currentActiveStudentName = "";
let currentActiveStudentDept = "";
let feeCacheMap = {};
let pendingVoidTransaction = null;

// 🚨 SESSION VARIABLES
let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let sessionsCache = new Map();

// ==========================================
// 🛠️ UTILITIES
// ==========================================
window.showToast = function(msg) { 
    let t = document.getElementById("rcToast"); 
    if(!t) return;
    t.innerText = msg; 
    t.style.bottom = "30px"; 
    setTimeout(() => t.style.bottom = "-100px", 3000); 
}

window.showSubLoader = function(message) {
    const loader = document.getElementById("subPaymentLoaderOverlay");
    const text = document.getElementById("subPaymentLoaderText");
    if(text) text.innerText = message;
    if(loader) { loader.style.opacity = "1"; loader.style.pointerEvents = "all"; }
}

window.hideSubLoader = function() {
    const loader = document.getElementById("subPaymentLoaderOverlay");
    if(loader) { loader.style.opacity = "0"; loader.style.pointerEvents = "none"; }
}

function sanitizeHTML(str) {
    if (!str) return "";
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ==========================================
// 🚨 AUTH, SESSIONS & SECURITY ALERTS
// ==========================================
if (!currentCollegeID) { 
    window.location.replace("index.html"); 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            ListenToAccountantProfile();
        } else { window.location.replace("index.html"); }
    });
}

function ListenToAccountantProfile() {
    const accRef = doc(db, "colleges", currentCollegeID, "accountants", currentUserID);
    
    onSnapshot(accRef, (snap) => {
        if (!snap.exists()) {
            localStorage.clear();
            sessionStorage.clear();
            signOut(auth).then(() => window.location.replace("index.html"));
            return;
        }

        const data = snap.data();
        myRealName = data.name || "Accountant";
        
        const nameDisplay = document.getElementById("accNameDisplay");
        const settingsNameText = document.getElementById("settingsNameText");
        if(nameDisplay) nameDisplay.innerText = myRealName;
        if(settingsNameText) settingsNameText.innerText = myRealName;

        const pendingLockOverlay = document.getElementById("pendingLockOverlay");

        if (data.status === "Approved") {
            if(pendingLockOverlay) pendingLockOverlay.classList.add("hidden");
            
            // 🚨 START SESSIONS & PUSH ALERTS
            registerWebSession();
            startSessionListener();
            requestPushPermissions(true);
            
            InitDashboardData(); 
            InitExpenseTracker(); // 👈 ADD THIS LINE RIGHT HERE!
        } 
        else if (data.status === "Pending") {
            if(pendingLockOverlay) pendingLockOverlay.classList.remove("hidden");
        }
        else {
            alert("Your account access has been revoked.");
            localStorage.clear();
            sessionStorage.clear();
            signOut(auth).then(() => window.location.replace("index.html"));
        }
    });
}

async function registerWebSession() {
    if (!myWebDeviceID) {
        myWebDeviceID = "WEB_" + Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem("myWebDeviceID", myWebDeviceID);
    }
    
    let osName = "Web Browser";
    if (navigator.userAgent.indexOf("Win") != -1) osName = "Windows PC";
    if (navigator.userAgent.indexOf("Mac") != -1) osName = "Mac OS";
    if (navigator.userAgent.indexOf("Linux") != -1) osName = "Linux PC";
    if (navigator.userAgent.indexOf("Android") != -1) osName = "Android Device";
    if (navigator.userAgent.indexOf("like Mac") != -1) osName = "iOS Device";

    try {
        const accRef = doc(db, "colleges", currentCollegeID, "accountants", currentUserID);
        const sessionRef = doc(accRef, "sessions", myWebDeviceID);
        
        // 1. Check if this is a completely new login event
        const sessionSnap = await getDoc(sessionRef);
        const isNewLogin = !sessionSnap.exists();

        // 2. Save the active session
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, {merge: true});
        
        // 3. 🚨 SECURITY ALERT: Fire a push notification to OTHER devices if this is a fresh login!
        if (isNewLogin) {
            const accSnap = await getDoc(accRef);
            if (accSnap.exists() && accSnap.data().webFcmTokens) {
                // Target all tokens EXCEPT the one we are currently using
                let targetTokens = accSnap.data().webFcmTokens.filter(t => t !== myCurrentPushToken);
                
                if (targetTokens.length > 0) {
                    fetch(APPS_SCRIPT_URL, {
                        method: "POST", mode: "no-cors",
                        body: JSON.stringify({
                            title: "⚠️ Security Alert: New Login", 
                            body: `Your Accountant account was accessed from a new device (${osName}).`,
                            image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/main/AdhyoraSplashLogo5.png", 
                            type: "security", priority: "high", 
                            tokens: targetTokens
                        })
                    }).catch(e => console.log("Push trigger failed:", e));
                }
            }
        }
        
        // Listen for remote kick
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) {
                localStorage.clear();
                sessionStorage.clear();
                signOut(auth).then(() => window.location.replace("index.html"));
            }
        });
    } catch(e) {}
}

function startSessionListener() {
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "accountants", currentUserID, "sessions")), (snap) => {
        sessionsCache.clear();
        snap.docs.forEach(doc => { sessionsCache.set(doc.id, { id: doc.id, ...doc.data() }); });
        if (document.getElementById("sessionsModal")?.classList.contains("active")) renderSessions();
    });
}

function renderSessions() {
    let container = document.getElementById("sessionsListContainer");
    if (!container) return;
    if (sessionsCache.size === 0) { container.innerHTML = `<div class="no-data-text">No active sessions.</div>`; return; }
    
    let html = "";
    sessionsCache.forEach((d) => {
        let devName = d.deviceName || "Unknown Device";
        let isMe = (d.id === myWebDeviceID);
        if (isMe) devName += " (This Browser)";
        
        let timeStr = "Recently";
        if (d.loginTime) timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        let btnHtml = isMe ? `<span style="font-size:11px; color:var(--brand-green); font-weight:bold;">Active</span>` : `<button onclick="window.revokeSession('${d.id}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px; transition:0.2s;"><i class="fas fa-trash"></i> Kick</button>`;
        
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-grid-color); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px;">
                <div>
                    <div style="font-weight:bold; color:var(--text-green); font-size:13px; margin-bottom:4px;">${devName}</div>
                    <div style="font-size:11px; color:#64748b;">Logged in: ${timeStr}</div>
                </div>
                ${btnHtml}
            </div>`;
    });
    container.innerHTML = html;
}

window.revokeSession = async function(sessionID) {
    if (!confirm("Are you sure you want to log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "accountants", currentUserID, "sessions", sessionID));
        window.showToast("Device kicked successfully.");
    } catch(e) { window.showToast("Error revoking session."); }
};

document.getElementById("btnDevices")?.addEventListener("click", () => {
    document.getElementById("settingsOverlay")?.classList.remove("active");
    document.getElementById("sessionsModal")?.classList.add("active");
    renderSessions(); 
});


// ==========================================
// 🚨 ACCOUNTANT PUSH NOTIFICATION ENGINE 🚨
// ==========================================
function updateNotificationToggleUI() {
    const toggle = document.getElementById("notifToggleSwitch");
    if (!toggle) return;
    if (Notification.permission === "granted" && myCurrentPushToken !== "") {
        toggle.classList.add("active");
    } else {
        toggle.classList.remove("active");
    }
}

async function requestPushPermissions(isSilent = false) {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                myCurrentPushToken = currentToken; 
                
                // 🚨 SAVE TO ACCOUNTANT PROFILE
                const accRef = doc(db, "colleges", currentCollegeID, "accountants", currentUserID);
                const pSnap = await getDoc(accRef);
                let activeTokens = [];
                
                if (pSnap.exists() && pSnap.data().webFcmTokens) {
                    activeTokens = pSnap.data().webFcmTokens;
                }

                activeTokens = activeTokens.filter(t => t !== currentToken);
                activeTokens.push(currentToken);
                if (activeTokens.length > 3) activeTokens = activeTokens.slice(activeTokens.length - 3);

                await setDoc(accRef, { webFcmTokens: activeTokens }, { merge: true });

                const getSafe = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
                let safeCol = getSafe(currentCollegeID);
                
                // Sub to Accountant specific topics
                let topicsToJoin = [
                    `${safeCol}_ALL`, 
                    `${safeCol}_ACCOUNTANT`, 
                    `ADHYORA_GLOBAL_USERS`
                ];

                fetch(APPS_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    body: JSON.stringify({ action: "subscribe", token: currentToken, topics: topicsToJoin })
                }).then(() => {
                    updateNotificationToggleUI();
                    if (!isSilent) window.showToast("✅ Notifications Enabled!");
                });
            }
        } else if(!isSilent) {
            window.showToast("⚠️ Notifications are blocked in your browser.");
        }
    } catch (error) {
        console.error('🔥 PUSH SETUP ERROR:', error);
    }
}

async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        if(toggle) toggle.style.opacity = "0.5";

        await deleteToken(messaging);

        if (myCurrentPushToken && currentCollegeID && currentUserID) {
            const accRef = doc(db, "colleges", currentCollegeID, "accountants", currentUserID);
            await updateDoc(accRef, { webFcmTokens: arrayRemove(myCurrentPushToken) });
        }
        
        myCurrentPushToken = ""; 
        if(toggle) toggle.style.opacity = "1";
        updateNotificationToggleUI();
        window.showToast("Notifications Disabled.");
    } catch (e) {}
}

document.getElementById("btnToggleNotifications")?.addEventListener("click", async () => {
    const toggle = document.getElementById("notifToggleSwitch");
    if (toggle && toggle.classList.contains("active")) {
        if (confirm("Disable notifications for this browser?")) await unsubscribePushNotifications();
    } else {
        if(toggle) toggle.style.opacity = "0.5";
        await requestPushPermissions(false);
        if(toggle) toggle.style.opacity = "1";
    }
});


// ==========================================
// ⚙️ SETTINGS & THEMES ENGINE
// ==========================================
document.getElementById("btnSettings")?.addEventListener("click", () => document.getElementById("settingsOverlay")?.classList.add("active"));
document.getElementById("closeSettingsBtn")?.addEventListener("click", () => document.getElementById("settingsOverlay")?.classList.remove("active"));
document.getElementById("settingsOverlay")?.addEventListener("click", (e) => { if (e.target === document.getElementById("settingsOverlay")) document.getElementById("settingsOverlay")?.classList.remove("active"); });
document.getElementById("btnContactUs")?.addEventListener("click", () => window.open(`mailto:pixelaks.technologies@gmail.com?subject=Accountant Support Request`, "_blank"));
document.getElementById("btnWebsite")?.addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));

// 🚨 SECURE SIGN OUT PROCESS
async function handleSignOut() {
    if(confirm("Sign out of Accountant Portal?")) {
        try {
            // 1. Wipe Push Token
            if (myCurrentPushToken) {
                try { await deleteToken(messaging); } catch(e) { console.warn(e); }
            }
            if (myCurrentPushToken && currentCollegeID && currentUserID) {
                try {
                    const accRef = doc(db, "colleges", currentCollegeID, "accountants", currentUserID);
                    await updateDoc(accRef, { webFcmTokens: arrayRemove(myCurrentPushToken) });
                } catch(e) { console.warn(e); }
            }

            // 2. Wipe Session
            if (myWebDeviceID && currentCollegeID && currentUserID) {
                try {
                    await deleteDoc(doc(db, "colleges", currentCollegeID, "accountants", currentUserID, "sessions", myWebDeviceID));
                } catch(e) { console.warn(e); }
            }
            
            // 3. Clear Caches & Auth
            localStorage.clear();
            sessionStorage.clear();
            await signOut(auth);
            
            window.location.replace("index.html");
            
        } catch(e) {
            // Fail-safe cleanup if network errors occur mid-process
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        }
    }
}

document.getElementById("btnSignOut")?.addEventListener("click", handleSignOut);
document.getElementById("btnAccSignOut")?.addEventListener("click", handleSignOut);

document.getElementById("btnPendingSignOut")?.addEventListener("click", () => {
    localStorage.clear();
    sessionStorage.clear();
    signOut(auth).then(() => window.location.replace("index.html"));
});

// Themes
document.getElementById("btnThemes")?.addEventListener("click", () => {
    document.getElementById("settingsOverlay")?.classList.remove("active");
    document.getElementById("themesModal")?.classList.add("active");
});

function applyTheme(isDark) {
    if (!document.startViewTransition) {
        executeThemeClassToggle(isDark);
        return;
    }
    document.startViewTransition(() => {
        executeThemeClassToggle(isDark);
    });
}

function executeThemeClassToggle(isDark) {
    const metaThemeColor = document.getElementById("pwaThemeColorMeta");
    const btnDark = document.getElementById("btnDarkMode");
    const btnLight = document.getElementById("btnLightMode");

    if (isDark) {
        document.body.classList.add("dark-mode");
        if(btnDark) btnDark.style.border = "2px solid var(--brand-green)";
        if(btnLight) btnLight.style.border = "1px solid #475569";
        if(metaThemeColor) metaThemeColor.setAttribute("content", "#0f172a"); 
    } else {
        document.body.classList.remove("dark-mode");
        if(btnLight) btnLight.style.border = "2px solid var(--brand-green)";
        if(btnDark) btnDark.style.border = "1px solid #cbd5e1";
        if(metaThemeColor) metaThemeColor.setAttribute("content", "#ffffff"); 
    }
    localStorage.setItem("adhyora_principal_theme", isDark ? "dark" : "light");
}

document.getElementById("btnDarkMode")?.addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode")?.addEventListener("click", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_principal_theme") === "dark");

// ==========================================
// 🚀 NAVIGATION ENGINE
// ==========================================
const views = {
    home: document.getElementById("welcomeView"),
    studentList: document.getElementById("studentListView"),
    studentDashboard: document.getElementById("studentDashboardView"),
    expenses: document.getElementById("expenseTrackerView") // NEW VIEW
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".menu-btn");

function switchView(targetView, clickedBtn) {
    if (!targetView) return;

    if (clickedBtn && clickedBtn.classList) {
        navButtons.forEach(btn => btn.classList.remove("active-nav"));
        clickedBtn.classList.add("active-nav");
    }
    Object.values(views).forEach(v => {
        if(v) v.classList.add("hidden-view");
    });
    
    if (targetView === "MENU") {
        if(sidebar) sidebar.classList.remove("mobile-hidden"); 
        if(mainContent) mainContent.classList.remove("mobile-active");
        if (window.innerWidth > 900) views.home.classList.remove("hidden-view");
    } else {
        if (window.innerWidth <= 900) {
            if(sidebar) sidebar.classList.add("mobile-hidden"); 
            if(mainContent) mainContent.classList.add("mobile-active");
        }
        targetView.classList.remove("hidden-view"); 
        targetView.style.opacity = 0; 
        setTimeout(() => targetView.style.opacity = 1, 50);
    }
}

document.getElementById("btnNavHome")?.addEventListener("click", (e) => switchView(views.home, e.currentTarget));
document.getElementById("btnNavStudentList")?.addEventListener("click", (e) => switchView(views.studentList, e.currentTarget));
document.getElementById("btnNavExpenses")?.addEventListener("click", (e) => switchView(views.expenses, e.currentTarget)); // NEW LISTENER
document.getElementById("btnBackToStudents")?.addEventListener("click", () => switchView(views.studentList));

// ==========================================
// 📊 DASHBOARD DATA & GLOBAL LEDGER
// ==========================================
function InitDashboardData() {
    onSnapshot(collection(db, "colleges", currentCollegeID, "students"), (snap) => {
        cachedStudents = []; 
        snap.forEach(doc => { cachedStudents.push({ id: doc.id, ...doc.data() }); });
        
        const statTotal = document.getElementById("statTotalStudents");
        if(statTotal) statTotal.innerText = cachedStudents.length;
        
        let currentSearch = document.getElementById("slSearchInput")?.value.trim() || "";
        RenderStudentList(currentSearch);
    });

    onSnapshot(query(collection(db, "colleges", currentCollegeID, "master_fee_ledger"), orderBy("timestamp", "desc")), (snap) => {
        rawLedgerCache = [];
        snap.forEach(doc => {
            let d = doc.data();
            d.id = doc.id; 
            rawLedgerCache.push(d);
        });
        
        CalculateOverviewStats();
        RenderMasterLedger();
    });
}

function CalculateOverviewStats() {
    const filterEl = document.getElementById("overviewTimeFilter");
    const datePicker = document.getElementById("overviewDateFilter");
    if(!filterEl) return;

    const filterType = filterEl.value;
    if (filterType === "DATE" && datePicker) datePicker.style.display = "block";
    else if(datePicker) datePicker.style.display = "none";

    const specificDate = datePicker?.value;
    let cash = 0; let online = 0;
    
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7); 
    const currentYearStr = now.toISOString().slice(0, 4);  
    const todayStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

    let titleLabel = "Today";

    rawLedgerCache.forEach(d => {
        let isReversal = d.method === "Void / Reversal" || d.id?.startsWith("VOID");
        if (isReversal) return; 

        let include = false;
        if (filterType === "TODAY") { include = (d.date === todayStr); titleLabel = "Today"; }
        else if (filterType === "DATE") { include = (d.date === specificDate); titleLabel = specificDate || "Selected Date"; }
        else if (filterType === "MONTH") { include = d.date && d.date.startsWith(currentMonthStr); titleLabel = "This Month"; }
        else if (filterType === "YEAR") { include = d.date && d.date.startsWith(currentYearStr); titleLabel = "This Year"; }
        else if (filterType === "ALL") { include = true; titleLabel = "All Time"; }
        else if (filterType === "SEMESTER") {
            let txnDate = new Date(d.date);
            let sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            include = (txnDate >= sixMonthsAgo && txnDate <= now);
            titleLabel = "Last 6 Months";
        }

        if (include) {
            if (d.method?.includes("Cash") || d.method?.includes("Offline")) cash += (d.amount || 0);
            else online += (d.amount || 0);
        }
    });

    const statCash = document.getElementById("statTodayCash");
    const statOnline = document.getElementById("statTodayOnline");
    const lblCash = document.getElementById("statCashLabel");
    const lblOnline = document.getElementById("statOnlineLabel");

    if(statCash) statCash.innerText = `₹${cash.toLocaleString('en-IN')}`;
    if(statOnline) statOnline.innerText = `₹${online.toLocaleString('en-IN')}`;
    if(lblCash) lblCash.innerText = titleLabel;
    if(lblOnline) lblOnline.innerText = titleLabel;
}

function RenderMasterLedger() {
    const searchInputEl = document.getElementById("ledgerSearchInput");
    const methodFilterEl = document.getElementById("ledgerMethodFilter");
    const container = document.getElementById("recentActivityList");
    if (!container) return;

    const searchQ = searchInputEl ? searchInputEl.value.toLowerCase().trim() : "";
    const methodF = methodFilterEl ? methodFilterEl.value : "ALL";
    let filtered = rawLedgerCache;

    if (methodF === "ONLINE") filtered = filtered.filter(d => !d.method.includes("Cash") && !d.method.includes("Offline") && !d.method.includes("Void") && !d.id.startsWith("VOID"));
    else if (methodF === "OFFLINE") filtered = filtered.filter(d => d.method.includes("Cash") || d.method.includes("Offline"));
    else if (methodF === "VOID") filtered = filtered.filter(d => d.method.includes("Void") || d.id.startsWith("VOID"));

    if (searchQ) {
        filtered = filtered.filter(d => (d.id && d.id.toLowerCase().includes(searchQ)) || (d.studentName && d.studentName.toLowerCase().includes(searchQ)) || (d.studentId && d.studentId.toLowerCase().includes(searchQ)));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="no-data-text">No transactions match your search.</div>`;
        return;
    }

    container.innerHTML = filtered.slice(0, 100).map(d => {
        let isReversal = d.method === "Void / Reversal" || d.id.startsWith("VOID");
        let isOffline = d.method.includes("Cash") || d.method.includes("Offline");
        let icon = isReversal ? '<i class="fas fa-ban" style="color:#ef4444;"></i>' : (isOffline ? '<i class="fas fa-building" style="color:#f59e0b;"></i>' : '<i class="fas fa-globe" style="color:#22c55e;"></i>');
        let amtColor = isReversal ? '#ef4444' : '#10b981';

        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border-color); background:${isReversal ? '#fff5f5' : 'transparent'}; transition: 0.2s;">
            <div>
                <div style="font-weight:bold; font-size:13px; color:var(--text-green);">${icon} ${sanitizeHTML(d.studentName)} <span style="font-size:11px; color:#64748b;">(${sanitizeHTML(d.studentId)})</span></div>
                <div style="font-size:11px; color:#94a3b8; font-family:monospace; margin-top:2px;">Ref: ${sanitizeHTML(d.id)}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">${sanitizeHTML(d.date)} • ${sanitizeHTML(d.method || "Online")}</div>
            </div>
            <div style="font-weight:bold; font-size:15px; color:${amtColor}; text-align:right;">
                ${isReversal ? '-' : ''}₹${Math.abs(d.amount).toLocaleString('en-IN')}
            </div>
        </div>`;
    }).join('');
}

document.getElementById("overviewTimeFilter")?.addEventListener("change", CalculateOverviewStats);
document.getElementById("overviewDateFilter")?.addEventListener("change", CalculateOverviewStats);
document.getElementById("ledgerSearchInput")?.addEventListener("input", debounce(RenderMasterLedger, 300));
document.getElementById("ledgerMethodFilter")?.addEventListener("change", RenderMasterLedger);

// ==========================================
// 👨‍🎓 STUDENT SEARCH LIST
// ==========================================
function RenderStudentList(searchTerm) {
    const listEl = document.getElementById("studentListContainer"); 
    if(!listEl) return;

    let filtered = cachedStudents;
    if (searchTerm) { 
        let terms = searchTerm.toLowerCase().split(':').map(t => t.trim()); 
        filtered = cachedStudents.filter(s => { 
            let sStr = `${s.Name || ""} ${s.RollNumber || ""} ${s.Department || ""} year ${s.Year || ""}`.toLowerCase(); 
            return terms.every(term => sStr.includes(term)); 
        }); 
    }
    
    if (filtered.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text">No students found.</div>`; 
        return; 
    }
    
    let renderBatch = filtered.slice(0, renderLimit);
    let oldScroll = listEl.scrollTop;

    listEl.innerHTML = renderBatch.map(s => {
        let cleanDept = (s.Department || "Unknown").replace("DEPT_", "");
        return `<div class="data-card" onclick="window.OpenStudentLedger('${s.id}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
            <div>
                <div style="font-weight:bold; color:var(--text-green); font-size:15px; margin-bottom:2px;">${sanitizeHTML(s.Name || "Unknown")} <span style="font-size:12px; color:#94a3b8;">(${sanitizeHTML(s.RollNumber || "N/A")})</span></div>
                <div style="font-size:12px; font-weight:bold; color:#475569;">${sanitizeHTML(cleanDept)} - Year ${sanitizeHTML(s.Year || "1")}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#cbd5e1;"></i>
        </div>`;
    }).join('');
    listEl.scrollTop = oldScroll;
}

document.getElementById("slSearchInput")?.addEventListener("input", debounce((e) => {
    renderLimit = 50; 
    RenderStudentList(e.target.value.trim());
}, 250));

document.getElementById("studentListContainer")?.addEventListener("scroll", (e) => {
    let el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100) {
        if (renderLimit < cachedStudents.length) {
            renderLimit += 50;
            RenderStudentList(document.getElementById("slSearchInput")?.value.trim() || "");
        }
    }
});

// ==========================================
// 💳 INDIVIDUAL STUDENT LEDGER & PAYMENTS
// ==========================================

window.OpenStudentLedger = async (sID) => {
    currentActiveStudentID = sID;
    let student = cachedStudents.find(s => s.id === sID);
    if(!student) return;

    currentActiveStudentName = student.Name || "Unknown";
    currentActiveStudentDept = student.Department || "General";

    const nameText = document.getElementById("sdNameText");
    const rollText = document.getElementById("sdRollText");
    const deptText = document.getElementById("sdDeptText");

    if(nameText) nameText.innerText = currentActiveStudentName;
    if(rollText) rollText.innerText = `Roll No: ${student.RollNumber || sID}`;
    if(deptText) deptText.innerText = `Department: ${currentActiveStudentDept.replace("DEPT_", "")}`;
    
    switchView(views.studentDashboard, null);
    FetchFeesLedger(student);
};

async function FetchFeesLedger(studentData) {
    let container = document.getElementById("pdFeesLedgerContainer");
    if(!container) return;

    container.innerHTML = `<div class="no-data-text">Syncing ledger...</div>`;
    let resolvedDeptID = "DEPT_" + studentData.Department.replace("DEPT_", "").replace(/\s+/g, '');

    try {
        let masterMap = {};
        let totalDue = 0;
        let totalPaid = 0;
        
        const structureSnap = await getDocs(collection(db, "colleges", currentCollegeID, "fee_structures"));
        structureSnap.forEach(d => {
            let data = d.data();
            if (data.departmentID === resolvedDeptID || data.departmentID === "General") {
                masterMap[data.targetSemester] = {
                    billingRate: data.semesterFee || 0, deadline: data.dueDate || "N/A",
                    collected: 0, transactions: []
                };
                totalDue += (data.semesterFee || 0);
            }
        });

        const paymentSnap = await getDocs(collection(db, "colleges", currentCollegeID, "students", currentActiveStudentID, "payments"));
        paymentSnap.forEach(receiptDoc => {
            let log = receiptDoc.data();
            let targetSem = parseInt(log.semester);
            if (masterMap[targetSem]) {
                masterMap[targetSem].collected += (log.amount || 0);
                totalPaid += (log.amount || 0);
                masterMap[targetSem].transactions.push({
                    id: log.paymentId || receiptDoc.id,
                    date: log.date || "N/A",
                    method: log.method || "Online",
                    amount: log.amount || 0,
                    linkedTo: log.linkedTo || null,
                    voidReason: log.voidReason || "",
                    rawTime: log.timestamp ? log.timestamp.toMillis() : 0 
                });
            }
        });

        feeCacheMap = masterMap;
        let rawKeys = Object.keys(masterMap).sort((a,b) => a-b);
        
        if (rawKeys.length === 0) {
            container.innerHTML = `<div class="no-data-text">No fee structures configured.</div>`;
            return;
        }

        let html = `
        <div class="ledger-summary-box">
            <div class="summary-col">
                <span class="summary-lbl">Total Due</span>
                <strong class="summary-val amt-due">₹${totalDue.toLocaleString('en-IN')}</strong>
            </div>
            <div class="summary-col bordered">
                <span class="summary-lbl">Total Paid</span>
                <strong class="summary-val amt-paid">₹${totalPaid.toLocaleString('en-IN')}</strong>
            </div>
            <div class="summary-col">
                <span class="summary-lbl">Remaining</span>
                <strong class="summary-val amt-rem">₹${(totalDue - totalPaid).toLocaleString('en-IN')}</strong>
            </div>
        </div>`;

        rawKeys.forEach(sem => {
            let record = masterMap[sem];
            let outstanding = record.billingRate - record.collected;
            
            let statusText = outstanding <= 0 ? "Paid" : (record.collected > 0 ? "Partial" : "Unpaid");
            let statusBg = outstanding <= 0 ? "#dcfce7" : (record.collected > 0 ? "#fef3c7" : "#fef2f2");
            let statusCol = outstanding <= 0 ? "#166534" : (record.collected > 0 ? "#b45309" : "#ef4444");

            let txnsHtml = "";
            if (record.transactions.length > 0) {
                let mainTxns = record.transactions.filter(t => !t.linkedTo).sort((a,b) => b.rawTime - a.rawTime);
                let voids = record.transactions.filter(t => t.linkedTo);
                let voidedIds = new Set(voids.map(v => v.linkedTo));

                txnsHtml = `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border-color);">`;
                
                mainTxns.forEach(t => {
                    let isVoided = voidedIds.has(t.id);
                    let linkedVoid = voids.find(v => v.linkedTo === t.id);
                    
                    let boxBg = isVoided ? 'var(--bg-base)' : 'var(--bg-base)';
                    let boxBorder = isVoided ? '#e2e8f0' : 'var(--border-color)';
                    let opacity = isVoided ? '0.6' : '1';
                    let amtStyle = isVoided ? `color:#94a3b8; text-decoration:line-through;` : `color:#10b981;`;
                    let statusBadge = isVoided ? `<span style="color:#ef4444; font-size:10px; font-weight:bold; letter-spacing:1px;"><i class="fas fa-ban"></i> CANCELLED</span>` : "";

                    txnsHtml += `
                    <div style="margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:10px; background:${boxBg}; border-radius:8px; border:1px solid ${boxBorder}; opacity:${opacity}; transition:0.2s;">
                            <div>
                                <div style="font-weight:bold; color:var(--text-main); margin-bottom:2px; word-break: break-all; max-width: 100%;">${t.id} ${statusBadge}</div>
                                <div style="color:#64748b;"><i class="far fa-calendar-alt"></i> ${t.date} &nbsp;•&nbsp; <i class="fas fa-wallet"></i> ${t.method}</div>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                                <span style="font-weight:bold; font-size:15px; ${amtStyle}">₹${Math.abs(t.amount).toLocaleString('en-IN')}</span>
                                <button onclick="window.PrintThermalReceipt('${sem}', '${t.id}')" style="background:var(--bg-base); border:1px solid #cbd5e1; color:var(--text-main); padding:6px 12px; border-radius:6px; cursor:pointer;"><i class="fas fa-print"></i></button>
                                
                                ${(!isVoided && (t.method.includes("Cash") || t.method.includes("Offline"))) ? `
                                <button onclick="window.VoidOfflineTransaction('${t.id}', ${t.amount}, '${sem}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:11px; transition:0.2s;"><i class="fas fa-trash"></i> Void</button>
                                ` : ''}
                                ${isVoided ? `<span style="color:#ef4444; font-size:11px; font-weight:bold; letter-spacing: 1px;">VOIDED</span>` : ''}
                            </div>
                        </div>
                        
                        ${isVoided && linkedVoid ? `
                        <div style="display:flex; align-items:center; gap:10px; margin-top:-5px; margin-left:20px; padding:8px 12px; background:#fff5f5; border-left:2px dashed #fca5a5; border-bottom-right-radius:8px;">
                            <i class="fas fa-level-up-alt fa-rotate-90" style="color:#fca5a5;"></i>
                            <div style="flex:1;">
                                <div style="color:#ef4444; font-size:11px; font-weight:bold;">Reversed on ${linkedVoid.date}</div>
                                <div style="color:#b91c1c; font-size:10px; font-style:italic;">Reason: ${linkedVoid.voidReason || "Voided by Admin"}</div>
                            </div>
                            <div style="color:#ef4444; font-weight:bold; font-size:13px;">-₹${Math.abs(linkedVoid.amount).toLocaleString('en-IN')}</div>
                        </div>
                        ` : ''}
                    </div>`;
                });
                txnsHtml += `</div>`;
            }

            let collectBtn = outstanding > 0 ? `
                <button onclick="window.PromptCollectOffline('${sem}', ${outstanding})" style="margin-top:15px; width:100%; background:var(--brand-green); color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; transition:0.2s;">
                    <i class="fas fa-hand-holding-usd"></i> Collect ₹${outstanding.toLocaleString('en-IN')} Offline
                </button>` : "";

            html += `
            <div style="background:var(--bg-base); border:1px solid var(--border-color); border-left:5px solid ${statusCol}; border-radius:10px; padding:15px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:800; font-size:16px; color:var(--text-green);">Semester ${sem}</span>
                    <span style="background:${statusBg}; color:${statusCol}; font-size:10px; font-weight:800; padding:4px 8px; border-radius:6px; border:1px solid currentColor;">${statusText}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:13px; color:#475569;">
                    <span>Target: <b>₹${record.billingRate.toLocaleString('en-IN')}</b></span>
                    <span>Paid: <b style="color:var(--brand-green);">₹${record.collected.toLocaleString('en-IN')}</b></span>
                </div>
                ${txnsHtml}
                ${collectBtn}
            </div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div class="no-data-text" style="color:#ef4444;">Error syncing ledger.</div>`;
    }
}

// 🚨 SECURE API ROUTE: OFFLINE PAYMENTS
window.PromptCollectOffline = async function(sem, amount) {
    let confirmMsg = `Collect ₹${amount.toLocaleString('en-IN')} for Semester ${sem} via Cash/Offline?`;
    if(!confirm(confirmMsg)) return;

    window.showSubLoader("Generating Official Office Receipt...");

    let datePrefix = new Date().toISOString().split('T')[0].replace(/-/g, ''); 
    let randomHash = Math.random().toString(36).substr(2, 5).toUpperCase();
    let receiptId = `RCPT-${datePrefix}-${randomHash}`;
    let todayStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); 

    let payload = {
        amount: amount, 
        date: todayStr, 
        method: "Office Payment (Cash)",
        orderId: receiptId, 
        paymentId: receiptId, 
        razorpay_order_id: receiptId, 
        razorpay_payment_id: receiptId, 
        semester: sem, 
        studentId: currentActiveStudentID, 
        studentName: currentActiveStudentName,
        department: currentActiveStudentDept, 
        collectedBy: myRealName, 
        collectionRole: "Accountant"
    };

    try {
        await adminAPI({
            routeAction: "PROCESS_OFFLINE_PAYMENT",
            collegeId: currentCollegeID,
            studentId: currentActiveStudentID,
            receiptId: receiptId,
            payload: payload
        });

        window.hideSubLoader();
        window.showToast("✅ Payment Logged Securely!");
        
        let student = cachedStudents.find(s => s.id === currentActiveStudentID);
        if(student) FetchFeesLedger(student);

    } catch (error) {
        window.hideSubLoader();
        console.error(error);
        window.showToast("❌ Security Block: Contact Principal.");
    }
};

window.VoidOfflineTransaction = function(txnId, amount, sem) {
    let reason = prompt("MANDATORY: Please enter the exact reason for voiding this transaction. This will be permanently saved to the audit ledger.");
    if (reason === null) return; 
    if (reason.trim() === "") {
        window.showToast("❌ Void Cancelled: A valid reason is strictly required.");
        return;
    }

    pendingVoidTransaction = { txnId: txnId, amount: amount, sem: sem, reason: reason.trim() };
    ExecuteVoidOfflineTransaction();
};

// 🚨 SECURE API ROUTE: OFFLINE PAYMENT REVERSALS
window.ExecuteVoidOfflineTransaction = async function() {
    if (!pendingVoidTransaction || !currentActiveStudentID) return;
    
    let txnId = pendingVoidTransaction.txnId;
    let amount = pendingVoidTransaction.amount;
    let sem = pendingVoidTransaction.sem;
    let reason = pendingVoidTransaction.reason;
    pendingVoidTransaction = null; 
    
    window.showSubLoader("Issuing Reversal...");
    
    let datePrefix = new Date().toISOString().split('T')[0].replace(/-/g, ''); 
    let randomHash = Math.random().toString(36).substr(2, 5).toUpperCase();
    let reversalId = `VOID-${datePrefix}-${randomHash}`;
    let todayStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); 
    
    let payload = {
        amount: -Math.abs(amount), 
        date: todayStr, 
        method: "Void / Reversal", 
        orderId: reversalId, 
        paymentId: reversalId,
        razorpay_order_id: reversalId, 
        razorpay_payment_id: reversalId, 
        semester: sem, 
        studentId: currentActiveStudentID, 
        studentName: currentActiveStudentName,
        department: currentActiveStudentDept, 
        collectedBy: myRealName || "Accountant", 
        collectionRole: "Accountant", 
        linkedTo: txnId, 
        voidReason: reason
    };
    
    try {
        await adminAPI({
            routeAction: "VOID_OFFLINE_PAYMENT",
            collegeId: currentCollegeID,
            studentId: currentActiveStudentID,
            reversalId: reversalId,
            payload: payload
        });

        window.hideSubLoader();
        window.showToast("✅ Transaction Reversed Securely.");
        
        let student = cachedStudents.find(s => s.id === currentActiveStudentID);
        if(student) FetchFeesLedger(student);

    } catch(e) {
        window.hideSubLoader();
        window.showToast("❌ Security Block: Contact Principal.");
    }
};

window.PrintThermalReceipt = function(sem, txnId) {
    let record = feeCacheMap[sem];
    if (!record || !record.transactions) return;
    let txn = record.transactions.find(t => t.id === txnId);
    if (!txn) return;

    let isVoid = txn.method === "Void / Reversal" || txn.id.startsWith("VOID-");
    let receiptTitle = isVoid ? "VOID / REVERSAL RECEIPT" : "OFFICIAL FEE RECEIPT";
    
    let html = `
    <!DOCTYPE html>
    <html><head><title>Receipt - ${txn.id}</title>
    <style>
        @page { margin: 0; }
        body { font-family: 'Courier New', Courier, monospace; color: #000; width: 300px; margin: 0 auto; padding: 20px; font-size: 14px; }
        .center { text-align: center; } .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 15px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    </style></head><body>
        <div class="center bold" style="font-size:22px;">ADHYORA AMS</div>
        <div class="center" style="margin-bottom:10px;">${receiptTitle}</div>
        <div class="divider"></div>
        <div class="row"><span>Date:</span> <span>${txn.date}</span></div>
        <div class="row"><span>TXN ID:</span> <span>${txn.id}</span></div>
        <div class="divider"></div>
        <div class="row"><span>Student:</span> <span>${currentActiveStudentName}</span></div>
        <div class="row"><span>Roll No:</span> <span>${currentActiveStudentID}</span></div>
        <div class="row"><span>Sem:</span> <span>${sem}</span></div>
        <div class="divider"></div>
        <div class="row bold" style="font-size:16px;"><span>Amount:</span> <span>Rs. ${Math.abs(txn.amount).toLocaleString('en-IN')}</span></div>
        <div class="row"><span>Method:</span> <span>${txn.method}</span></div>
        <div class="divider"></div>
        <div class="center" style="font-size:12px; margin-top:20px;">Processed by: ${myRealName}<br>Accountant</div>
        <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 500); };<\/script>
    </body></html>`;

    let printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    } else {
        window.showToast("⚠️ Please allow pop-ups to print receipts.");
    }
};

document.getElementById("btnPrintStudentFees")?.addEventListener("click", () => {
    let keys = Object.keys(feeCacheMap);
    if (!currentActiveStudentID || keys.length === 0) {
        window.showToast("Please select a student with fee records first.");
        return;
    }

    let csvContent = "\uFEFF"; 
    csvContent += "ADHYORA ACADEMIC MANAGEMENT SYSTEM - FEES BALANCE STATEMENT\n";
    csvContent += `Institution ID,${currentCollegeID}\n`;
    csvContent += `Student Name,${currentActiveStudentName}\n`;
    csvContent += `Roll Number,${currentActiveStudentID}\n`;
    csvContent += `Department Track,${currentActiveStudentDept}\n`;
    csvContent += `Statement Generated Date,${new Date().toLocaleDateString()}\n\n`;
    
    csvContent += "Semester Index,Target Cost Rate (INR),Collected Amount (INR),Remaining Outstanding Balance (INR),Grace Expiry Deadline,Payment Mode,Status\n";

    keys.sort((a,b) => a-b).forEach(sem => {
        let node = feeCacheMap[sem];
        let balanceOutstanding = node.billingRate - node.collected;
        
        let status = "Pending"; 
        if (node.collected >= node.billingRate) status = "Paid";
        else if (node.collected > 0) status = "Partial";
        else if (node.deadline !== "N/A") {
            let today = new Date(); today.setHours(0,0,0,0);
            let deadlineDate = new Date(node.deadline);
            if (today > deadlineDate) status = "Unpaid"; 
        }

        let paymentType = "None";
        if (node.transactions && node.transactions.length > 0) {
            let lastTxn = node.transactions.sort((a,b) => b.rawTime - a.rawTime)[0];
            paymentType = lastTxn.method;
        }

        csvContent += `Sem ${sem},${node.billingRate},${node.collected},${balanceOutstanding},"${node.deadline}","${paymentType}",${status}\n`;
    });

    let blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${currentActiveStudentID}_LedgerStatement.csv`;
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.showToast("📊 Spreadsheet Statement Downloaded Successfully!");
});


// ==========================================
// 🚀 SMART BACK BUTTON NAVIGATION ENGINE v3 (Double-Tap Exit)
// ==========================================
let navActiveModals = [];
let isProgrammaticBack = false;
let lastBackPressTime = 0;

history.replaceState({ layer: 'base' }, '');
history.pushState({ layer: 'home' }, '');

const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
            const el = mutation.target;
            const isActive = el.classList.contains('active');
            const index = navActiveModals.indexOf(el);

            if (isActive && index === -1) {
                navActiveModals.push(el);
                history.pushState({ layer: 'modal', id: el.id }, '');
            } 
            else if (!isActive && index !== -1) {
                navActiveModals.splice(index, 1);
                if (history.state && history.state.id === el.id) {
                    isProgrammaticBack = true;
                    history.back();
                }
            }
        }
    });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    modalObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
});

const viewObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
            const el = mutation.target;
            const isViewOpen = el.classList.contains('mobile-active');
            
            if (isViewOpen && (!history.state || history.state.layer !== 'view')) {
                history.pushState({ layer: 'view' }, '');
            } 
            else if (!isViewOpen && history.state && history.state.layer === 'view') {
                isProgrammaticBack = true;
                history.back();
            }
        }
    });
});

const navMainContent = document.querySelector(".main-content");
if (navMainContent) {
    viewObserver.observe(navMainContent, { attributes: true, attributeFilter: ['class'] });
}

window.addEventListener('popstate', (e) => {
    if (isProgrammaticBack) {
        isProgrammaticBack = false;
        return;
    }

    if (navActiveModals.length > 0) {
        const topModal = navActiveModals[navActiveModals.length - 1]; 
        topModal.classList.remove('active');
        return;
    }

    if (navMainContent && navMainContent.classList.contains("mobile-active")) {
        switchView("MENU"); 
        return;
    }

    const currentTime = Date.now();
    if (currentTime - lastBackPressTime < 2000) {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        
        if (isPWA) {
            history.back();
        } else {
            if (typeof window.showToast === "function") {
                window.showToast("Please close the browser tab to exit.");
            }
            history.pushState({ layer: 'home' }, '');
        }
    } else {
        lastBackPressTime = currentTime;
        
        if (typeof window.showToast === "function") {
            window.showToast("Press back again to exit");
        }
        history.pushState({ layer: 'home' }, '');
    }
});

// ==========================================
// 📉 COLLEGE EXPENSE & ANALYTICS ENGINE
// ==========================================
let cachedExpenses = [];
let expenseWaveChartInstance = null;
let debitPieChartInstance = null;
let creditPieChartInstance = null;

// Dynamic Categories based on Type
window.updateCategoryOptions = function() {
    const type = document.getElementById("expenseType").value;
    const catSelect = document.getElementById("expenseCategory");
    const btn = document.getElementById("btnLogTransaction");
    
    if (type === "DEBIT") {
        catSelect.innerHTML = `
            <option value="Staff Salary">Staff Salary</option>
            <option value="Maintenance">Campus Maintenance</option>
            <option value="Electricity & Utilities">Electricity & Utilities</option>
            <option value="Events & Functions">Events & Functions</option>
            <option value="Lab Equipment">Lab Equipment</option>
            <option value="Miscellaneous Debit">Miscellaneous</option>
        `;
        btn.style.background = "#ef4444";
        btn.innerHTML = `<i class="fas fa-arrow-down"></i> Log Debit`;
    } else {
        catSelect.innerHTML = `
            <option value="Government Grant">Government Grant</option>
            <option value="Event Sponsorship">Event Sponsorship</option>
            <option value="Bank Interest">Bank Interest</option>
            <option value="Donation">Donation</option>
            <option value="Miscellaneous Credit">Miscellaneous</option>
        `;
        btn.style.background = "#10b981";
        btn.innerHTML = `<i class="fas fa-arrow-up"></i> Log Credit`;
    }
};

// 🕒 Listeners for the Filters
document.getElementById("expenseTimeFilter")?.addEventListener("change", (e) => {
    const datePicker = document.getElementById("expenseDateFilter");
    if (e.target.value === "DATE") datePicker.style.display = "block";
    else datePicker.style.display = "none";
    CalculateFinancialAnalytics();
});
document.getElementById("expenseDateFilter")?.addEventListener("change", CalculateFinancialAnalytics);

// 🚀 NEW: Listener for the Student Fees Toggle
document.getElementById("toggleStudentFees")?.addEventListener("change", CalculateFinancialAnalytics);

function InitExpenseTracker() {
    window.updateCategoryOptions(); // Init dropdown

    const expensesRef = collection(db, "colleges", currentCollegeID, "expenses");
    
    onSnapshot(query(expensesRef, orderBy("timestamp", "desc")), (snap) => {
        cachedExpenses = [];
        snap.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            cachedExpenses.push(data);
        });
        
        CalculateFinancialAnalytics(); // Triggers the math, the list, and the charts
    });
}

function CalculateFinancialAnalytics() {
    const filterType = document.getElementById("expenseTimeFilter")?.value || "ALL";
    const specificDate = document.getElementById("expenseDateFilter")?.value;
    
    // 🚀 NEW: Read the toggle state (defaults to true if toggle isn't found)
    const includeStudentFees = document.getElementById("toggleStudentFees")?.checked ?? true;
    
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7); 
    const currentYearStr = now.toISOString().slice(0, 4);  
    const todayStr = new Date().toLocaleDateString('en-CA');

    let filteredExpenses = [];
    let studentFeesTotal = 0;

    // 1. Filter the College Expenses
    cachedExpenses.forEach(exp => {
        let include = false;
        if (filterType === "TODAY") include = (exp.date === todayStr);
        else if (filterType === "DATE") include = (exp.date === specificDate);
        else if (filterType === "MONTH") include = exp.date && exp.date.startsWith(currentMonthStr);
        else if (filterType === "YEAR") include = exp.date && exp.date.startsWith(currentYearStr);
        else if (filterType === "ALL") include = true;
        else if (filterType === "SEMESTER") {
            let txnDate = new Date(exp.date);
            let sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            include = (txnDate >= sixMonthsAgo && txnDate <= now);
        }
        if (include) filteredExpenses.push(exp);
    });

    // 2. Filter Student Fees (Pulling from rawLedgerCache globally)
    rawLedgerCache.forEach(fee => {
        let isReversal = fee.method === "Void / Reversal" || fee.id?.startsWith("VOID");
        if (isReversal) return; 

        let include = false;
        if (filterType === "TODAY") include = (fee.date === todayStr);
        else if (filterType === "DATE") include = (fee.date === specificDate);
        else if (filterType === "MONTH") include = fee.date && fee.date.startsWith(currentMonthStr);
        else if (filterType === "YEAR") include = fee.date && fee.date.startsWith(currentYearStr);
        else if (filterType === "ALL") include = true;
        else if (filterType === "SEMESTER") {
            let txnDate = new Date(fee.date);
            let sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            include = (txnDate >= sixMonthsAgo && txnDate <= now);
        }
        
        // 🚀 NEW: Only add to the total if the toggle is checked
        if (include && includeStudentFees) {
            studentFeesTotal += (fee.amount || 0);
        }
    });

    // 3. Calculate Totals
    let totalCredits = studentFeesTotal; 
    let totalDebits = 0;
    
    filteredExpenses.forEach(exp => {
        if (exp.type === "CREDIT") totalCredits += (exp.amount || 0);
        else totalDebits += (exp.amount || 0);
    });

    // Update the Dashboard Stat Cards
    const statCredits = document.getElementById("statTotalCredits");
    const statDebits = document.getElementById("statTotalExpenses");
    const statNet = document.getElementById("statNetBalance");

    if (statCredits) statCredits.innerText = `₹${totalCredits.toLocaleString('en-IN')}`;
    if (statDebits) statDebits.innerText = `₹${totalDebits.toLocaleString('en-IN')}`;
    if (statNet) statNet.innerText = `₹${(totalCredits - totalDebits).toLocaleString('en-IN')}`;
    
    RenderExpenseList(filteredExpenses);
    RenderAnalyticsWave(filteredExpenses, studentFeesTotal);
}

function RenderExpenseList(expensesToRender) {
    const container = document.getElementById("expenseListContainer");
    if (!container) return;
    if (expensesToRender.length === 0) {
        container.innerHTML = `<div class="no-data-text">No records match the current filter.</div>`;
        return;
    }

    container.innerHTML = expensesToRender.map(exp => {
        const isCredit = exp.type === "CREDIT";
        const color = isCredit ? "#10b981" : "#ef4444";
        const sign = isCredit ? "+" : "-";
        
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid var(--border-color); background:var(--bg-base); transition: 0.2s;">
            <div>
                <div style="font-weight:bold; font-size:14px; color:var(--text-main); margin-bottom: 4px;">
                    <i class="fas ${isCredit ? 'fa-arrow-up' : 'fa-arrow-down'}" style="color:${color}; margin-right:5px;"></i> ${sanitizeHTML(exp.category)}
                </div>
                <div style="font-size:12px; color:#64748b;">${sanitizeHTML(exp.description)}</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${sanitizeHTML(exp.date)} • By: ${sanitizeHTML(exp.loggedBy)}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                <span style="font-weight:bold; font-size:16px; color:${color};">${sign}₹${Math.abs(exp.amount).toLocaleString('en-IN')}</span>
                <button onclick="window.DeleteExpense('${exp.id}')" style="background:transparent; color:#94a3b8; border:1px solid #e2e8f0; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:10px; transition:0.2s;" onmouseover="this.style.color='#ef4444'; this.style.borderColor='#fca5a5'" onmouseout="this.style.color='#94a3b8'; this.style.borderColor='#e2e8f0'"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// 🌊 The Upgraded Dynamic Chart Engine
function RenderAnalyticsWave(filteredExpenses, studentFeesTotal) {
    // ----------------------------------------------------
    // 1. WAVE/BAR CHART LOGIC
    // ----------------------------------------------------
    const ctx = document.getElementById('expenseWaveChart');
    if (ctx) {
        let dateMap = {};
        
        // Map Expenses by Date
        filteredExpenses.slice().reverse().forEach(exp => {
            if (!dateMap[exp.date]) dateMap[exp.date] = { credit: 0, debit: 0 };
            if (exp.type === "CREDIT") dateMap[exp.date].credit += exp.amount;
            else dateMap[exp.date].debit += exp.amount;
        });
        
        let labels = Object.keys(dateMap);
        let creditData = labels.map(l => dateMap[l].credit);
        let debitData = labels.map(l => dateMap[l].debit);

        const dynamicChartType = labels.length === 1 ? 'bar' : 'line';
        const chartContext = ctx.getContext('2d');

        // 🚀 UPDATE: The "Fading Neon" Gradients
        // Top is opaque (0.6), bottom fades to almost invisible (0.05)
        const creditGradient = chartContext.createLinearGradient(0, 0, 0, 350);
        creditGradient.addColorStop(0, 'rgba(16, 185, 129, 0.6)');
        creditGradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)'); 

        const debitGradient = chartContext.createLinearGradient(0, 0, 0, 350);
        debitGradient.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
        debitGradient.addColorStop(1, 'rgba(239, 68, 68, 0.05)');

        if (expenseWaveChartInstance) expenseWaveChartInstance.destroy();

        expenseWaveChartInstance = new Chart(ctx, {
            type: dynamicChartType,
            data: {
                labels: labels.length > 0 ? labels : ['No Data'],
                datasets: [
                    {
                        label: 'Credits (In)',
                        data: creditData.length > 0 ? creditData : [0],
                        borderColor: '#10b981', // Solid bright green
                        backgroundColor: creditGradient, // The fading gradient
                        
                        // 🚀 THE MAGIC: Only draw the top border if it's a bar!
                        borderWidth: dynamicChartType === 'bar' ? { top: 4, right: 0, bottom: 0, left: 0 } : 2,
                        
                        // Slight rounding on the top corners so it doesn't look completely rigid
                        borderRadius: dynamicChartType === 'bar' ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0,
                        maxBarThickness: 80, // Keep the bar from stretching too wide
                        
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#10b981',
                        pointRadius: 0, 
                        pointHoverRadius: 6 
                    },
                    {
                        label: 'Debits (Out)',
                        data: debitData.length > 0 ? debitData : [0],
                        borderColor: '#ef4444', // Solid bright red
                        backgroundColor: debitGradient,
                        
                        // 🚀 THE MAGIC: Only draw the top border if it's a bar!
                        borderWidth: dynamicChartType === 'bar' ? { top: 4, right: 0, bottom: 0, left: 0 } : 2,
                        
                        borderRadius: dynamicChartType === 'bar' ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0,
                        maxBarThickness: 80,
                        
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#ef4444',
                        pointRadius: 0, 
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                
                // Keep the smooth load and breathing wave animations
                animation: { duration: 1200, easing: 'easeOutQuart' },
                animations: {
                    tension: {
                        duration: 2500,
                        easing: 'easeInOutSine',
                        from: 0.25,
                        to: 0.55,
                        loop: true
                    }
                },
                
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, color: '#64748b' } },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', padding: 10 }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { grid: { color: 'rgba(148, 163, 184, 0.1)', borderDash: [5, 5] }, ticks: { color: '#94a3b8' }, beginAtZero: true }
                }
            }
        });
    }

    // ----------------------------------------------------
    // 2. PIE (DOUGHNUT) CHART LOGIC
    // ----------------------------------------------------
    const generateColors = (num) => {
        const baseColors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#3b82f6', '#8b5cf6', '#a855f7', '#d946ef'];
        let colors = [];
        for (let i = 0; i < num; i++) colors.push(baseColors[i % baseColors.length]);
        return colors;
    };

    // Debit Breakdown
    const debitCtx = document.getElementById('debitPieChart');
    if (debitCtx) {
        const debitTxns = filteredExpenses.filter(e => e.type !== 'CREDIT');
        const categories = [...new Set(debitTxns.map(t => t.category))];
        const totals = categories.map(cat => debitTxns.filter(t => t.category === cat).reduce((sum, t) => sum + t.amount, 0));

        if (debitPieChartInstance) debitPieChartInstance.destroy();
        
        if (debitTxns.length > 0) {
            debitPieChartInstance = new Chart(debitCtx, {
                type: 'doughnut',
                data: {
                    labels: categories,
                    datasets: [{ data: totals, backgroundColor: generateColors(categories.length), borderWidth: 0 }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    cutout: '65%', 
                    // 🚀 NEW: Elastic pop-in animation
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 1500,
                        easing: 'easeOutElastic' 
                    },
                    plugins: { legend: { position: 'bottom', labels: { color: '#64748b', boxWidth: 12 } } } 
                }
            });
        } else {
            const context = debitCtx.getContext('2d');
            context.clearRect(0, 0, debitCtx.width, debitCtx.height);
        }
    }

    // Credit Breakdown (WITH Student Fees automatically included based on toggle!)
    const creditCtx = document.getElementById('creditPieChart');
    if (creditCtx) {
        const creditTxns = filteredExpenses.filter(e => e.type === 'CREDIT');
        let categories = [...new Set(creditTxns.map(t => t.category))];
        let totals = categories.map(cat => creditTxns.filter(t => t.category === cat).reduce((sum, t) => sum + t.amount, 0));

        // Dynamically add the combined Student Fees to the Credit Pie Chart
        if (studentFeesTotal > 0) {
            categories.push("Student Fees (Collected)");
            totals.push(studentFeesTotal);
        }

        if (creditPieChartInstance) creditPieChartInstance.destroy();
        
        if (categories.length > 0) {
            creditPieChartInstance = new Chart(creditCtx, {
                type: 'doughnut',
                data: {
                    labels: categories,
                    datasets: [{ data: totals, backgroundColor: generateColors(categories.length).reverse(), borderWidth: 0 }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    cutout: '65%', 
                    // 🚀 NEW: Elastic pop-in animation
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 1500,
                        easing: 'easeOutElastic' 
                    },
                    plugins: { legend: { position: 'bottom', labels: { color: '#64748b', boxWidth: 12 } } } 
                }
            });
        } else {
            const context = creditCtx.getContext('2d');
            context.clearRect(0, 0, creditCtx.width, creditCtx.height);
        }
    }
}

// Handle Form Submission
document.getElementById("collegeExpenseForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const type = document.getElementById("expenseType").value;
    const category = document.getElementById("expenseCategory").value;
    const amount = parseFloat(document.getElementById("expenseAmount").value);
    const desc = document.getElementById("expenseDesc").value.trim();
    const todayStr = new Date().toLocaleDateString('en-CA'); 
    
    if (!category || isNaN(amount) || amount <= 0) {
        window.showToast("Invalid details.");
        return;
    }

    window.showSubLoader(`Logging ${type}...`);

    try {
        const newExpenseRef = doc(collection(db, "colleges", currentCollegeID, "expenses"));
        await setDoc(newExpenseRef, {
            type: type, 
            category: category,
            amount: amount,
            description: desc,
            date: todayStr,
            timestamp: serverTimestamp(),
            loggedBy: myRealName,
            loggedById: currentUserID
        });
        
        document.getElementById("expenseAmount").value = "";
        document.getElementById("expenseDesc").value = "";
        window.hideSubLoader();
        window.showToast(`✅ ${type === 'CREDIT' ? 'Credit' : 'Debit'} Logged!`);
    } catch (error) {
        window.hideSubLoader();
        window.showToast("❌ Error logging transaction.");
    }
});

// Delete Logic
window.DeleteExpense = async function(expenseId) {
    if (!confirm("Are you sure you want to delete this record? This cannot be undone.")) return;
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "expenses", expenseId));
        window.showToast("Record removed.");
    } catch (error) { window.showToast("Error removing record."); }
};