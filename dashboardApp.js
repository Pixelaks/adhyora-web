import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs, orderBy, limit, startAfter, arrayUnion, arrayRemove, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// 🚨 PASTE YOUR REAL CONFIG HERE 🚨
const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
};

// 🚨 ALL INITIALIZATIONS HAPPEN HERE IN ORDER 🚨
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);

// 🚀 OPTIMIZATION: Enable Local Disk Caching
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
// 🚨 ZERO-COST RAM CACHES 🚨
// ==========================================

let myCurrentPushToken = ""; 
let collegeID = ""; let studentUID = ""; let currentRollNo = "";
let collegeSemesterType = "Odd"; 
let loadedSemesters = {}; let sortedSemesterKeys = []; let currentSemesterIndex = 0;

let rawDept = ""; let myDepartmentID = ""; let myYearStr = ""; 
let enrolledSubjectsList = [];
let currentStudentEnrolledMap = {}; 
let optimizedSubjectCache = null; 

let currentDailyDate = new Date(); 
let cachedMedicalLeaves = []; 

let dailyAttendanceCache = {}; 
let timetableCache = [];       
let sessionsCache = new Map(); 
let cachedAssignments = [];
let cachedNotifs = [];
let cachedMessages = [];
let isDataListening = false;

let activeMarksUnsubscribe = null;
let activeTimetableUnsubscribe = null;

let calendarMode = "global"; let currentDisplayDate = new Date(); 
let cachedCalYear = ""; let calWorkingDays = new Set(); let calNonWorkingDays = new Map(); let semStarts = new Map(); let semEnds = new Map();

let isGlobalDataLoaded = false; 

let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let currentStudentProfileData = null; 

let actualProjectedPercent = 0;
let savedStrictPresent = 0;
let savedStrictTotal = 0;
let savedRemainingDays = 0;
let savedIsStrict = false;
let attendanceCalculationMode = "SIMPLE";
let isStrictCollege = false;
window.collegeTimeConfig = null; // 🚨 V2 TIMETABLE CONFIG

// ==========================================
// 🚨 BANK-GRADE ANTI-SNOOPING SHIELD 
// ==========================================
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
    if (e.keyCode === 123) return false; 
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false; 
    if (e.ctrlKey && e.keyCode === 85) return false; 
};


// ==========================================
// 🚨 DYNAMIC PHONE STATUS BAR CONTROLLER
// ==========================================
function updateStatusBar() {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const loader = document.getElementById("initialAppLoader");
    const paywall = document.getElementById("subscriptionBlockPanel");

    const isLoaderActive = loader && !loader.classList.contains("hidden") && loader.style.display !== "none";
    const isPaywallActive = paywall && paywall.classList.contains("active");

    if (isLoaderActive || isPaywallActive) {
        if (themeMeta) themeMeta.setAttribute("content", "#0b111e"); 
        document.body.style.backgroundColor = "#0b111e";
    } else {
        const isDark = document.body.classList.contains("dark-mode");
        if (themeMeta) themeMeta.setAttribute("content", isDark ? "#0f172a" : "#ffffff"); 
        document.body.style.backgroundColor = "";
    }
}

function hideAppLoader() {
    const loader = document.getElementById("initialAppLoader");
    if (loader && !loader.classList.contains("hidden")) {
        setTimeout(() => {
            loader.classList.add("hidden");
            updateStatusBar(); 
        }, 800);
    }
}

// 🚨 NATIVE TOAST ENGINE 🚨
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.innerText = msg;
        // Force native styling just in case CSS is missing
        toast.style.visibility = "visible";
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%, 0)";
        
        setTimeout(() => { 
            toast.style.opacity = "0"; 
            toast.style.transform = "translate(-50%, 20px)";
            setTimeout(() => { toast.style.visibility = "hidden"; }, 300); 
        }, 2000);
    } else {
        alert(msg);
    }
}

// ==========================================
// DOM ELEMENTS
// ==========================================
const el = {
    name: document.getElementById("studentName"), roll: document.getElementById("studentRoll"),
    badge: document.getElementById("statusBadge"), semTitle: document.getElementById("semesterTitle"),
    waterFill: document.getElementById("waterFill"), pctText: document.getElementById("overallPercentageText"),
    attClasses: document.getElementById("attendedClassesText"), absClasses: document.getElementById("absentClassesText"),
    totClasses: document.getElementById("totalClassesTakenText"), curPctText: document.getElementById("currentPercentageText"),
    perPres: document.getElementById("totalPeriodsPresentText"), perAbs: document.getElementById("totalPeriodsAbsentText"),
    perTot: document.getElementById("totalPeriodsTakenText"),
    subList: document.getElementById("subjectListContainer"), markList: document.getElementById("marksListContainer"),
    examDrop: document.getElementById("examDropdown"), noMarks: document.getElementById("noMarksData"),
    overlay: document.getElementById("sidebarOverlay"), sidebar: document.getElementById("settingsSidebar"),
    sbName: document.getElementById("sidebarName"), sbSub: document.getElementById("sidebarSubtitle"),
    calModal: document.getElementById("calendarModal"), calTitle: document.getElementById("calMonthYearText"),
    calGrid: document.getElementById("calendarGrid"), upcomingTxt: document.getElementById("upcomingEventText"),
    feesView: document.getElementById("feesView"),
    
    mainView: document.getElementById("mainDashboardView"),
    dailyView: document.getElementById("dailyAttendanceView"),
    ttView: document.getElementById("timetableView"),
    assignView: document.getElementById("assignmentsView"),
    actualNotifView: document.getElementById("actualNotifView"),
    msgView: document.getElementById("messagesView"),
    
    dailyDateBtn: document.getElementById("dailyDateBtn"),
    dailyDate: document.getElementById("dailyDateText"), dailyStatus: document.getElementById("dailyStatusText"),
    periodsGrid: document.getElementById("periodsGrid"), detailModal: document.getElementById("periodDetailModal"),
    dSub: document.getElementById("detailSubjectText"), dTeach: document.getElementById("detailTeacherText"), dStat: document.getElementById("detailStatusText"),

    ttDays: document.getElementById("timetableDays"), ttCards: document.getElementById("ttCardsContainer"),
    ttProgress: document.getElementById("ttProgressBar"), ttNodes: document.getElementById("ttNodes"),
    
    assignList: document.getElementById("assignmentsListContainer"),
    actualNotifList: document.getElementById("actualNotifListContainer"),
    msgList: document.getElementById("messagesListContainer"),

    sessionsModal: document.getElementById("sessionsModal"),
    sessionsList: document.getElementById("sessionsListContainer"),
    profileModal: document.getElementById("profileDetailsModal"),
    profileContent: document.getElementById("profileDetailsContent"),
    
    predictorModal: document.getElementById("leavePredictorModal"),
    predictStatusText: document.getElementById("predictStatusText"),
    leaveDaysInput: document.getElementById("leaveDaysInput"),
    predictSubmitBtn: document.getElementById("predictSubmitBtn"),
    predictWaterFill: document.getElementById("predictWaterFill"),
    predictPercentageText: document.getElementById("predictPercentageText")
};

// ==========================================
// INITIALIZATION
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
collegeID = urlParams.get('college'); studentUID = urlParams.get('uid');

if (!collegeID || !studentUID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) syncCollegeAndListen(); else window.location.href = "index.html";
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
    if (navigator.userAgent.indexOf("Android") != -1) osName = "Android Browser";
    if (navigator.userAgent.indexOf("like Mac") != -1) osName = "iOS Browser";

    try {
        const sessionRef = doc(db, "colleges", collegeID, "students", currentRollNo, "sessions", myWebDeviceID);
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, {merge: true});
        
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) {
                signOut(auth).then(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace("index.html");
                });
            }
        });
    } catch(e) {}
}

async function syncCollegeAndListen() {
    onSnapshot(doc(db, "colleges", collegeID), (colSnap) => {
        if (colSnap.exists()) {
            let data = colSnap.data();
            
            if (data.currentSemesterType) { 
                collegeSemesterType = data.currentSemesterType; 
            }

            // 🚨 FETCH TIMETABLE CONFIG
            if (data.timetable_config) {
                window.collegeTimeConfig = data.timetable_config;
            }

            if (data.settings && data.settings.attendanceCalculationMode) {
                isStrictCollege = (data.settings.attendanceCalculationMode === "STRICT_SESSION");
                
                if (typeof updateUIForCurrentSemester === 'function' && sortedSemesterKeys && sortedSemesterKeys.length > 0) {
                    updateUIForCurrentSemester();
                }
            }

            const blockPanel = document.getElementById("subscriptionBlockPanel");
            const dashboardUI = document.querySelector(".dashboard-container"); 

            window.collegePlanTier = data.subscription ? (data.subscription.planType || "base").toLowerCase() : "base";

            const ultBadge = document.getElementById("ultimateBadge");
            if (ultBadge) {
                ultBadge.style.display = (window.collegePlanTier === "ultimate") ? "block" : "none";
            }
            
            if (!data.subscription) {
                blockPanel.classList.add("active");
                dashboardUI.style.display = "none";
                updateStatusBar();
            } else {
                let expiryTimestamp = data.subscription.expiryDate || 0;
                let hardBlockDate = new Date(expiryTimestamp * 1000);
                hardBlockDate.setDate(hardBlockDate.getDate() + 8); 
                
                if (new Date() > hardBlockDate) {
                    blockPanel.classList.add("active");
                    dashboardUI.style.display = "none"; 
                    updateStatusBar();
                } else {
                    blockPanel.classList.remove("active");
                    dashboardUI.style.display = "flex"; 
                    updateStatusBar();
                }
            }
        }
    });

    const secureUID = auth.currentUser.uid; 
    const q = query(collection(db, "colleges", collegeID, "students"), where("userID", "==", secureUID));

    let isFirstBoot = true; 

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) { el.name.innerText = "Profile Not Found"; return; }
        const docSnap = snapshot.docs[0];
        currentRollNo = docSnap.id; 
        
        registerWebSession();

        if (isFirstBoot) {
            fetchGlobalCalendarData(); 
            
            try {
                const medSnap = await getDocs(query(collection(db, "colleges", collegeID, "medical_leaves"), where("studentID", "==", currentRollNo)));
                cachedMedicalLeaves = [];
                medSnap.forEach(d => { 
                    let data = d.data(); 
                    if(data.startDate && data.endDate) cachedMedicalLeaves.push({ start: new Date(data.startDate), end: new Date(data.endDate) }); 
                });
            } catch(e) { console.error("Medical Leave Error", e); }
            
            isFirstBoot = false;
        }

        processStudentData(docSnap.data());
        loadDailyAttendance(); 

        hideAppLoader();
        
        if (!isDataListening) {
            isDataListening = true;
            startBackgroundListeners();
            requestPushPermissions();
            updateNotificationToggleUI();
        }

        if (!el.ttView.classList.contains("hidden-view")) {
            let todayName = document.querySelector('.day-btn.active').dataset.day;
            loadTimetableForDay(todayName);
        }
        if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
        if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
        if (!el.msgView.classList.contains("hidden-view")) loadMessages();
    });
}

async function fetchGlobalCalendarData() {
    let now = new Date();
    let startYear = (now.getMonth() >= 5) ? now.getFullYear() : now.getFullYear() - 1;
    let targetYearStr = `${startYear}-${startYear + 1}`;
    
    try {
        const [semDoc, workDoc, holDoc] = await Promise.all([ 
            getDoc(doc(db, "colleges", collegeID, "semesters", targetYearStr)), 
            getDoc(doc(db, "colleges", collegeID, "workingDays", targetYearStr)), 
            getDoc(doc(db, "colleges", collegeID, "nonWorkingDays", targetYearStr)) 
        ]);
        if (semDoc.exists()) { let d = semDoc.data(); if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); }
        if (workDoc.exists()) { Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k)); }
        if (holDoc.exists()) { Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v)); }
        
        isGlobalDataLoaded = true;
        
        if (sortedSemesterKeys.length > 0) updateUIForCurrentSemester();
    } catch(e) { console.error("Error fetching global data", e); }
}

function startBackgroundListeners() {
    // 🚨 CACHE-FIRST ASSIGNMENTS
    let cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    let localAssignCache = localStorage.getItem(`adhyora_assignments_${currentRollNo}`);
    if (localAssignCache) {
        try {
            cachedAssignments = JSON.parse(localAssignCache).map(item => ({ ...item, time: new Date(item.time) }));
            if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
        } catch (e) { console.warn("Cache parse error", e); }
    }

    onSnapshot(query(collection(db, "colleges", collegeID, "assignments"), where("createdAt", ">=", cutoff), orderBy("createdAt", "desc")), (snap) => {
        let freshAssignments = []; let mySemStr = `Semester ${currentSemesterIndex + 1}`;
        snap.forEach(doc => {
            let d = doc.data(); let sub = d.subject || "Unknown";
            let isExplicitMatch = enrolledSubjectsList.some(s => s.trim().toLowerCase() === sub.trim().toLowerCase());
            let isDepartmentMatch = (d.teacherDeptID || "").trim().toLowerCase() === myDepartmentID.toLowerCase() && (d.semester || "").trim().toLowerCase() === mySemStr.toLowerCase();
            if (isExplicitMatch || isDepartmentMatch || enrolledSubjectsList.length === 0) {
                // 🚨 FIX: Combine the Topic and Description securely for the UI
                let combinedBody = `<b>${d.topic || "Assignment"}</b><br><span style="opacity: 0.85; margin-top: 4px; display: block;">${d.description || "No instructions provided."}</span>`;
                
                freshAssignments.push({ 
                    id: doc.id, 
                    title: `Assignment: ${sub}`, 
                    body: combinedBody, 
                    teach: d.teacherName || "Teacher", 
                    due: d.dueDate || "N/A", 
                    time: d.createdAt ? d.createdAt.toDate() : new Date() 
                });
            }
        });
        cachedAssignments = freshAssignments;
        localStorage.setItem(`adhyora_assignments_${currentRollNo}`, JSON.stringify(cachedAssignments));
        if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
    });

    function getSafeTopic(input) { return (!input || input === "All") ? "ALL" : input.replace(/[^a-zA-Z0-9]/g, ''); }
    let safeCol = getSafeTopic(collegeID); let safeDept = getSafeTopic(rawDept); let safeYear = getSafeTopic(myYearStr);
    let myTopics = [`${safeCol}_ALL`, `${safeCol}_STUDENTS_ALL_ALL`, `${safeCol}_STUDENTS_${safeDept}_ALL`, `${safeCol}_STUDENTS_${safeDept}_${safeYear}`];
    // 🚨 CACHE-FIRST NOTIFICATIONS
    let inboxCache = []; let globalCache = [];
    let localNotifCache = localStorage.getItem(`adhyora_notifs_${currentRollNo}`);
    if (localNotifCache) {
        try {
            cachedNotifs = JSON.parse(localNotifCache).map(item => ({ ...item, time: new Date(item.time) }));
            if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
        } catch (e) { console.warn("Cache parse error", e); }
    }

    const updateNotifUI = () => {
        cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time);
        localStorage.setItem(`adhyora_notifs_${currentRollNo}`, JSON.stringify(cachedNotifs));
        if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; snap.forEach(doc => { let d = doc.data(); inboxCache.push({ title: d.title || "Notice", body: d.body || "", type: "notif", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        updateNotifUI();
    });
    onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        globalCache = []; snap.forEach(doc => { let d = doc.data(); globalCache.push({ title: d.title || "System Update", body: d.body || "", type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        updateNotifUI();
    });

    // 🚨 CACHE-FIRST MESSAGES
    let broadcastCache = []; let privateChatCache = [];
    let localMsgCache = localStorage.getItem(`adhyora_msgs_${currentRollNo}`);
    if (localMsgCache) {
        try {
            cachedMessages = JSON.parse(localMsgCache).map(item => ({ ...item, time: new Date(item.time) }));
            if (!el.msgView.classList.contains("hidden-view")) loadMessages();
        } catch (e) { console.warn("Cache parse error", e); }
    }

    const updateMsgUI = () => {
        cachedMessages = [...broadcastCache, ...privateChatCache].sort((a,b) => b.time - a.time);
        localStorage.setItem(`adhyora_msgs_${currentRollNo}`, JSON.stringify(cachedMessages));
        if (!el.msgView.classList.contains("hidden-view")) loadMessages();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        broadcastCache = [];
        snap.forEach(doc => {
            let d = doc.data(); let target = d.targetSummary || ""; let forMe = false;
            if (d.senderID === auth.currentUser.uid) forMe = true;
            else if (target.includes("Everyone") || target.includes("All Students")) forMe = true;
            else { let deptMatch = target.includes("All Depts") || target.includes(rawDept); let yearMatch = target.includes("All Years") || target.includes(myYearStr); if (deptMatch && yearMatch) forMe = true; }
            if (forMe) { 
                let role = d.senderRole || "Principal"; 
                broadcastCache.push({ title: d.title || "Notice", body: d.body || "", sender: d.senderName || d.senderRole || "System", senderRole: role, type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
            }
        });
        updateMsgUI();
    });

    let activeMessageListeners = new Map(); 

    onSnapshot(query(collection(db, "colleges", collegeID, "chats"), where("participants", "array-contains", currentRollNo)), (snap) => {
        snap.docChanges().forEach(change => {
            let chatID = change.doc.id;

            if (change.type === "added") {
                let unsub = onSnapshot(query(collection(db, "colleges", collegeID, "chats", chatID, "messages"), orderBy("timestamp", "desc"), limit(20)), (msgSnap) => {
                    privateChatCache = privateChatCache.filter(m => m.roomID !== chatID); 
                    msgSnap.forEach(mDoc => { 
                        let d = mDoc.data(); 
                        let role = d.senderRole || "Principal"; 
                        privateChatCache.push({ roomID: chatID, title: d.title || "Message", body: d.body || "", sender: d.senderName || "User", senderRole: role, type: "chat", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
                    });
                    updateMsgUI();
                });
                activeMessageListeners.set(chatID, unsub);
            }

            if (change.type === "removed") {
                if (activeMessageListeners.has(chatID)) {
                    activeMessageListeners.get(chatID)(); 
                    activeMessageListeners.delete(chatID);
                }
                privateChatCache = privateChatCache.filter(m => m.roomID !== chatID);
                updateMsgUI();
            }
        });
    });

    const updateSessionCache = (snap, parentID) => {
        snap.docChanges().forEach(change => {
            if (change.type === "removed") sessionsCache.delete(change.doc.id);
            else sessionsCache.set(change.doc.id, { id: change.doc.id, parent: parentID, ...change.doc.data() });
        });
        if (el.sessionsModal.classList.contains("active")) loadSessions();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "students", currentRollNo, "sessions")), snap => updateSessionCache(snap, currentRollNo));
    onSnapshot(query(collection(db, "colleges", collegeID, "students", auth.currentUser.uid, "sessions")), snap => updateSessionCache(snap, auth.currentUser.uid));
}

function processStudentData(data) {
    currentStudentProfileData = data; 
    
    const sName = data.Name || data.name || "Unknown";
    el.name.innerText = sName; el.roll.innerText = `Roll no: ${data.RollNumber || currentRollNo}`;
    rawDept = data.Department || data.department || "General";
    myDepartmentID = "DEPT_" + rawDept.replace(/\s/g, ''); 
    el.sbName.innerHTML = `${sName} <br><span style="font-size:12px; color:#888;">(${data.RollNumber || currentRollNo})</span>`;
    
    enrolledSubjectsList = [];
    currentStudentEnrolledMap = data.enrolledSubjects || {};
    
    if (data.enrolledSubjects) {
        for (const semObj of Object.values(data.enrolledSubjects)) {
            if (typeof semObj === 'object') {
                for (const subName of Object.values(semObj)) enrolledSubjectsList.push(subName);
            }
        }
    }

    let studentYear = parseInt((data.Year || "1").toString().replace(/\D/g, ''));
    if (isNaN(studentYear) || studentYear <= 0) studentYear = 1;
    myYearStr = `Year ${studentYear}`;

    loadedSemesters = {}; sortedSemesterKeys = [];
    for(let i=1; i<=8; i++) {
        const key = `Semester_${i}`;
        loadedSemesters[key] = { id: key, name: `Semester ${i}`, hasData: false, strictPresent: 0, strictTotal: 0, simplePresent: 0, simpleTotal: 0, subjects: [] };
        sortedSemesterKeys.push(key);
    }

    if (data.attendance_stats) {
        for (const [key, semData] of Object.entries(data.attendance_stats)) {
            const cleanKey = key.replace("semester_", "Semester_");
            if (loadedSemesters[cleanKey]) {
                let semInfo = loadedSemesters[cleanKey]; semInfo.hasData = true;
                if (semData.present !== undefined) semInfo.strictPresent = semData.present;
                if (semData.total !== undefined) semInfo.strictTotal = semData.total;

                let sumPres = 0; let sumTot = 0;
                for (const [subKey, subStats] of Object.entries(semData)) {
                    if (subKey === "present" || subKey === "total") continue;
                    if (subKey === "Strict_Global") { semInfo.strictPresent = subStats.present; semInfo.strictTotal = subStats.total; }
                    else if (typeof subStats === 'object') {
                        let p = subStats.present || 0; let t = subStats.total || 0;
                        
                        // 🚨 THE FIX: Map 'Events' to 'Special Events' so the UI & Ledger can read it!
                        let displayName = subKey.replace("-", "/");
                        if (subKey === "Events") displayName = "Special Events";

                        semInfo.subjects.push({ name: displayName, present: p, total: t });
                        sumPres += p; sumTot += t;
                    }
                }
                semInfo.simplePresent = sumPres; semInfo.simpleTotal = sumTot;
            }
        }
    }

    let baseSem = (studentYear - 1) * 2;
    currentSemesterIndex = Math.max(0, Math.min(7, ((collegeSemesterType === "Odd") ? baseSem + 1 : baseSem + 2) - 1));
    updateUIForCurrentSemester(rawDept);
}

document.getElementById("prevSemBtn").addEventListener("click", () => { if (currentSemesterIndex > 0) { currentSemesterIndex--; updateUIForCurrentSemester(null); }});
document.getElementById("nextSemBtn").addEventListener("click", () => { if (currentSemesterIndex < 7) { currentSemesterIndex++; updateUIForCurrentSemester(null); }});

function updateUIForCurrentSemester(optionalDept) {
    const semData = loadedSemesters[sortedSemesterKeys[currentSemesterIndex]];
    el.semTitle.innerText = semData.name;
    if (optionalDept) el.sbSub.innerHTML = `${optionalDept} &nbsp; <span class="sem-text">${semData.name}</span>`;
    else el.sbSub.innerHTML = el.sbSub.innerHTML.split("&nbsp;")[0] + `&nbsp; <span class="sem-text">${semData.name}</span>`;

    let simplePercent = (semData.simpleTotal > 0) ? (semData.simplePresent / semData.simpleTotal) * 100 : 0;
    
    let projectedStrictPercent = 0;
    let currentStrictPercent = 0;

    savedStrictPresent = 0;
    savedStrictTotal = 0;
    savedRemainingDays = 0;
    savedIsStrict = false;

    // 🚨 1. Calculate Calendar Days regardless of calculation mode
    let globalMode = collegeSemesterType || "Odd";
    let semNum = currentSemesterIndex + 1;
    let isCurrentlyActiveSem = (globalMode == "Odd" && semNum % 2 != 0) || (globalMode == "Even" && semNum % 2 == 0);

    if (isGlobalDataLoaded && isCurrentlyActiveSem && calWorkingDays.size > 0) {
        let iterator = new Date(); iterator.setDate(iterator.getDate() + 1);
        calWorkingDays.forEach(dateKey => {
            let dateObj = new Date(dateKey);
            if (dateObj >= iterator) savedRemainingDays++;
        });
    }

    // 🚨 2. Apply logic based on Mode
    // Data-driven: if Strict_Global data exists, use strict mode regardless of flag timing
    if (isStrictCollege || semData.strictTotal > 0) {
        savedIsStrict = true;
        currentStrictPercent = (semData.strictTotal > 0) ? (semData.strictPresent / semData.strictTotal) * 100 : 0;
        projectedStrictPercent = currentStrictPercent;

        if (savedRemainingDays > 0) {
            savedStrictPresent = semData.strictPresent;
            savedStrictTotal = semData.strictTotal;

            let projNum = savedStrictPresent + savedRemainingDays;
            let projDenom = savedStrictTotal + savedRemainingDays;
            if (projDenom > 0) projectedStrictPercent = (projNum / projDenom) * 100.0;
        }
    } else {
        savedIsStrict = false;
        // SIMPLE MODE (Period-based math)
        currentStrictPercent = simplePercent;
        projectedStrictPercent = simplePercent;

        if (savedRemainingDays > 0) {
            savedStrictPresent = semData.simplePresent; 
            savedStrictTotal = semData.simpleTotal;
            
            // 🚨 V2 DYNAMIC PERIOD MATH
            let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
            let remainingPeriods = savedRemainingDays * pCount;
            let projNum = savedStrictPresent + remainingPeriods;
            let projDenom = savedStrictTotal + remainingPeriods;
            
            if (projDenom > 0) projectedStrictPercent = (projNum / projDenom) * 100.0;
        }
    }

    actualProjectedPercent = projectedStrictPercent;
    let currentOverallPercent = savedIsStrict ? currentStrictPercent : simplePercent;

    el.pctText.innerText = `${projectedStrictPercent.toFixed(2)}%`;
    el.curPctText.innerText = `Current: ${currentOverallPercent.toFixed(2)}%`;
    el.attClasses.innerText = `Attended: ${semData.strictPresent}`; el.totClasses.innerText = `Total: ${semData.strictTotal}`;
    el.absClasses.innerText = `Absent: ${semData.strictTotal - semData.strictPresent}`;
    el.perPres.innerText = `Periods Present: ${semData.simplePresent}`; el.perTot.innerText = `Total Periods: ${semData.simpleTotal}`;
    el.perAbs.innerText = `Periods Absent: ${semData.simpleTotal - semData.simplePresent}`;

    let ringColor = GetPredictorColor(projectedStrictPercent);
    let hexColor = "#" + ((1 << 24) + (ringColor.r << 16) + (ringColor.g << 8) + ringColor.b).toString(16).slice(1);
    
    el.badge.innerText = projectedStrictPercent >= 85 ? "Excellent" : projectedStrictPercent >= 70 ? "Good" : projectedStrictPercent >= 50 ? "Average" : "Critical";
    el.badge.style.backgroundColor = hexColor;
    
    let textColor = (projectedStrictPercent >= 70 && projectedStrictPercent < 85) ? "#0f172a" : "#000000";
    let targetHeight = `calc(${Math.min(100, Math.max(0, currentOverallPercent))}% - 12px)`;

    let existingWater = document.getElementById("animatedRowWater");
    let existingText = document.getElementById("animatedRowText");

    if (!existingWater) {
        el.curPctText.style.position = "relative";
        el.curPctText.style.overflow = "hidden";
        el.curPctText.style.padding = "0"; 
        el.curPctText.style.borderBottom = "none";
        el.curPctText.style.backgroundColor = "transparent"; 

        el.curPctText.innerHTML = `
            <div class="row-water-container" id="animatedRowWater" style="background-color: ${hexColor}; height: 0px;">
                <div class="row-water-wave"></div>
            </div>
            <div id="animatedRowText" style="position: relative; z-index: 2; padding: 8px 12px; font-weight: normal; color: ${textColor}; transition: color 0.5s;">
                Current: ${currentOverallPercent.toFixed(2)}%
            </div>
        `;

        setTimeout(() => {
            let waterEl = document.getElementById("animatedRowWater");
            if(waterEl) waterEl.style.height = targetHeight;
        }, 50);
        
    } else {
        existingWater.style.backgroundColor = hexColor;
        existingWater.style.height = targetHeight;
        
        existingText.style.color = textColor;
        existingText.innerText = `Current: ${currentOverallPercent.toFixed(2)}%`;
    }
    el.waterFill.style.backgroundColor = hexColor;
    el.waterFill.style.top = `${100 - Math.min(100, projectedStrictPercent)}%`;
    // 🚀 ULTRA-MODERN SUBJECT CARDS 🚀
    el.subList.innerHTML = (!semData.hasData || semData.subjects.length === 0) ? `<div class="no-data-text">No Attendance Data</div>` : semData.subjects.map(sub => {
        const ratio = sub.total > 0 ? (sub.present / sub.total) : 0; 
        const subPct = ratio * 100;
        
        // Updated to vibrant, modern Tailwind colors
        let barColor = ratio < 0.6 ? "#ef4444" : ratio < 0.75 ? "#f59e0b" : "#10b981"; 
        
        return `
        <div onclick="window.OpenAttendanceLedger('${sub.name}', ${sub.present}, ${sub.total})" style="cursor: pointer; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 14px 16px; background: var(--bg-card, #ffffff); transition: all 0.2s ease; margin-bottom: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);" onmouseover="this.style.borderColor='var(--theme-main)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 12px rgba(0,0,0,0.05)';" onmouseout="this.style.borderColor='var(--border-color, #e2e8f0)'; this.style.transform='none'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.02)';">
            
            <div style="margin-bottom: 8px;">
                <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: var(--text-main, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${sub.name}">${sub.name}</h4>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 26px; height: 26px; border-radius: 6px; background: ${barColor}15; display: flex; align-items: center; justify-content: center; color: ${barColor}; border: 1px solid ${barColor}30;">
                        <i class="fas fa-book" style="font-size: 11px;"></i>
                    </div>
                    <span style="font-size: 12px; font-weight: 700; color: #64748b;">
                        <span style="color: var(--text-main, #334155);">${sub.present}</span> / ${sub.total} 
                        <span style="font-size: 10px; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 2px;">Classes</span>
                    </span>
                </div>
                
                <div style="text-align: right;">
                    <span style="font-size: 18px; font-weight: 900; color: ${barColor}; line-height: 1;">${subPct.toFixed(0)}%</span>
                </div>
                
            </div>

            <div style="width: 100%; background: var(--bg-main, #f1f5f9); height: 6px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color, #e2e8f0);">
                <div style="height: 100%; width: ${subPct}%; background: ${barColor}; border-radius: 4px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; height: 100%; width: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: barShimmer 2s infinite;"></div>
                </div>
            </div>
            
        </div>`;
    }).join('');

    fetchMarksForSemester(semData.name);
    buildEnrolledSubjectsUI(semData.name); 

    dailyAttendanceCache = {}; 
    startTimetableListener(); 
}

function GetPredictorColor(percentage) {
    if (percentage >= 85) return {r: 76, g: 175, b: 80};      // Green
    else if (percentage >= 70) return {r: 255, g: 193, b: 7}; // Yellow
    else if (percentage >= 50) return {r: 255, g: 152, b: 0}; // Orange
    else return {r: 244, g: 67, b: 54};                       // Red
}

function fetchMarksForSemester(semName) {
    if (activeMarksUnsubscribe) activeMarksUnsubscribe();
    el.markList.innerHTML = ""; el.examDrop.innerHTML = '<option value="">Loading...</option>'; el.noMarks.style.display = "block";
    activeMarksUnsubscribe = onSnapshot(doc(db, "colleges", collegeID, "students", currentRollNo, "nep_marks", semName), (docSnap) => {
        if (!docSnap.exists()) { el.examDrop.innerHTML = '<option value="">No Exams Data</option>'; return; }
        const data = docSnap.data(); let examMap = {};
        for (const [subjectName, exams] of Object.entries(data)) {
            if (typeof exams !== 'object') continue;
            for (const [examName, stats] of Object.entries(exams)) {
                if (!examMap[examName]) examMap[examName] = [];
                let t = stats.test || 0; let a = stats.assign || 0; let att = stats.att || 0; let max = stats.max || 50;
                examMap[examName].push({ name: subjectName, obtained: stats.total || (t+a+att), max: max });
            }
        }
        const examKeys = Object.keys(examMap).sort();
        if (examKeys.length === 0) { el.examDrop.innerHTML = '<option value="">No Exams Data</option>'; return; }
        el.examDrop.innerHTML = examKeys.map(ex => `<option value="${ex}">${ex}</option>`).join('');
        el.examDrop.onchange = () => drawMarksUI(examMap[el.examDrop.value]);
        drawMarksUI(examMap[examKeys[0]]);
    });
}

function drawMarksUI(marksArray) {
    el.markList.innerHTML = (!marksArray || marksArray.length === 0) ? "" : marksArray.map(m => {
        
        // 🚨 1. Calculate the Ratio
        const ratio = m.max > 0 ? (m.obtained / m.max) : 0;
        const pct = ratio * 100;
        
        // 🚨 2. Dynamic Color Logic (Red -> Yellow -> Green)
        let barColor = ratio < 0.6 ? "#ef4444" : ratio < 0.75 ? "#f59e0b" : "#10b981"; 
        
        return `
        <div class="subject-row" style="margin-bottom: 15px;">
            
            <div class="row-header" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; font-weight: 600;">
                <span>${m.name}</span>
                <span>${m.obtained}/${m.max} <span style="font-size:10px; color:${barColor}; font-weight:800; margin-left:3px;">(${pct.toFixed(0)}%)</span></span>
            </div>
            
            <div style="width: 100%; background: var(--bg-main, #f1f5f9); height: 6px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color, #e2e8f0);">
                <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 4px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; height: 100%; width: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: barShimmer 2s infinite;"></div>
                </div>
            </div>
            
        </div>`;
    }).join('');
    
    el.noMarks.style.display = (!marksArray || marksArray.length === 0) ? "block" : "none";
}

async function buildEnrolledSubjectsUI(semesterName) {
    let listEl = document.getElementById("enrolledSubjectsListText");
    listEl.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading subjects...</div>`;
    
    let cleanSemNum = semesterName.replace("Semester", "").replace("_", "").trim();
    let finalSubjects = [];

    let semKey = semesterName.replace(" ", "_"); 
    let enrollMap = currentStudentEnrolledMap[semKey] || currentStudentEnrolledMap[semesterName] || {};
    
    // 1. Render Secondary/Elective Subjects (Yellow Badges)
    for (let [cat, sub] of Object.entries(enrollMap)) {
        finalSubjects.push(`
            <div style="display:flex; align-items:center; gap:12px; padding:12px 15px; background:var(--bg-base, #ffffff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; box-shadow:0 2px 4px rgba(0,0,0,0.01);">
                <span style="font-size:10px; font-weight:800; color:#d97706; background:#fef3c7; padding:4px 8px; border-radius:6px; letter-spacing:0.5px; border:1px solid #fde68a; min-width:55px; text-align:center;">${cat}</span>
                <span style="font-size:13px; font-weight:700; color:var(--text-main, #0f172a);">${sub}</span>
            </div>
        `);
    }

    if (!optimizedSubjectCache) {
        let localCache = sessionStorage.getItem(`adhyora_subjects_${collegeID}`);
        if (localCache) {
            optimizedSubjectCache = JSON.parse(localCache);
        } else {
            optimizedSubjectCache = [];
            try {
                const subSnap = await getDocs(collection(db, "colleges", collegeID, "subjects"));
                subSnap.forEach(doc => {
                    let d = doc.data();
                    optimizedSubjectCache.push({
                        cleanType: (d.Type || d.type || "").toUpperCase().replace(/\s/g, ""),
                        cleanSubDept: (d.Department || d.department || d.departmentID || "").replace(/\s/g, "").toLowerCase().replace("dept_", ""),
                        semesterArray: (d.Semester || d.semester || "1").toString().split(",").map(s => s.trim()),
                        displayName: d.Name || d.name || d.subjectName || "Unnamed",
                        rawType: d.Type || d.type || ""
                    });
                });
                sessionStorage.setItem(`adhyora_subjects_${collegeID}`, JSON.stringify(optimizedSubjectCache));
            } catch(e) { console.error("Error fetching subjects", e); }
        }
    }

    let cleanStuDept = rawDept.replace(/\s/g, "").toLowerCase().replace("dept_", "");
    
    // 2. Render Core/Major Subjects (Green Badges - Pushed to Top)
    optimizedSubjectCache.forEach(sub => {
        if (sub.semesterArray.includes(cleanSemNum)) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                
                let newEntry = `
                    <div style="display:flex; align-items:center; gap:12px; padding:12px 15px; background:var(--bg-base, #ffffff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; box-shadow:0 2px 4px rgba(0,0,0,0.01);">
                        <span style="font-size:10px; font-weight:800; color:#16a34a; background:#dcfce7; padding:4px 8px; border-radius:6px; letter-spacing:0.5px; border:1px solid #bbf7d0; min-width:55px; text-align:center;">${sub.rawType}</span>
                        <span style="font-size:13px; font-weight:700; color:var(--text-main, #0f172a);">${sub.displayName}</span>
                    </div>
                `;
                
                if (!finalSubjects.some(existing => existing.includes(sub.displayName))) {
                    finalSubjects.unshift(newEntry);
                }
            }
        }
    });

    if (finalSubjects.length === 0) {
        listEl.innerHTML = `<div class="no-data-text" style="padding: 20px;">No subjects assigned for this semester.</div>`;
    } else {
        listEl.innerHTML = finalSubjects.join("");
    }
}

document.getElementById("btnProfileDetails").addEventListener("click", () => {
    let d = currentStudentProfileData;
    if(!d) return;
    
    let html = `
        <b>Name:</b> ${d.Name || d.name || "N/A"}<br>
        <b>Roll Number:</b> ${d.RollNumber || currentRollNo}<br>
        <b>Course:</b> ${d.courseType || d.CourseType || "N/A"}<br>
        <b>Department:</b> ${d.Department || d.department || "N/A"}<br>
        <b>Current Year:</b> ${d.Year || d.year || "N/A"}<br>
        <b>Status:</b> ${d.authStatus || "N/A"}<br>
        <b>Email:</b> ${d.email || "N/A"}<br>
        <b>Legal Consent:</b> ${d.hasAgreedToDisclaimer ? "Agreed" : "Pending"}<br><br>
        <b>User ID:</b> <span style="font-size:10px; color:#888;">${auth.currentUser.uid}</span>
    `;
    el.profileContent.innerHTML = html;
    el.profileModal.classList.add("active");
});
document.getElementById("closeProfileBtn").addEventListener("click", () => el.profileModal.classList.remove("active"));

document.getElementById("attendanceWater").addEventListener("click", () => {
    el.predictorModal.classList.add("active");
    el.leaveDaysInput.value = "";
    el.predictStatusText.innerHTML = "Enter the days to know the percentage drop.";
    ResetPredictorVisuals();
});

document.getElementById("closePredictorBtn").addEventListener("click", () => {
    el.predictorModal.classList.remove("active");
});

function ResetPredictorVisuals() {
    let startColor = GetPredictorColor(actualProjectedPercent);
    let hexColor = "#" + ((1 << 24) + (startColor.r << 16) + (startColor.g << 8) + startColor.b).toString(16).slice(1);
    
    el.predictWaterFill.style.backgroundColor = hexColor;
    el.predictWaterFill.style.top = `${100 - Math.min(100, actualProjectedPercent)}%`;
    
    el.predictPercentageText.innerHTML = `<span style="font-size: 13px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Current</span><br><span style="color:${hexColor}">${actualProjectedPercent.toFixed(2)}%</span>`;
}

document.getElementById("predictSubmitBtn").addEventListener("click", () => {
    let inputVal = el.leaveDaysInput.value;
    if (!inputVal) return;
    
    let leaveDays = parseInt(inputVal);
    if (isNaN(leaveDays) || leaveDays < 0) leaveDays = 0;

    if (leaveDays > savedRemainingDays) {
        el.predictStatusText.innerHTML = `<span style="color:#ef4444;">Semester only has ${savedRemainingDays} days remaining. Enter valid days.</span>`;
        ResetPredictorVisuals();
        return;
    }

    el.predictStatusText.innerHTML = `<span style="color:#10b981;">Prediction calculated.</span>`;

    let projNum = 0;
    let projDenom = 0;
    let predictedPercent = 0;

    if (savedIsStrict) {
        projNum = savedStrictPresent + (savedRemainingDays - leaveDays);
        projDenom = savedStrictTotal + savedRemainingDays;
    } else {
        // 🚨 V2 DYNAMIC PREDICTOR MATH
        let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
        let periodsMissed = leaveDays * pCount;
        let remainingPeriods = savedRemainingDays * pCount;
        
        projNum = savedStrictPresent + (remainingPeriods - periodsMissed);
        projDenom = savedStrictTotal + remainingPeriods;
    }
    
    if (projDenom > 0) predictedPercent = (projNum / projDenom) * 100.0;

    AnimatePrediction(actualProjectedPercent, predictedPercent);
});

function AnimatePrediction(startValue, targetValue) {
    let duration = 800; // ms
    let startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        let progress = (timestamp - startTime) / duration;
        if (progress > 1) progress = 1;
        
        let easeProgress = progress * progress * (3 - 2 * progress);
        let currentVal = startValue + (targetValue - startValue) * easeProgress;
        
        let currentColor = GetPredictorColor(currentVal);
        let hexColor = "#" + ((1 << 24) + (currentColor.r << 16) + (currentColor.g << 8) + currentColor.b).toString(16).slice(1);
        
        el.predictWaterFill.style.backgroundColor = hexColor;
        el.predictWaterFill.style.top = `${100 - Math.min(100, currentVal)}%`;
        el.predictPercentageText.innerHTML = `<span style="font-size: 13px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Predicted</span><br><span style="color:${hexColor}">${currentVal.toFixed(2)}%</span>`;

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    }
    window.requestAnimationFrame(step);
}

// ==========================================
// 🚨 VIEW TOGGLING 🚨
// ==========================================
const btnNavMain = document.getElementById("btnNavMain");
const btnNavAssign = document.getElementById("btnNavAssign");
const btnNavNotif = document.getElementById("btnNavNotif");
const btnNavMsg = document.getElementById("btnNavMsg");
const btnNavTimetable = document.getElementById("btnNavTimetable");
const btnNavDaily = document.getElementById("btnNavDaily");

function switchView(activeBtn, viewToShow) {
    [btnNavMain, btnNavAssign, btnNavNotif, btnNavMsg, btnNavTimetable, btnNavDaily, document.getElementById("btnNavFees")].forEach(btn => btn.classList.remove("active"));
    
    [el.mainView, el.assignView, el.actualNotifView, el.msgView, el.ttView, el.dailyView, el.feesView].forEach(view => view.classList.add("hidden-view"));
    
    activeBtn.classList.add("active");
    viewToShow.classList.remove("hidden-view");
    
    // 🚨 REMOVED: history.pushState is completely gone! 
    // The v3 Observer Engine will handle it cleanly below.
}

btnNavMain.addEventListener("click", () => switchView(btnNavMain, el.mainView));
btnNavAssign.addEventListener("click", () => { switchView(btnNavAssign, el.assignView); loadAssignments(); });
btnNavNotif.addEventListener("click", () => { switchView(btnNavNotif, el.actualNotifView); loadActualNotifications(); });
btnNavMsg.addEventListener("click", () => { switchView(btnNavMsg, el.msgView); loadMessages(); });
btnNavDaily.addEventListener("click", () => { switchView(btnNavDaily, el.dailyView); loadDailyAttendance(); }); 

btnNavTimetable.addEventListener("click", () => { 
    switchView(btnNavTimetable, el.ttView); 
    let todayName = new Date().toLocaleString('en-us', {weekday: 'long'});
    let validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!validDays.includes(todayName)) todayName = "Monday";
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.toggle("active", btn.dataset.day === todayName));
    
    loadTimetableForDay(todayName);
});

document.getElementById("btnNavFees").addEventListener("click", () => {
    switchView(document.getElementById("btnNavFees"), el.feesView);
    FEES_Init();
});

// ==========================================
// 🚨 ZERO-COST RENDER FUNCTIONS 🚨
// ==========================================

// 🚨 UPDATED ASSIGNMENT ENGINE 🚨
function loadAssignments() {
    if (cachedAssignments.length === 0) { 
        el.assignList.innerHTML = `<div class="no-data-text">No Recent Assignments</div>`; 
        return; 
    }

    // Pull local completion map from LocalStorage
    let completedMap = JSON.parse(localStorage.getItem(`completed_assign_${currentRollNo}`) || "{}");
    
    // Set up Date checking for automatic strikes
    let today = new Date();
    today.setHours(0,0,0,0);

    el.assignList.innerHTML = cachedAssignments.map(n => {
        let isDone = completedMap[n.id] === true;

        // Check if overdue
        let isClosed = false;
        if (n.due && n.due !== "N/A") {
            let dDate = new Date(n.due);
            dDate.setHours(0,0,0,0);
            if (today > dDate) isClosed = true;
        }

        // Default Styles
        let cardStyle = "";
        let titleStyle = "";
        let badge = "";
        let actionBtn = "";

        // Determine State
        if (isDone) {
            // Local Marked Done
            cardStyle = "opacity: 0.6; background: var(--bg-base);";
            titleStyle = "text-decoration: line-through; color: var(--text-muted);";
            badge = `<span style="color:#10b981; font-size:11px; font-weight:bold; letter-spacing:0.5px;"><i class="fas fa-check-circle"></i> Completed</span>`;
            actionBtn = `<button onclick="window.toggleAssignment('${n.id}', false)" style="background:transparent; border:1px solid var(--border-color); color:var(--text-muted); padding:4px 8px; border-radius:6px; font-size:10px; cursor:pointer;">Undo</button>`;
        } 
        else if (isClosed) {
            // Overdue
            cardStyle = "opacity: 0.7; background: #fff5f5;";
            titleStyle = "text-decoration: line-through; color: #ef4444;";
            badge = `<span style="color:#ef4444; font-size:11px; font-weight:bold; letter-spacing:0.5px;"><i class="fas fa-lock"></i> Closed</span>`;
            actionBtn = `<span style="font-size:10px; color:#ef4444; font-weight:bold;">Past Deadline</span>`;
        } 
        else {
            // Active
            badge = `<span class="card-due" style="color:#f59e0b; font-size:11px; font-weight:bold; letter-spacing:0.5px;">Due: ${n.due}</span>`;
            // 🚨 FIX: Replaced missing var(--brand-green) with hardcoded #10b981
actionBtn = `<button onclick="window.toggleAssignment('${n.id}', true)" style="background:#10b981; border:none; color:white; padding:6px 12px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; box-shadow:0 2px 5px rgba(16, 185, 129, 0.4); transition:0.2s;">Mark Done</button>`;
        }

        return `
        <div class="data-card assign" style="margin-bottom:10px; border:1px solid var(--border-color); border-radius:12px; padding:15px; transition:0.3s; ${cardStyle}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:5px;">
                <div class="card-title" style="${titleStyle} margin-bottom:0; font-size:14px; flex:1; min-width:60%;">${n.title}</div>
                <div>${badge}</div>
            </div>
            <div class="card-body" style="font-size:12px; color:#475569; margin-bottom:10px; line-height:1.5;">${n.body}</div>
            <div class="card-meta" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:8px;">
                <span style="font-size:11px; color:#64748b;"><i class="fas fa-chalkboard-teacher"></i> ${n.teach}</span>
                ${actionBtn}
            </div>
        </div>`;
    }).join('');
}

// Attach the toggle function to the global window object so HTML buttons can click it
window.toggleAssignment = function(id, status) {
    let completedMap = JSON.parse(localStorage.getItem(`completed_assign_${currentRollNo}`) || "{}");
    if (status) completedMap[id] = true;
    else delete completedMap[id];
    localStorage.setItem(`completed_assign_${currentRollNo}`, JSON.stringify(completedMap));
    
    // Refresh the view instantly
    loadAssignments();
};

function loadActualNotifications() {
    if (cachedNotifs.length === 0) { el.actualNotifList.innerHTML = `<div class="no-data-text">No Notifications</div>`; return; }
    el.actualNotifList.innerHTML = cachedNotifs.map(n => {
        let timeStr = n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<div class="data-card ${n.type}"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>Adhyora</span><span>${timeStr}</span></div></div>`;
    }).join('');
}

function loadMessages() {
    if (cachedMessages.length === 0) { el.msgList.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    
    el.msgList.innerHTML = cachedMessages.map(m => {
        let roleClass = "msg-student"; 
        let r = (m.senderRole || "").toLowerCase();
        
        if (r.includes("principal") || r.includes("admin")) roleClass = "msg-principal";
        else if (r.includes("teacher")) roleClass = "msg-teacher";

        let timeStr = m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        
        return `<div class="data-card ${roleClass}"><div class="card-title">${m.title}</div><div class="card-body">${m.body}</div><div class="card-meta"><span>${m.sender}</span><span>${timeStr}</span></div></div>`;
    }).join('');
}

// ==========================================
// 🚨 PULL-THROUGH CACHE: DAILY ATTENDANCE
// ==========================================
document.getElementById("btnPrevDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() - 1); loadDailyAttendance(); });
document.getElementById("btnNextDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() + 1); loadDailyAttendance(); });

el.dailyDateBtn.addEventListener("click", () => {
    calendarMode = "daily"; el.calModal.classList.add("active"); 
    currentDisplayDate = new Date(currentDailyDate); loadCalendarData();
});

async function loadDailyAttendance() {
    el.dailyDate.innerText = currentDailyDate.toLocaleString('default', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    
    let mStr = String(currentDailyDate.getMonth() + 1).padStart(2, '0'); let dStr = String(currentDailyDate.getDate()).padStart(2, '0');
    let dateStr = `${currentDailyDate.getFullYear()}-${mStr}-${dStr}`;
    let activeSemName = sortedSemesterKeys[currentSemesterIndex] ? sortedSemesterKeys[currentSemesterIndex].replace("_", " ") : "Semester 1";

    if (dailyAttendanceCache[dateStr]) {
        renderDailyData(dailyAttendanceCache[dateStr]);
        return; 
    }

    el.dailyStatus.innerText = "Checking..."; 
    el.periodsGrid.innerHTML = ""; 
    
    // 🚨 V2 DYNAMIC GRID GENERATOR
    let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
    
    window.dailyData = []; 
    for(let i=0; i<pCount; i++) { 
        window.dailyData.push({hasData: false}); 
        el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; 
    }

    try {
        const q = query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", dateStr), where("semester", "==", activeSemName));
        const snapshot = await getDocs(q);
        
        let docs = [];
        if(!snapshot.empty) { snapshot.forEach(doc => { if (!doc.id.includes("GLOBAL")) docs.push(doc.data()); }); }
        
        dailyAttendanceCache[dateStr] = docs; 
        renderDailyData(docs);
    } catch(e) { el.dailyStatus.innerText = "Network Error"; }
}

function renderDailyData(docs) {
    // 🚨 FIX: Renamed to 'totalPeriods' to avoid crashing with 'pCount' (Present Count)
    let totalPeriods = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
    
    window.dailyData = []; 
    for(let i=0; i<totalPeriods; i++) { window.dailyData.push({hasData: false}); }

    if (docs.length === 0) {
        el.dailyStatus.innerText = "No Classes Recorded";
        el.periodsGrid.innerHTML = "";
        for(let i=0; i<totalPeriods; i++) { el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; }
        return;
    }

    let isMedToday = false; let cDateObj = new Date(currentDailyDate).setHours(0,0,0,0);
    for(let l of cachedMedicalLeaves) { if(cDateObj >= l.start.setHours(0,0,0,0) && cDateObj <= l.end.setHours(0,0,0,0)) { isMedToday = true; break; } }

    let pCount = 0; let tHeld = 0; // <-- This pCount is for "Present Count", do not change!
    docs.forEach(d => {
        for(let i=1; i<=totalPeriods; i++) { // 🚨 Uses totalPeriods safely
            let pK = `period_${i}`;
            if(d[pK] && d[pK].attendance && d[pK].attendance[currentRollNo] !== undefined) {
                let isP = (d[pK].attendance[currentRollNo] == true || d[pK].attendance[currentRollNo] == 1);
                tHeld++; if(isP) pCount++; // Adds to the Present Count
                let sub = d[pK].subject || "Unknown";
                if(d[pK].event_details && d[pK].event_details[currentRollNo]) sub = d[pK].event_details[currentRollNo];
                window.dailyData[i-1] = { hasData: true, isPresent: isP, isMedical: isMedToday, subject: sub, teacher: d[pK].markedByTeacherName || "System", time: d[pK].timestamp ? new Date(d[pK].timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "N/A" };
            }
        }
    });

    if(tHeld > 0) el.dailyStatus.innerText = `Present: ${pCount} / ${tHeld}`; else el.dailyStatus.innerText = "No Classes Recorded";
    
    el.periodsGrid.innerHTML = "";
    for(let i=0; i<totalPeriods; i++) { // 🚨 Uses totalPeriods safely
        let d = window.dailyData[i]; 
        if(!d.hasData) { el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; continue; }
        let css = d.isMedical ? "btn-medical" : (d.isPresent ? "btn-present" : "btn-absent");
        let txt = d.isMedical ? "M" : (d.isPresent ? "P" : "A");
        el.periodsGrid.innerHTML += `<button class="period-btn ${css}" onclick="openPeriodDetail(${i})">${txt}</button>`;
    }
}

window.openPeriodDetail = function(index) {
    let d = window.dailyData[index]; 
    if(!d.hasData) return;
    el.dSub.innerText = d.subject; el.dTeach.innerText = `${d.teacher} • ${d.time}`;
    el.dStat.innerHTML = d.isMedical ? "<color style='color:#3b82f6'>Medical Leave</color>" : (d.isPresent ? "<color style='color:#4caf50'>Present</color>" : "<color style='color:#f44336'>Absent</color>");
    el.detailModal.classList.add("active");
};
document.getElementById("closeDetailBtn").addEventListener("click", () => el.detailModal.classList.remove("active"));

// ==========================================
// 🚨 TIMETABLE RAM RENDERING 🚨
// ==========================================
document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove("active"));
        e.target.classList.add("active"); loadTimetableForDay(e.target.dataset.day);
    });
});

function getMyBatchIndexForSubject(targetSubjectName) {
    for (const enrolledSub of enrolledSubjectsList) {
        if (enrolledSub.startsWith(targetSubjectName)) {
            if (enrolledSub.includes("-")) {
                let parts = enrolledSub.split('-');
                if (parts.length > 1) { let batchNum = parseInt(parts[1].trim()); if (!isNaN(batchNum)) return batchNum - 1; }
            }
            return 0; 
        }
    }
    return -1; 
}

function startTimetableListener() {
    if (activeTimetableUnsubscribe) activeTimetableUnsubscribe();
    let semStr = (currentSemesterIndex + 1).toString();
    const q = query(collection(db, "colleges", collegeID, "timetable_allocations"), where("semester", "==", semStr));

    activeTimetableUnsubscribe = onSnapshot(q, (snapshot) => {
        timetableCache = [];
        snapshot.forEach(d => timetableCache.push(d.data()));
        
        if (!el.ttView.classList.contains("hidden-view")) {
            let activeDay = document.querySelector('.day-btn.active').dataset.day;
            loadTimetableForDay(activeDay);
        }
    });
}

function loadTimetableForDay(selectedDay) {
    el.ttCards.innerHTML = ""; 
    let htmlBuffer = "";
    let semStr = (currentSemesterIndex + 1).toString();

    let docs = timetableCache.filter(d => d.day === selectedDay);
    let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;

    for (let i = 0; i < pCount; i++) {
        let pStr = (i + 1).toString(); let periodDocs = docs.filter(d => d.period === pStr); let finalMatch = null;
        finalMatch = periodDocs.find(d => d.category === "Break" || d.category === "Lunch");

        if (!finalMatch) {
            for (let d of periodDocs) {
                let sName = d.subjectName ? d.subjectName.trim() : ""; let myBatchIdx = getMyBatchIndexForSubject(sName);
                if (myBatchIdx !== -1) {
                    let isComm = d.isCommon === true; let dBatchIdx = d.splitIndex ? parseInt(d.splitIndex) : 0;
                    if (isComm || dBatchIdx === myBatchIdx) { finalMatch = d; break; }
                }
            }
        }

        if (!finalMatch && myDepartmentID) {
            for (let d of periodDocs) {
                let dDept = d.departmentID || ""; let dCat = (d.category || "").toUpperCase();
                if (dDept === myDepartmentID && (dCat.includes("MJD") || dCat.includes("CORE"))) { finalMatch = d; break; }
            }
        }

        if (finalMatch) {
            let cat = finalMatch.category || "-"; let subj = finalMatch.subjectName || "Unknown"; let room = finalMatch.room || "TBD";
            let isComm = finalMatch.isCommon === true;
            if (!isComm && finalMatch.splitIndex) { let bIdx = parseInt(finalMatch.splitIndex); subj += ` <span style="font-size:10px; color:#eab308;">(Batch ${bIdx + 1})</span>`; }
            let cardClass = "tt-card"; if (cat === "Break" || cat === "Lunch") { cardClass += " break"; subj = cat; cat = "-"; }
            
            htmlBuffer += `<div class="${cardClass}"><div class="tt-pill-row"><div class="tt-pill cat-pill">${cat}</div><div class="tt-pill sub-pill">${subj}</div></div><div class="tt-pill-row"><div class="tt-pill sem-pill">Semester ${semStr}</div><div class="tt-pill room-pill">${room}</div></div></div>`;
        } else {
            htmlBuffer += `<div class="tt-card free"><div class="tt-pill-row"><div class="tt-pill cat-pill" style="color:#94a3b8">-</div><div class="tt-pill sub-pill" style="color:#64748b">Free Period</div></div><div class="tt-pill-row"><div class="tt-pill sem-pill" style="color:#94a3b8">-</div><div class="tt-pill room-pill" style="color:#94a3b8">-</div></div></div>`;
        }
    }
    el.ttCards.innerHTML = htmlBuffer; updateTimelineVisuals();
}

function updateTimelineVisuals() {
    if (el.ttView.classList.contains("hidden-view")) return;
    let now = new Date(); let currentHour = now.getHours() + (now.getMinutes() / 60.0);
    
    let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
    let nodesHTML = "";

    const toDec = (t) => { let [hm, m] = t.split(' '); let [h, min] = hm.split(':').map(Number); if(m==='PM'&&h!==12)h+=12; if(m==='AM'&&h===12)h=0; return h+(min/60); };
    
    // Calculate total bar progress dynamically
    let firstTiming = window.getPeriodTiming(window.collegeTimeConfig, 1);
    let lastTiming = window.getPeriodTiming(window.collegeTimeConfig, pCount);
    
    let pStart = toDec(firstTiming.start);
    let pEnd = toDec(lastTiming.end);
    let progress = Math.max(0, Math.min(1, (currentHour - pStart) / (pEnd - pStart)));
    
    el.ttProgress.style.height = `${progress * 100}%`;

    for (let i = 0; i < pCount; i++) {
        let timing = window.getPeriodTiming(window.collegeTimeConfig, i + 1);
        let startTime = toDec(timing.start);
        let endTime = toDec(timing.end);
        
        let nClass = "tt-node";
        if (currentHour >= startTime && currentHour < endTime) nClass += " active"; 
        else if (currentHour >= endTime) nClass += " completed";
        
        nodesHTML += `<div class="${nClass}">${i+1}</div>`;
    }
    el.ttNodes.innerHTML = nodesHTML;
}
setInterval(updateTimelineVisuals, 60000); 

// ==========================================
// 🚨 DEVICE SESSIONS & SETTINGS CACHE
// ==========================================
document.getElementById("openSettingsBtn").addEventListener("click", () => { el.sidebar.classList.add("open"); el.overlay.classList.add("active"); });
el.overlay.addEventListener("click", () => { el.sidebar.classList.remove("open"); el.overlay.classList.remove("active"); });

// ==========================================
// 🚨 UNIFIED MASTER SIGN-OUT ENGINE
// ==========================================
async function handleSignOut() {
    try {
        if (myCurrentPushToken) {
            try { await deleteToken(messaging); } catch(e) { console.warn("Push Token Delete Error:", e); }
        }

        if (myCurrentPushToken && currentRollNo && collegeID) {
            try {
                const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
                await setDoc(studentRef, { webFcmTokens: arrayRemove(myCurrentPushToken) }, { merge: true });
            } catch(e) { console.warn("Firestore Token Remove Error:", e); }
        }

        if (myWebDeviceID && currentRollNo && collegeID) {
            try {
                await deleteDoc(doc(db, "colleges", collegeID, "students", currentRollNo, "sessions", myWebDeviceID));
            } catch(e) { console.warn("Session Delete Error:", e); }
        }

        localStorage.clear();
        sessionStorage.clear();
        await signOut(auth);
        
        window.location.replace("index.html");

    } catch (e) {
        console.error("Signout Error:", e);
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("index.html");
    }
}

document.getElementById("btnSignOut").addEventListener("click", handleSignOut);
document.getElementById("btnBlockSignOut").addEventListener("click", handleSignOut);
document.getElementById("btnContact").addEventListener("click", () => window.open(`mailto:pixelaks.technologies@gmail.com`, '_blank'));

// ==========================================
// 🚀 SMART BACK BUTTON NAVIGATION ENGINE v3 (Double-Tap Exit)
// ==========================================
let navActiveModals = [];
let isProgrammaticBack = false;
let lastBackPressTime = 0;

// 1. Initialize Base State
window.history.replaceState({ layer: 'base' }, '');
window.history.pushState({ layer: 'home' }, '');

// 2. Track Standard Modals & Sidebar Overlays
const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
            const elem = mutation.target;
            const isActive = elem.classList.contains('active');
            const index = navActiveModals.indexOf(elem);

            if (isActive && index === -1) {
                navActiveModals.push(elem);
                window.history.pushState({ layer: 'modal', id: elem.id }, '');
            } 
            else if (!isActive && index !== -1) {
                navActiveModals.splice(index, 1);
                if (window.history.state && window.history.state.id === elem.id) {
                    isProgrammaticBack = true;
                    window.history.back();
                }
            }
        }
    });
});

// Observe all standard modal overlays and the sidebar overlay (Ignoring the Paywall)
document.querySelectorAll('.modal-overlay, .sidebar-overlay').forEach(overlay => {
    if(overlay.id !== "subscriptionBlockPanel") {
        modalObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
});

// 3. Track the custom Attendance Ledger (Uses inline styles instead of classes)
const ledgerObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.attributeName === 'style') {
            const elem = mutation.target;
            const isActive = elem.style.display === 'flex' || elem.style.opacity === '1';
            const index = navActiveModals.indexOf(elem);

            if (isActive && index === -1) {
                navActiveModals.push(elem);
                window.history.pushState({ layer: 'modal', id: elem.id }, '');
            } 
            else if (!isActive && index !== -1) {
                navActiveModals.splice(index, 1);
                if (window.history.state && window.history.state.id === elem.id) {
                    isProgrammaticBack = true;
                    window.history.back();
                }
            }
        }
    });
});
const ledgerOl = document.getElementById("attendanceLedgerOverlay");
if (ledgerOl) ledgerObserver.observe(ledgerOl, { attributes: true, attributeFilter: ['style'] });

// 4. Track View Navigation (Main Dashboard vs Sub-pages)
const viewObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
            const elem = mutation.target;
            const isHidden = elem.classList.contains('hidden-view');
            
            if (isHidden && (!window.history.state || window.history.state.layer !== 'view')) {
                window.history.pushState({ layer: 'view' }, '');
            } 
            else if (!isHidden && window.history.state && window.history.state.layer === 'view') {
                isProgrammaticBack = true;
                window.history.back();
            }
        }
    });
});
if (el.mainView) viewObserver.observe(el.mainView, { attributes: true, attributeFilter: ['class'] });


// 5. Execute Hardware / Browser Back Button Logic
window.addEventListener('popstate', (e) => {
    // 🚨 ADD THIS: Immediate haptic feedback on back action
    if (navigator.vibrate) navigator.vibrate(15);
    
    if (isProgrammaticBack) {
        isProgrammaticBack = false;
        return;
    }

    // ACTION A: Close top-most modal/popup securely
    if (navActiveModals.length > 0) {
        const topModal = navActiveModals[navActiveModals.length - 1]; 
        
        if (topModal.id === "attendanceLedgerOverlay" && typeof window.CloseAttendanceLedger === 'function') {
            window.CloseAttendanceLedger();
        } else if (topModal.id === "sidebarOverlay") {
            topModal.classList.remove('active');
            if (el.sidebar) el.sidebar.classList.remove('open');
        } else {
            topModal.classList.remove('active');
        }
        return;
    }

    // ACTION B: Return to Main Dashboard if inside a sub-page
    if (el.mainView && el.mainView.classList.contains("hidden-view")) {
        const btnNavMain = document.getElementById("btnNavMain");
        if (btnNavMain) btnNavMain.click();
        return;
    }

    // ACTION C: Double-Tap to Exit App cleanly
    const currentTime = Date.now();
    if (currentTime - lastBackPressTime < 2000) {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (isPWA) {
            window.history.back(); // Exits PWA cleanly without triggering Sign Out
        } else {
            if (typeof showToast === "function") showToast("Please close the browser tab to exit.");
            window.history.pushState({ layer: 'home' }, '');
        }
    } else {
        lastBackPressTime = currentTime;
        if (typeof showToast === "function") showToast("Press back again to exit");
        window.history.pushState({ layer: 'home' }, '');
    }
});

// ==========================================
// SIDEBAR EXTERNAL LINKS
// ==========================================
document.getElementById("btnPrivacy").addEventListener("click", () => window.open("https://pixelaks.in/privacy-adhyora", "_blank"));
document.getElementById("btnTerms").addEventListener("click", () => window.open("https://pixelaks.in/terms-adhyora", "_blank"));
document.getElementById("btnCompany").addEventListener("click", () => window.open("https://pixelaks.in", "_blank"));
document.getElementById("btnDevices").addEventListener("click", () => {
    el.sidebar.classList.remove("open"); el.overlay.classList.remove("active");
    el.sessionsModal.classList.add("active"); loadSessions();
});
document.getElementById("closeSessionsBtn").addEventListener("click", () => el.sessionsModal.classList.remove("active"));

// ==========================================
// 🚨 NOTIFICATION TOGGLE LOGIC
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

async function requestPushPermissions() {
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            const swRegistration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                myCurrentPushToken = currentToken; 

                if (currentRollNo && collegeID) {
                    const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
                    
                    const sSnap = await getDoc(studentRef);
                    let activeTokens = [];
                    
                    if (sSnap.exists() && sSnap.data().webFcmTokens) {
                        activeTokens = sSnap.data().webFcmTokens;
                    }

                    activeTokens = activeTokens.filter(t => t !== currentToken);
                    activeTokens.push(currentToken);
                    
                    if (activeTokens.length > 3) {
                        activeTokens = activeTokens.slice(activeTokens.length - 3);
                    }

                    await setDoc(studentRef, { webFcmTokens: activeTokens }, { merge: true });

                    // ========================================================
                    // 🚨 ADD THIS ENTIRE MISSING BLOCK: THE LOOPHOLE SYNC 🚨
                    // ========================================================
                    function getSafeTopicLocal(input) { return (!input || input === "All") ? "ALL" : input.replace(/[^a-zA-Z0-9]/g, ''); }
                    
                    let safeCol = getSafeTopicLocal(collegeID);
                    let safeDept = getSafeTopicLocal(rawDept.replace("DEPT_", ""));
                    let safeYear = getSafeTopicLocal(myYearStr);

                    // Replicate the exact C# GetMyTopics() logic!
                    let topicsToJoin = [
                        `${safeCol}_ALL`,
                        `${safeCol}_STUDENTS_ALL_ALL`,
                        `${safeCol}_STUDENTS_${safeDept}_ALL`,
                        `${safeCol}_STUDENTS_${safeDept}_${safeYear}`,
                        `ADHYORA_GLOBAL_USERS`
                    ];

                    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";

                    fetch(APPS_SCRIPT_URL, {
                        method: "POST",
                        mode: "no-cors",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "subscribe",
                            token: currentToken,
                            topics: topicsToJoin
                        })
                    }).then(() => {
                        console.log("✅ Loophole Complete: Student Web Dashboard bound to Native Topics!");
                    }).catch(err => console.error("Apps Script Hook Rejected:", err));
                    // ========================================================
                }
            } 
        } 
        updateNotificationToggleUI();
    } catch (error) { 
        console.error("Error retrieving push token: ", error); 
        updateNotificationToggleUI(); 
    }
}

async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        toggle.style.opacity = "0.5"; 

        await deleteToken(messaging);

        if (myCurrentPushToken && currentRollNo && collegeID) {
            const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
            await setDoc(studentRef, { webFcmTokens: arrayRemove(myCurrentPushToken) }, { merge: true });
        }
        
        myCurrentPushToken = ""; 
        toggle.style.opacity = "1";
        updateNotificationToggleUI();
    } catch (e) {}
}

document.getElementById("btnToggleNotifications").addEventListener("click", async () => {
    if (Notification.permission === "denied") {
        alert("Notifications are completely blocked by your browser. Please click the lock icon in your address bar to allow them.");
        return;
    }

    const toggle = document.getElementById("notifToggleSwitch");
    
    if (toggle.classList.contains("active")) {
        if (confirm("Are you sure you want to disable notifications for this device?")) await unsubscribePushNotifications();
    } else {
        toggle.style.opacity = "0.5";
        await requestPushPermissions();
        toggle.style.opacity = "1";
    }
});

function loadSessions() {
    if (sessionsCache.size === 0) { el.sessionsList.innerHTML = `<div class="no-data-text">No active sessions found.</div>`; return; }
    
    let htmlBuffer = "";
    sessionsCache.forEach((d) => {
        let devName = d.deviceName || "Unknown Device";
        let isMe = (d.id === myWebDeviceID);
        if (isMe) devName += " (This Browser)";
        
        let timeStr = "Recently";
        if (d.loginTime) timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        let btnHtml = isMe ? `<span style="font-size:10px; color:#10b981; font-weight:bold;">Active</span>` : `<button class="revoke-btn" onclick="revokeSession('${d.id}', '${d.parent}')">Kick</button>`;
        
        htmlBuffer += `
            <div class="session-card">
                <div class="session-info"><h4>${devName}</h4><p>Logged in: ${timeStr}</p></div>
                ${btnHtml}
            </div>`;
    });
    el.sessionsList.innerHTML = htmlBuffer;
}

window.revokeSession = async function(sessionID, parentDocID) {
    if (!confirm("Are you sure you want to log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", collegeID, "students", parentDocID, "sessions", sessionID));
        alert("Session revoked. The device will be logged out shortly.");
    } catch(e) { alert("Error revoking session."); }
};

// ==========================================
// CALENDAR
// ==========================================
document.getElementById("btnCalendar").addEventListener("click", () => { 
    calendarMode = "global"; el.calModal.classList.add("active"); 
    let d = new Date(); currentDisplayDate = new Date(d.getFullYear(), d.getMonth(), 1); 
    loadCalendarData(); 
});
document.getElementById("closeCalendarBtn").addEventListener("click", () => el.calModal.classList.remove("active"));
document.getElementById("calPrevMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); loadCalendarData(); });
document.getElementById("calNextMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); loadCalendarData(); });

async function loadCalendarData() {
    el.calTitle.innerText = currentDisplayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    el.calGrid.innerHTML = ""; el.upcomingTxt.innerHTML = "Loading...";
    let displayYear = currentDisplayDate.getFullYear(); let displayMonth = currentDisplayDate.getMonth() + 1; 
    let targetYearStr = (displayMonth >= 6) ? `${displayYear}-${displayYear + 1}` : `${displayYear - 1}-${displayYear}`;
    
    if (cachedCalYear !== targetYearStr) {
        cachedCalYear = targetYearStr; calWorkingDays.clear(); calNonWorkingDays.clear(); semStarts.clear(); semEnds.clear();
        try {
            const [semDoc, workDoc, holDoc] = await Promise.all([ getDoc(doc(db, "colleges", collegeID, "semesters", targetYearStr)), getDoc(doc(db, "colleges", collegeID, "workingDays", targetYearStr)), getDoc(doc(db, "colleges", collegeID, "nonWorkingDays", targetYearStr)) ]);
            if (semDoc.exists()) { let d = semDoc.data(); if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); }
            if (workDoc.exists()) { Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k)); }
            if (holDoc.exists()) { Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v)); }
        } catch(e) {}
    }
    renderCalendarGrid(); updateUpcomingEvent();
}

function renderCalendarGrid() {
    el.calGrid.innerHTML = ""; const year = currentDisplayDate.getFullYear(); const month = currentDisplayDate.getMonth(); const today = new Date();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { el.calGrid.innerHTML += `<div class="cal-cell empty"></div>`; }
    for (let day = 1; day <= daysInMonth; day++) {
        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let cellClass = "cal-cell normal"; let subText = ""; let popupText = "";
        
        if (semStarts.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>Start</span>"; popupText = `${semStarts.get(dateStr)} Semester Starts`; } 
        else if (semEnds.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>End</span>"; popupText = `${semEnds.get(dateStr)} Semester Ends`; }
        else { if (!calWorkingDays.has(dateStr)) { if (calNonWorkingDays.has(dateStr)) { cellClass = "cal-cell holiday"; popupText = calNonWorkingDays.get(dateStr); } else { let dWeek = new Date(year, month, day).getDay(); if (dWeek === 0 || dWeek === 6) { cellClass = "cal-cell holiday"; } } } }
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) { cellClass += " today"; }
        
        let clickEvent = "";
        if (calendarMode === "daily") clickEvent = `onclick="selectDateAndLoadDaily('${dateStr}')"`;
        else clickEvent = popupText ? `onclick="alert('${popupText}')"` : "";
        
        el.calGrid.innerHTML += `<div class="${cellClass}" ${clickEvent}>${day}${subText}</div>`;
    }
}

window.selectDateAndLoadDaily = function(dateStr) {
    el.calModal.classList.remove("active");
    let parts = dateStr.split('-'); currentDailyDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    loadDailyAttendance();
};

function updateUpcomingEvent() {
    let checkDate = new Date(); let found = false;
    for (let i = 0; i < 60; i++) {
        let fDate = new Date(checkDate); fDate.setDate(checkDate.getDate() + i);
        let dateStr = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}-${String(fDate.getDate()).padStart(2, '0')}`;
        if (calNonWorkingDays.has(dateStr)) { let reason = calNonWorkingDays.get(dateStr); if (reason === "Holiday/Weekend") reason = "Holiday"; el.upcomingTxt.innerHTML = `<span style="font-size:10px; color:#666;">upcoming</span><br><b>${fDate.getDate()} | ${fDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</b><br><span style="font-size:12px;">${reason}</span>`; found = true; break; }
        let dWeek = fDate.getDay(); if ((dWeek === 0 || dWeek === 6) && !calWorkingDays.has(dateStr)) { el.upcomingTxt.innerHTML = `<span style="font-size:10px; color:#666;">upcoming</span><br><b>${fDate.getDate()} | ${fDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</b><br><span style="font-size:12px;">Weekend</span>`; found = true; break; }
    }
    if (!found) el.upcomingTxt.innerHTML = "No upcoming holidays";
}

// ==========================================
// ADHYORA TITLE SANSKRIT GLITCH EFFECT
// ==========================================
const sanskritMap = {
    'A': 'अ', 'B': 'ब', 'C': 'क', 'D': 'ड', 'E': 'ए',
    'F': 'फ', 'G': 'ग', 'H': 'ह', 'I': 'इ', 'J': 'ज',
    'K': 'क', 'L': 'ल', 'M': 'म', 'N': 'न', 'O': 'ओ',
    'P': 'प', 'Q': 'क', 'R': 'र', 'S': 'स', 'T': 'ट',
    'U': 'उ', 'V': 'व', 'W': 'व', 'X': 'श', 'Y': 'य',
    'Z': 'ज'
};

function startTitleGlitch() {
    const titleEl = document.querySelector('.logo-text');
    if (!titleEl) return;
    
    const originalText = "ADHYORA"; 
    let currentText = originalText.split('');
    
    const glitchDuration = 2000; 
    const minInterval = 3000;    
    const maxInterval = 6000;    

    function doGlitch() {
        let rIndex = Math.floor(Math.random() * originalText.length);
        let origChar = originalText[rIndex];
        
        if (sanskritMap[origChar]) {
            currentText[rIndex] = sanskritMap[origChar];
            titleEl.innerText = currentText.join('');
            
            setTimeout(() => {
                currentText[rIndex] = origChar;
                titleEl.innerText = currentText.join('');
                
                let nextWait = Math.floor(Math.random() * (maxInterval - minInterval + 1) + minInterval);
                setTimeout(doGlitch, nextWait);
                
            }, glitchDuration); 
        } else {
            setTimeout(doGlitch, 1000);
        }
    }
    setTimeout(doGlitch, 2000);
}

startTitleGlitch();

// ==========================================
// THEME & APPEARANCE ENGINE
// ==========================================
const themesModal = document.getElementById("themesModal");
const btnThemes = document.getElementById("btnThemes");
const closeThemesBtn = document.getElementById("closeThemesBtn");

const colorPalettes = {
    blue:   { main: '#3b82f6', light: '#e0f2fe', nav: '#bfdbfe' },
    yellow: { main: '#eab308', light: '#fef9c3', nav: '#fde047' }, 
    pink:   { main: '#ec4899', light: '#fce7f3', nav: '#fbcfe8' },
    purple: { main: '#8b5cf6', light: '#ede9fe', nav: '#ddd6fe' },
    orange: { main: '#f97316', light: '#ffedd5', nav: '#fed7aa' }
};

btnThemes.addEventListener("click", () => {
    el.sidebar.classList.remove("open"); 
    el.overlay.classList.remove("active");
    themesModal.classList.add("active");
});
closeThemesBtn.addEventListener("click", () => themesModal.classList.remove("active"));

function setRippleOrigin(x, y) {
    document.documentElement.style.setProperty('--ripple-x', `${x}px`);
    document.documentElement.style.setProperty('--ripple-y', `${y}px`);
}

function applyTheme(colorKey, isDark, animated = true) {
    const executeThemeUpdate = () => {
        const root = document.documentElement;
        const palette = colorPalettes[colorKey] || colorPalettes.blue;

        root.style.setProperty('--theme-main', palette.main);
        root.style.setProperty('--theme-light', palette.light);
        root.style.setProperty('--theme-nav', palette.nav);

        if (isDark) {
            document.body.classList.add("dark-mode");
        } else {
            document.body.classList.remove("dark-mode");
        }

        document.querySelectorAll('.color-swatch').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === colorKey);
        });
        document.getElementById("btnDarkMode").classList.toggle("active", isDark);
        document.getElementById("btnLightMode").classList.toggle("active", !isDark);

        localStorage.setItem("adhyora_theme_color", colorKey);
        localStorage.setItem("adhyora_theme_mode", isDark ? "dark" : "light");

        updateStatusBar();
    };

    if (!animated || !document.startViewTransition) {
        executeThemeUpdate();
        return;
    }

    document.startViewTransition(executeThemeUpdate);
}

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setRippleOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);

        let selectedColor = e.currentTarget.dataset.theme;
        let isDark = document.body.classList.contains("dark-mode");
        applyTheme(selectedColor, isDark);
        UI_Audio.playWhoosh();
    });
});

document.getElementById("btnDarkMode").addEventListener("click", (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRippleOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);

    let currentColor = localStorage.getItem("adhyora_theme_color") || "blue";
    applyTheme(currentColor, true);
    UI_Audio.playWhoosh();
});

document.getElementById("btnLightMode").addEventListener("click", (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRippleOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);

    let currentColor = localStorage.getItem("adhyora_theme_color") || "blue";
    applyTheme(currentColor, false);
    UI_Audio.playWhoosh();
});

function loadSavedTheme() {
    let savedColor = localStorage.getItem("adhyora_theme_color") || "blue";
    let savedMode = localStorage.getItem("adhyora_theme_mode") || "light";
    applyTheme(savedColor, savedMode === "dark", false); 
}

loadSavedTheme();

// ==========================================
// 🚨 NOTIFICATION CLICK HANDLERS 🚨
// ==========================================
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'openMessages') {
        const btn = document.getElementById("btnNavMsg");
        if (btn) btn.click();
    } 
    else if (event.data && event.data.action === 'openNotifications') {
        const btn = document.getElementById("btnNavNotif");
        if (btn) btn.click();
    }
    else if (event.data && event.data.action === 'openAssignments') {
        const btn = document.getElementById("btnNavAssign");
        if (btn) btn.click();
    }
});

window.addEventListener('load', () => {
    if (window.location.hash === "#inbox" || localStorage.getItem("pendingInboxOpen") === "true") {
        localStorage.removeItem("pendingInboxOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavMsg");
            if (btn) btn.click();
        }, 1500); 
    }
    if (window.location.hash === "#notifications" || localStorage.getItem("pendingNotifOpen") === "true") {
        localStorage.removeItem("pendingNotifOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavNotif");
            if (btn) btn.click();
        }, 1500); 
    }
    if (window.location.hash === "#assignments" || localStorage.getItem("pendingAssignOpen") === "true") {
        localStorage.removeItem("pendingAssignOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavAssign");
            if (btn) btn.click();
        }, 1500); 
    }
});

// ==========================================
// 💳 STUDENT FEE PORTAL ENGINE
// ==========================================
let feesLoaded = false;

async function FEES_Init() {
    if (feesLoaded) return;
    feesLoaded = true;
    renderFeeDashboard();
}

async function renderFeeDashboard() {
    let container = document.getElementById("feesListContainer");
    container.innerHTML = "<i>Loading Fee Portal...</i>";

    if (!currentStudentProfileData || !currentStudentProfileData.Department) {
        container.innerHTML = "Profile data not loaded.";
        return;
    }

    try {
        let deptName = currentStudentProfileData.Department.replace("DEPT_", "");
        let deptID = "DEPT_" + deptName.replace(/\s+/g, '');
        
        let feeMap = {}; 
        let totalDue = 0;
        let totalPaid = 0;

        const feeSnap = await getDocs(collection(db, "colleges", collegeID, "fee_structures"));
        
        feeSnap.forEach(d => {
            let data = d.data();
            if (data.departmentID === deptID || data.departmentID === "General") {
                feeMap[data.targetSemester] = { 
                    amount: data.semesterFee || 0, 
                    dueDate: data.dueDate || "N/A", 
                    paid: 0, 
                    status: "Pending",
                    transactions: [] 
                };
                totalDue += (data.semesterFee || 0);
            }
        });

        const paySnap = await getDocs(collection(db, "colleges", collegeID, "students", currentRollNo, "payments"));
        paySnap.forEach(d => {
            let p = d.data();
            totalPaid += (p.amount || 0);
            
            if (feeMap[p.semester]) {
                feeMap[p.semester].paid += (p.amount || 0);
                
                let tTime = "N/A";
                if (p.timestamp) {
                    tTime = p.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                
                feeMap[p.semester].transactions.push({
                    id: p.razorpay_payment_id || d.id || "N/A",
                    orderId: p.razorpay_order_id || "N/A",
                    date: p.date || "N/A",
                    time: tTime,
                    method: p.method || "Online"
                });
            }
        });

        Object.keys(feeMap).forEach(sem => {
            if (feeMap[sem].paid >= feeMap[sem].amount) feeMap[sem].status = "Paid";
            else if (feeMap[sem].paid > 0) feeMap[sem].status = "Partial";
        });

        let pendingOverall = totalDue - totalPaid;
        let isBasePlan = (window.collegePlanTier === "base");

        if (isBasePlan && totalPaid === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #64748b; background: var(--bg-base); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-top: 10px;">
                    <i class="fas fa-wallet" style="font-size: 48px; color: #cbd5e1; margin-bottom: 15px;"></i>
                    <h3 style="color: var(--text-main); margin-bottom: 5px;">Fee Portal Offline</h3>
                    <p style="font-size: 13px; line-height: 1.6;">Your institution does not use Adhyora for online fee collection. Please contact your administration office directly for any fee inquiries.</p>
                </div>
            `;
            return; 
        }

        let html = "";

        if (!isBasePlan) {
            html += `
                <div class="data-card" style="border-left-color: var(--theme-main); background: var(--theme-light);">
                    <h4 style="margin-bottom: 10px; font-size: 14px; opacity: 0.8;">Institutional Summary</h4>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span>Total Due:</span> <b>₹${totalDue.toLocaleString()}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span>Total Paid:</span> <b style="color:#10b981;">₹${totalPaid.toLocaleString()}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-top: 1px solid var(--border-color); padding-top: 5px;">
                        <span>Remaining:</span> <b style="color:#ef4444;">₹${pendingOverall.toLocaleString()}</b>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="info-banner" style="padding: 15px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; margin-bottom: 20px; font-size: 13px; color: #b91c1c;">
                    <i class="fas fa-info-circle"></i> Online fee collection is currently disabled for this institution. Your past digital receipts are safely preserved below.
                </div>
            `;
        }

        html += `<h4 style="margin: 20px 0 10px 0; font-size: 14px;">${isBasePlan ? "Past Payment Records" : "Semester Details"}</h4>`;

        let semKeysToRender = Object.keys(feeMap).sort((a,b) => a-b);
        
        if (isBasePlan) {
            semKeysToRender = semKeysToRender.filter(sem => feeMap[sem].transactions && feeMap[sem].transactions.length > 0);
        }

        html += semKeysToRender.map(sem => {
            let f = feeMap[sem];
            let color = f.status === "Paid" ? "#10b981" : (f.status === "Partial" ? "#f59e0b" : "#ef4444");
            let pendingAmt = f.amount - f.paid;
            
            let receiptBlockHTML = "";
            if (f.transactions && f.transactions.length > 0) {
                receiptBlockHTML = `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color); font-size: 11px; color: #64748b; line-height: 1.6;">
                        ${f.transactions.map((t) => {
                            
                            let isOffline = (t.method === "Cash/Offline" || t.method === "Office Payment (Cash/Cheque)" || t.id.startsWith("OFFLINE_") || t.id.startsWith("RCPT-"));
                            
                            let idLabel = isOffline ? "Receipt Ref" : "TXN ID";
                            let methodBadge = isOffline 
                                ? `<span style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold;"><i class="fas fa-building"></i> Paid at Office</span>` 
                                : `<span style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold;"><i class="fas fa-globe"></i> Online</span>`;

                            return `
                            <div id="receipt-${t.id}" style="margin-bottom: 12px; padding: 12px; background: var(--theme-light); border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                                
                                <div style="display:flex; justify-content:space-between; font-weight:600; color:var(--text-main); margin-bottom:8px;">
                                    <span style="font-size: 13px;">🧾 Fee Receipt (Sem ${sem})</span>
                                    ${methodBadge}
                                </div>
                                
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
                                    <div><b>${idLabel}:</b> <span style="font-family: monospace; color:var(--text-main); font-size:12px;">${t.id}</span></div>
                                    <button onclick="navigator.clipboard.writeText('${t.id}'); showToast('✅ ${idLabel} Copied!');" style="background:none; border:none; cursor:pointer; color:var(--theme-main); padding:5px;">
                                        <i class="fas fa-copy" style="font-size: 14px;"></i>
                                    </button>
                                </div>
                                
                                <div><b>Order ID:</b> <span style="font-family: monospace;">${t.orderId}</span></div>
                                
                                <div style="margin-top:6px; padding-top:6px; border-top: 1px solid rgba(0,0,0,0.05); font-size:10px; display:flex; justify-content:space-between;">
                                    <span>Cleared: ${t.date} @ ${t.time}</span>
                                    <span style="color: #10b981; font-weight:bold;">₹${t.amount || f.amount}</span>
                                </div>
                                
                                <button onclick="shareReceiptImage('receipt-${t.id}', '${t.id}')" style="width:100%; margin-top:10px; padding:8px; background: var(--bg-base); border: 1px solid var(--theme-main); border-radius:6px; font-weight:bold; cursor:pointer; color:var(--theme-main); display:flex; justify-content:center; align-items:center; gap:8px;">
                                    <i class="fas fa-share-nodes"></i> Share Digital Receipt
                                </button>
                                
                            </div>`;
                        }).join('')}
                    </div>
                `;
            }
            
            let payButtonHTML = "";
            if (!isBasePlan && f.status !== "Paid") {
                payButtonHTML = `<button onclick="FEES_PayNow('${sem}', ${pendingAmt})" style="width:100%; padding:10px; border:none; background:var(--theme-main); color:white; border-radius:8px; cursor:pointer; font-weight:bold; margin-top:10px;">Pay ₹${pendingAmt.toLocaleString()}</button>`;
            }

            return `
            <div class="data-card">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-weight:bold; font-size: 14px;">Semester ${sem}</span>
                    <span style="color:${color}; font-weight:bold; font-size: 12px;">${f.status}</span>
                </div>
                <div style="font-size:12px; color:#64748b; margin-bottom:10px;"><i class="fas fa-calendar-alt"></i> Due: ${f.dueDate}</div>
                <div style="display:flex; justify-content:space-between; font-size:13px; color:#334155; margin-bottom: ${f.status === "Paid" ? '0' : '10px'};">
                    <span>Total: ₹${f.amount.toLocaleString()}</span>
                    <span style="font-weight:600;">Paid: ₹${f.paid.toLocaleString()}</span>
                </div>
                ${receiptBlockHTML} 
                ${payButtonHTML}
            </div>`;
        }).join('');

        container.innerHTML = html;

    } catch(e) { 
        container.innerHTML = "Error loading fees."; 
        console.error("Fee Load Error:", e);
    }
}

window.FEES_PayNow = async (sem, amount) => {
    if (!confirm(`Confirm payment of ₹${amount.toLocaleString()} for Semester ${sem}?`)) return;
    
    showPaymentLoader("Initializing Secure Gateway...");

    try {
        const response = await fetch('https://asia-south1-adhyora-5d4c1.cloudfunctions.net/createRazorpayOrder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collegeId: collegeID, amountInRupees: amount })
        });
        
        const orderData = await response.json();
        
        if (!orderData.success) {
            hidePaymentLoader(); 
            showToast("❌ Could not initialize gateway. Please try again later.");
            return;
        }

        var options = {
            "key": orderData.razorpayKeyId,
            "amount": orderData.amountInPaise, 
            "currency": "INR",
            "name": "Adhyora",
            "description": `Semester ${sem} Tuition Fee`,
            "image": "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/main/AdhyoraSplashLogo5.png",
            "order_id": orderData.orderId, 
            "prefill": {
                "name": currentStudentProfileData.Name || "",
                "email": currentStudentProfileData.email || "",
            },
            "theme": { "color": "#3b82f6" },
            "handler": async function (response) {
                showPaymentLoader("Securing Digital Receipt...");
                
                try {
                    const verifyResponse = await fetch('https://asia-south1-adhyora-5d4c1.cloudfunctions.net/verifyAndSavePayment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collegeId: collegeID,
                            studentId: currentRollNo,
                            studentName: currentStudentProfileData.Name || "Unknown",
                            department: currentStudentProfileData.Department || "General",
                            semester: sem,
                            amount: amount,
                            paymentId: response.razorpay_payment_id,
                            orderId: response.razorpay_order_id,
                            signature: response.razorpay_signature
                        })
                    });

                    const verifyResult = await verifyResponse.json();

                    if (verifyResult.success) {
                        showToast("✅ Payment Verified & Receipt Saved!");
                        await renderFeeDashboard(); 
                        hidePaymentLoader(); 
                    } else {
                        hidePaymentLoader();
                        showToast("❌ Payment successful, but verification failed. Contact Admin.");
                    }
                } catch (err) {
                    hidePaymentLoader();
                    showToast("❌ Network error saving receipt.");
                }
            }
        };
        
        var rzpCheckout = new Razorpay(options);
        rzpCheckout.on('payment.failed', function (response){
            hidePaymentLoader();
            showToast("❌ Payment Failed or Cancelled.");
        });
        
        hidePaymentLoader(); 
        rzpCheckout.open();

    } catch(e) { 
        hidePaymentLoader();
        showToast("❌ Network Error connecting to payment server."); 
    }
};

function showPaymentLoader(message) {
    const loader = document.getElementById("paymentLoaderOverlay");
    const loaderText = document.getElementById("paymentLoaderText");
    if (loader && loaderText) {
        loaderText.innerText = message;
        loader.classList.remove("payment-loader-hidden");
        loader.classList.add("payment-loader-active");
    }
}

function hidePaymentLoader() {
    const loader = document.getElementById("paymentLoaderOverlay");
    if (loader) {
        loader.classList.remove("payment-loader-active");
        loader.classList.add("payment-loader-hidden");
    }
}

// ==========================================
// RECEIPT IMAGE GENERATOR & SHARING
// ==========================================
window.shareReceiptImage = async (elementId, txnId) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    showToast("Generating secure receipt... Please wait.");
    
    try {
        const canvas = await html2canvas(el, { 
            scale: 3, 
            backgroundColor: "#ffffff",
            logging: false
        });
        
        canvas.toBlob(async (blob) => {
            if (!blob) {
                showToast("❌ Failed to generate image.");
                return;
            }
            
            const file = new File([blob], `Adhyora_Receipt_${txnId}.png`, { type: 'image/png' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Adhyora Fee Receipt',
                        text: `Fee Payment Receipt. TXN ID: ${txnId}`
                    });
                } catch (err) {
                    console.log("User cancelled share");
                }
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Adhyora_Receipt_${txnId}.png`;
                a.click();
                URL.revokeObjectURL(url);
                showToast("✅ Receipt downloaded to your device!");
            }
        }, 'image/png');
        
    } catch (err) {
        console.error("Image gen error", err);
        showToast("❌ Could not generate receipt image.");
    }
};

// ==========================================
// 📅 SUBJECT ATTENDANCE FILTER & LEDGER (PORTED FROM PRINCIPAL APP)
// ==========================================

const studentDateFilter = document.getElementById("studentDateFilter");
const btnAllTimeFilter = document.getElementById("btnAllTimeFilter");

if (studentDateFilter && btnAllTimeFilter) {
    studentDateFilter.addEventListener("change", (e) => {
        if(e.target.value) {
            // 🚨 REMOVED THE DIMMING LOGIC: Button keeps its theme color!
            FetchSubjectDailyAttendance(e.target.value);
        }
    });

    btnAllTimeFilter.addEventListener("click", () => {
        studentDateFilter.value = "";
        // 🚨 Re-run the master UI builder to restore all full-semester stats!
        updateUIForCurrentSemester(rawDept); 
    });
}

async function FetchSubjectDailyAttendance(targetDate) {
    const listEl = el.subList; 
    listEl.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px 20px; color:#64748b; font-size:13px; font-weight:bold;"><div style="transform: scale(0.5); margin-bottom: -10px;"><div class="isometric-loader"><div class="iso-layer"></div><div class="iso-layer"></div><div class="iso-layer"></div></div></div> Loading daily records...</div>`;
    
    let semDisplay = sortedSemesterKeys[currentSemesterIndex].replace("_", " ");
    
    try {
        // 🚀 ROBUST QUERY: Fetch all possible semester string formats simultaneously
        let format1 = semDisplay; 
        let format2 = semDisplay.replace(/\s+/g, "_"); 
        let format3 = semDisplay.replace(/\s+/g, ""); 

        const [snap1, snap2, snap3] = await Promise.all([
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", targetDate), where("semester", "==", format1))),
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", targetDate), where("semester", "==", format2))),
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", targetDate), where("semester", "==", format3)))
        ]);

        let allDocsMap = new Map();
        snap1.forEach(doc => allDocsMap.set(doc.id, doc.data()));
        snap2.forEach(doc => allDocsMap.set(doc.id, doc.data()));
        snap3.forEach(doc => allDocsMap.set(doc.id, doc.data()));

        if (allDocsMap.size === 0) {
            listEl.innerHTML = `<div class="no-data-text">No records found for this date.</div>`;
            // Update counts to 0 without touching the wave percentages!
            el.perPres.innerText = `Periods Present: 0`; 
            el.perAbs.innerText = `Periods Absent: 0`; 
            el.perTot.innerText = `Total Periods: 0`;
            el.attClasses.innerText = `Attended: 0`;
            el.absClasses.innerText = `Absent: 0`;
            el.totClasses.innerText = `Total: 0`;
            return;
        }

        let dayPres = 0, dayAbs = 0; 
        let dailyRecords = [];

        // Extract period data
        allDocsMap.forEach((d) => {
            let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
            for (let i = 1; i <= pCount; i++) {
                let pKey = `period_${i}`;
                let pData = d[pKey];
                
                // If the period exists and this specific student was marked in it
                if (pData && pData.attendance && pData.attendance[currentRollNo] !== undefined) {
                    let isPres = pData.attendance[currentRollNo]; 
                    if(isPres) dayPres++; else dayAbs++;
                    
                    let subName = pData.subject || "Unknown Subject"; 
                    if(pData.event_details && pData.event_details[currentRollNo]) subName = pData.event_details[currentRollNo];
                    let teacherName = pData.markedByTeacherName || "Unknown Teacher";
                    
                    let timeString = "--:--";
                    if (pData.timestamp) {
                        let jsDate = pData.timestamp.toDate ? pData.timestamp.toDate() : new Date(pData.timestamp.seconds * 1000);
                        timeString = jsDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    }

                    dailyRecords.push({
                        period: i,
                        subName: subName,
                        teacherName: teacherName,
                        timeString: timeString,
                        isPres: isPres
                    });
                }
            }
        });

        // Sort records logically (Period 1 to 6)
        dailyRecords.sort((a, b) => a.period - b.period);

        if (dailyRecords.length === 0) {
             listEl.innerHTML = `<div class="no-data-text">You were not explicitly marked in any periods on this date.</div>`;
             return;
        }

        // Generate the new UI cards
        let html = dailyRecords.map(record => {
            let badgeClass = record.isPres ? "present" : "absent";
            let badgeText = record.isPres ? "Present" : "Absent";
            let icon = record.isPres ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
            
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:var(--bg-base); border:1px solid var(--border-color); border-radius:12px; box-shadow:0 2px 5px rgba(0,0,0,0.02); transition:0.2s; margin-bottom:10px;">
                <div style="display:flex; flex-direction:column; gap:6px;">
                    
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:14px; font-weight:800; color:var(--text-dark);">${record.subName}</span>
                        <span style="font-size:10px; font-weight:700; color:#94a3b8; background:var(--theme-light); padding:2px 6px; border-radius:6px;"><i class="far fa-clock" style="margin-right:3px;"></i> ${record.timeString}</span>
                    </div>
                    
                    <span style="font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase;">
                        Period ${record.period} 
                        <span style="margin: 0 4px; opacity:0.3;">|</span> 
                        <i class="fas fa-user-edit" style="margin-right:3px;"></i> ${record.teacherName}
                    </span>
                    
                </div>
                <div class="ledger-badge ${badgeClass}" style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:800; text-transform:uppercase;">${icon} ${badgeText}</div>
            </div>`;
        }).join('');

        // 🚨 Update UI Counters exactly like the Principal Script (DO NOT TOUCH PERCENTAGES)
        el.perPres.innerText = `Periods Present: ${dayPres}`; 
        el.perAbs.innerText = `Periods Absent: ${dayAbs}`; 
        el.perTot.innerText = `Total Periods: ${dayPres + dayAbs}`;
        el.attClasses.innerText = `Attended: ${dayPres}`;
        el.absClasses.innerText = `Absent: ${dayAbs}`;
        el.totClasses.innerText = `Total: ${dayPres + dayAbs}`;

        listEl.innerHTML = html;

    } catch(e) { 
        console.error(e);
        listEl.innerHTML = `<div class="no-data-text" style="color:red; margin-top:20px;">Error loading daily records.</div>`;
    }
}

// ==========================================
// 📅 OPTIMIZED ATTENDANCE LEDGER POPUP
// ==========================================
const ledgerOverlay = document.getElementById("attendanceLedgerOverlay");

// Pagination & Cache Variables
let ledgerTimelineCache = {}; 
let ledgerCurrentData = [];
let ledgerRenderLimit = 15;

window.CloseAttendanceLedger = function() {
    ledgerOverlay.style.opacity = '0';
    setTimeout(() => { ledgerOverlay.style.display = 'none'; }, 300);
};

window.OpenAttendanceLedger = async (subjectNameFromUI, presentCount, totalCount) => {
    ledgerOverlay.style.display = 'flex';
    setTimeout(() => { ledgerOverlay.style.opacity = '1'; }, 10);
    
    document.getElementById("ledgerSubjectTitle").innerText = subjectNameFromUI.split('<')[0].trim();
    document.getElementById("ledgerStatsSubtitle").innerText = `Attended: ${presentCount} / ${totalCount} Classes`;
    
    const listContainer = document.getElementById("ledgerListContainer");
    listContainer.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px 20px; color:#64748b; font-size:13px; font-weight:bold;"><div style="transform: scale(0.5); margin-bottom: -10px;"><div class="isometric-loader"><div class="iso-layer"></div><div class="iso-layer"></div><div class="iso-layer"></div></div></div> Digging through records...</div>`;

    let semDisplay = sortedSemesterKeys[currentSemesterIndex].replace("_", " ");
    
    // 🚀 CACHE CHECK: Zero Read Cost on Re-opens
    let cacheKey = `${currentRollNo}_${semDisplay}_${subjectNameFromUI}`;

    if (!ledgerTimelineCache[cacheKey]) {
        ledgerTimelineCache[cacheKey] = await FetchDatesForSubject(subjectNameFromUI, semDisplay);
    }

    ledgerCurrentData = ledgerTimelineCache[cacheKey];
    ledgerRenderLimit = 15; // Reset pagination limit on fresh open
    
    RenderLedgerList();
};

function RenderLedgerList() {
    const listContainer = document.getElementById("ledgerListContainer");
    
    if (ledgerCurrentData.length === 0) {
        listContainer.innerHTML = `<div class="no-data-text" style="padding: 20px 0;">No timeline records found.</div>`;
        return;
    }

    let renderBatch = ledgerCurrentData.slice(0, ledgerRenderLimit);
    let oldScroll = listContainer.scrollTop;

    let html = renderBatch.map(record => {
        let badgeClass = record.isPresent ? "present" : "absent";
        let badgeText = record.isPresent ? "Present" : "Absent";
        let icon = record.isPresent ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        
        // 🚨 SHOW SPECIFIC EVENT NAME BADGE IF IT'S AN EVENT!
        let eventHtml = record.eventName ? `<div style="margin-top:6px;"><span style="font-size:10px; font-weight:800; color:var(--brand-green); background:var(--bg-grid-color); border:1px solid var(--border-color); padding:3px 8px; border-radius:6px; letter-spacing:0.5px;">${record.eventName}</span></div>` : "";

        return `
        <div class="ledger-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:var(--bg-base); border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px; transition:0.2s;">
            
            <div style="display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; padding-right:10px;">
                
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span style="font-size:14px; font-weight:800; color:var(--text-main); white-space:nowrap;">${record.dateFormatted}</span>
                    <span style="font-size:10px; font-weight:700; color:#64748b; background:var(--bg-main, #f8fafc); border:1px solid var(--border-color); padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; white-space:nowrap;">
                        <i class="far fa-clock" style="margin-right:4px;"></i> ${record.timeFormatted}
                    </span>
                </div>
                
                <div style="font-size:11px; font-weight:700; color:#64748b; display:inline-flex; align-items:center; width:fit-content; max-width:100%;">
                    <span style="white-space:nowrap;">PERIOD ${record.period}</span>
                    <span style="margin: 0 6px; opacity:0.4;">|</span>
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <i class="fas fa-user-edit" style="margin-right:4px;"></i> ${record.teacherName}
                    </span>
                </div>
                ${eventHtml}
            </div>

            <div class="ledger-badge ${badgeClass}" style="display:flex; align-items:center; gap:4px; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:800; text-transform:uppercase; flex-shrink:0;">
                ${icon} ${badgeText}
            </div>
            
        </div>`;
    }).join('');

    if (ledgerRenderLimit < ledgerCurrentData.length) {
        html += `<div style="text-align:center; padding:15px; font-size:11px; color:#94a3b8; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">Scroll for more records</div>`;
    } else {
        html += `<div style="text-align:center; padding:15px; font-size:11px; color:#cbd5e1; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">End of Timeline</div>`;
    }

    listContainer.innerHTML = html;
    listContainer.scrollTop = oldScroll;
}

// 🚀 SCROLL LISTENER: Triggers when user hits the bottom
document.getElementById("ledgerListContainer").addEventListener("scroll", (e) => {
    let el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
        if (ledgerRenderLimit < ledgerCurrentData.length) {
            ledgerRenderLimit += 15; // Load 15 more
            RenderLedgerList();
        }
    }
});

async function FetchDatesForSubject(subjectNameFromUI, semDisplay) {
    let timeline = [];
    let dbSubjectName = subjectNameFromUI.split('<')[0].trim().replace("/", "-");

    // 🚨 THE FIX: Map "Events" -> "Special Events" for database query
    if (dbSubjectName === "Events" || dbSubjectName === "Special Events") {
        dbSubjectName = "Special Events";
    }

    try {
        let format1 = semDisplay; 
        let format2 = semDisplay.replace(/\s+/g, "_"); 
        let format3 = semDisplay.replace(/\s+/g, ""); 

        const [snap1, snap2, snap3] = await Promise.all([
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("semester", "==", format1))),
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("semester", "==", format2))),
            getDocs(query(collection(db, "colleges", collegeID, "attendance"), where("semester", "==", format3)))
        ]);

        let allDocsMap = new Map();
        snap1.forEach(doc => allDocsMap.set(doc.id, doc.data()));
        snap2.forEach(doc => allDocsMap.set(doc.id, doc.data()));
        snap3.forEach(doc => allDocsMap.set(doc.id, doc.data()));

        allDocsMap.forEach((d, docId) => {
            let rawDateStr = d.date || "Unknown Date";
            let dateObj = new Date(rawDateStr);
            let dateFormatted = isNaN(dateObj.getTime()) ? rawDateStr : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            let pCount = window.collegeTimeConfig ? (window.collegeTimeConfig.periodCount || 6) : 6;
            for (let i = 1; i <= pCount; i++) {
                let pKey = `period_${i}`;

                if (d[pKey] && d[pKey].subject) {
                        let logSubjectClean = d[pKey].subject.trim();
                        
                        // 🚨 FIX: Aggressively normalize both strings by removing ALL spaces and converting to lowercase
                        let normalizedLogSubject = logSubjectClean.replace(/[\s-]/g, '').toLowerCase();
                        let normalizedUISubject = subjectNameFromUI.split('<')[0].replace(/[\s-]/g, '').toLowerCase();
                        let normalizedDbSubject = dbSubjectName.replace(/[\s-]/g, '').toLowerCase();
                        
                        // Compare the normalized versions so spaces, hyphens, and casing don't break the timeline
                        if (normalizedLogSubject === normalizedUISubject || normalizedLogSubject === normalizedDbSubject) {
                            if (d[pKey].attendance && d[pKey].attendance[currentRollNo] !== undefined) {
                            
                            let timeString = "--:--";
                            if (d[pKey].timestamp) {
                                let jsDate = d[pKey].timestamp.toDate ? d[pKey].timestamp.toDate() : new Date(d[pKey].timestamp.seconds * 1000);
                                timeString = jsDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            }
                            
                            let teacherName = d[pKey].markedByTeacherName || "Unknown Teacher";
                            let eventBadge = "";

                            // 🚨 Extract Specific Event Name (e.g. "NSS")
                            if (logSubjectClean === "Special Events" && d[pKey].event_details && d[pKey].event_details[currentRollNo]) {
                                eventBadge = d[pKey].event_details[currentRollNo];
                            }

                            timeline.push({
                                dateFormatted: dateFormatted,
                                timeFormatted: timeString,
                                teacherName: teacherName,
                                rawDate: dateObj,
                                period: i,
                                isPresent: d[pKey].attendance[currentRollNo],
                                eventName: eventBadge
                            });
                        }
                    }
                }
            }
        });

        timeline.sort((a, b) => b.rawDate - a.rawDate);

    } catch (error) {
        console.error("Firestore Error Fetching Timeline:", error);
    }

    return timeline;
}

// ==========================================
// 🚨 NATIVE WEB AUDIO ENGINE (CINEMATIC SFX)
// ==========================================
const UI_Audio = {
    ctx: null,
    init: function() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playClick: function() {
        if (localStorage.getItem("adhyora_sound_enabled") === "false") return;
        try {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine'; // Premium soft tick
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.04, this.ctx.currentTime); // Very quiet
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + 0.05);
        } catch(e){}
    },
    playWhoosh: function() {
        if (localStorage.getItem("adhyora_sound_enabled") === "false") return;
        try {
            this.init();
            const duration = 0.65; // 🚨 EXACTLY matches your CSS liquidWaveSwipe duration!
            
            // 1. Generate Cinematic "Air/Liquid" White Noise Buffer
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1; // Fills memory with raw static
            }
            const noiseSource = this.ctx.createBufferSource();
            noiseSource.buffer = buffer;
            
            // 2. The "Whoosh" Sweep Filter (Low to High to Low)
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = 1.2; // Adds a slight resonant "wind" tunnel feel
            
            filter.frequency.setValueAtTime(150, this.ctx.currentTime); // Start low
            filter.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + (duration / 2)); // Sweep up
            filter.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + duration); // Sweep down
            
            // 3. Volume Swell Envelope
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0, this.ctx.currentTime); // Start silent
            gainNode.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + (duration / 2)); // Swell to max volume as wave crosses screen
            gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration); // Fade to silent as wave finishes
            
            // Connect and Play
            noiseSource.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            noiseSource.start();
        } catch(e){}
    }
};

// 🚨 SOUND TOGGLE LOGIC
const btnToggleSounds = document.getElementById("btnToggleSounds");
const soundToggleSwitch = document.getElementById("soundToggleSwitch");

if (btnToggleSounds && soundToggleSwitch) {
    // Load saved preference
    if (localStorage.getItem("adhyora_sound_enabled") === "false") {
        soundToggleSwitch.classList.remove("active");
    }
    
    // Listen for clicks on the ENTIRE button, not just the tiny switch
    btnToggleSounds.addEventListener("click", () => {
        const isActive = soundToggleSwitch.classList.toggle("active");
        localStorage.setItem("adhyora_sound_enabled", isActive ? "true" : "false");
        
        // Wake up the audio engine & play test sound
        UI_Audio.init();
        if (isActive) UI_Audio.playClick(); 
    });
}

// ==========================================
// 🚨 NATIVE ANDROID HAPTIC FEEDBACK & CLICK SOUNDS
// ==========================================
document.addEventListener('click', (e) => {
    // 🚨 FIX: Added .water-progress to the list of recognized clickable targets!
    const target = e.target.closest('button, .icon-btn, .profile-card, .day-btn, .period-btn, .color-swatch, .ledger-row, .water-progress, [onclick]');
    
    if (target) {
        // 1. Fire a premium, tiny 15-millisecond vibration (Android only)
        if (navigator.vibrate) {
            navigator.vibrate(15); 
        }
        
        // 2. Fire the native click sound (Works on all devices: Android, iOS, PC!)
        UI_Audio.playClick(); 
    }
});
