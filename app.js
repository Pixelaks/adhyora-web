// Import Firebase functions directly from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, sendPasswordResetEmail, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp, query, where, limit, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// REPLACE THIS WITH YOUR FIREBASE WEB CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🚀 OPTIMIZATION: Enable Local Disk Caching to cut refresh costs to ZERO for the College List
try {
    enableIndexedDbPersistence(db).catch((err) => {
        console.warn("Firebase Offline Persistence Notice: ", err.code);
    });
} catch(e) {}

// ==========================================
// 🚨 BANK-GRADE ANTI-SNOOPING SHIELD 
// ==========================================
// 1. Block Right-Click Context Menu
document.addEventListener('contextmenu', event => event.preventDefault());

// 2. Block DevTools Keyboard Shortcuts
document.onkeydown = function(e) {
    // Prevent F12
    if (e.keyCode === 123) return false;
    // Prevent Ctrl+Shift+I / J / C (DevTools)
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false;
    // Prevent Ctrl+U (View Source)
    if (e.ctrlKey && e.keyCode === 85) return false;
};

// ==========================================
// AUTO-LOGIN ROUTING & SPLASH SCREEN LOGIC
// ==========================================
const splashScreen = document.getElementById("splashScreen");

function hideSplash() {
    if (splashScreen) {
        setTimeout(() => {
            splashScreen.classList.add("hidden");
        }, 800);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user && user.emailVerified) {
        const savedRole = localStorage.getItem("adhyora_role");
        const savedCollegeID = localStorage.getItem("adhyora_college");
        const savedRollNo = localStorage.getItem("adhyora_roll");
        const savedRoomCode = localStorage.getItem("adhyora_roomcode");

        if (savedRole && savedCollegeID) {
            if (savedRole === "Student") {
                window.location.href = `studentDashboard.html?college=${savedCollegeID}&uid=${user.uid}&roll=${savedRollNo}`;
                return; 
            } 
            else if (savedRole === "Teacher" && savedRoomCode) {
                try {
                    const secureID = "TEACHER_" + savedRoomCode;
                    const lookupRef = doc(db, "colleges", savedCollegeID, "public_lookup", secureID);
                    const lookupSnap = await getDoc(lookupRef);

                    if (lookupSnap.exists()) {
                        window.location.href = `teacherDashboard.html?college=${savedCollegeID}&uid=${user.uid}`;
                        return; 
                    } else {
                        localStorage.clear();
                        sessionStorage.clear();
                    }
                } catch (e) {
                    console.error("Auto-login validation failed", e);
                }
            } 
            else if (savedRole === "Principal") {
                window.location.href = `principalDashboard.html?college=${savedCollegeID}`;
                return; 
            }
            else if (savedRole === "Accountant") {
                window.location.href = `accountantDashboard.html?college=${savedCollegeID}&uid=${user.uid}`;
                return; 
            }
        }
    }

    document.getElementById("loginPassword").value = "";
    document.getElementById("regPassword").value = "";
    document.getElementById("regConfirmPassword").value = "";

    hideSplash();
});

// Global State
let collegesData = {}; 
let selectedCollegeID = "";
let selectedCollegeName = "";

// --- DOM ELEMENTS ---
const collegeDropdown = document.getElementById("collegeDropdown");
const roleDropdown = document.getElementById("roleDropdown");
const continueBtn = document.getElementById("continueBtn");
const signInBtn = document.getElementById("signInBtn");
const registerBtn = document.getElementById("registerBtn");

// --- UI HELPERS & NATIVE BACK BUTTON FIX ---
window.switchPanel = function(panelId, pushToHistory = true) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    
    if (pushToHistory) {
        history.pushState({ panel: panelId }, "", window.location.pathname);
    }
}

window.addEventListener('load', () => {
    history.replaceState({ panel: 'roleSelectionPanel' }, "", "/");
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.panel) {
        window.switchPanel(e.state.panel, false);
    } else {
        window.switchPanel('roleSelectionPanel', false);
    }
});

window.toggleVisibility = function(inputId, iconWrapper) {
    const input = document.getElementById(inputId);
    const icon = iconWrapper.querySelector('i');
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 4000); 
}

// --- 1. LOAD COLLEGES ON START ---
async function fetchColleges() {
    try {
        const querySnapshot = await getDocs(collection(db, "colleges"));
        collegeDropdown.innerHTML = '<option value="" disabled selected>Select Your College</option>';
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            collegesData[docSnap.id] = data; 
            
            const option = document.createElement("option");
            option.value = docSnap.id;
            option.text = data.name || data.Name || "Unknown College";
            collegeDropdown.appendChild(option);
        });

        buildCustomDropdown('collegeDropdown');

    } catch (error) {
        showToast("Error loading colleges.");
        console.error(error);
    }
}
fetchColleges();

// --- 2. ROLE SELECTION LOGIC ---
function checkSelection() {
    if (collegeDropdown.value !== "" && roleDropdown.value !== "") {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
}

collegeDropdown.addEventListener("change", (e) => {
    selectedCollegeID = e.target.value;
    const collegeInfo = collegesData[selectedCollegeID];
    
    const roleSelect = document.getElementById("roleDropdown");
    const accountantOption = roleSelect.querySelector('option[value="Accountant"]');
    
    if (collegeInfo && collegeInfo.subscription) {
        const plan = collegeInfo.subscription.planType;
        const status = collegeInfo.subscription.status;
        
        if ((plan === "pro" || plan === "ultimate") && status === "active") {
            accountantOption.disabled = false;
        } else {
            accountantOption.disabled = true;
            if (roleSelect.value === "Accountant") roleSelect.value = ""; 
        }
    } else {
        accountantOption.disabled = true;
        if (roleSelect.value === "Accountant") roleSelect.value = "";
    }
    
    const oldCustomUI = roleSelect.previousElementSibling;
    if (oldCustomUI && oldCustomUI.classList.contains('custom-select-wrapper')) {
        oldCustomUI.remove(); 
    }
    roleSelect.style.display = 'block'; 
    buildCustomDropdown('roleDropdown'); 
    
    checkSelection();
});

roleDropdown.addEventListener("change", checkSelection);

// --- DYNAMIC UI VISIBILITY ---
function updateSecurityInputsVisibility() {
    const role = roleDropdown.value;
    const regRollNoInput = document.getElementById("regRollNo");
    const regRoomCodeInput = document.getElementById("regRoomCode");
    const loginRoomCodeInput = document.getElementById("loginRoomCode");
    
    if (regRollNoInput) regRollNoInput.style.display = "none";
    if (regRoomCodeInput) regRoomCodeInput.style.display = "none";
    if (loginRoomCodeInput) loginRoomCodeInput.style.display = "none";

    if (role === "Principal") {
        document.getElementById("signInTitle").innerText = "Principal SignIn";
        document.getElementById("registerTitle").innerText = "Principal Registration";
    } 
    else if (role === "Accountant") {
        document.getElementById("signInTitle").innerText = "Accountant SignIn";
        document.getElementById("registerTitle").innerText = "Accountant Registration";
    }
    else if (role === "Teacher") {
        document.getElementById("signInTitle").innerText = "Teacher SignIn";
        document.getElementById("registerTitle").innerText = "Teacher Registration";
        if (regRoomCodeInput) regRoomCodeInput.style.display = "block";
        if (loginRoomCodeInput) loginRoomCodeInput.style.display = "block";
    } 
    else {
        document.getElementById("signInTitle").innerText = "Student SignIn";
        document.getElementById("registerTitle").innerText = "Student Registration";
        if (regRollNoInput) regRollNoInput.style.display = "block"; 
    }
}

// --- CONTINUE BUTTON CLICK ---
continueBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedCollegeID = collegeDropdown.value;
    selectedCollegeName = collegeDropdown.options[collegeDropdown.selectedIndex].text;
    
    updateSecurityInputsVisibility();
    window.switchPanel('signInPanel');
});

// ==========================================
// 🚨 DEFERRED PROFILE CREATION HANDLER
// ==========================================
async function handleFirstTimeVerifiedLogin(user, role, email) {
    if (!user.displayName || !user.displayName.startsWith("{")) return false; 
    
    try {
        let meta = JSON.parse(user.displayName);
        if (meta.r !== role || meta.c !== selectedCollegeID) {
            throw new Error("Role or College mismatch from registration.");
        }

        if (role === "Principal") {
            const lockRef = doc(db, "colleges", selectedCollegeID, "public_lookup", "PRINCIPAL_LOCK");
            const lockSnap = await getDoc(lockRef);
            if (lockSnap.exists()) throw new Error("Registration Blocked: College already claimed.");

            const pRef = doc(db, "colleges", selectedCollegeID, "principals", user.uid);
            await setDoc(pRef, {
                name: meta.n, email: email, role: "Principal", authID: user.uid, userID: user.uid,
                createdAt: serverTimestamp(), hasAgreedToDisclaimer: false, webFcmTokens: []
            });
            await setDoc(lockRef, { claimed: true, claimedByUID: user.uid, timestamp: serverTimestamp() });
        } 
        else if (role === "Accountant") {
            const aRef = doc(db, "colleges", selectedCollegeID, "accountants", user.uid);
            await setDoc(aRef, {
                name: meta.n, email: email, role: "Accountant", authID: user.uid, userID: user.uid,
                hasAgreedToDisclaimer: false, webFcmTokens: [], createdAt: serverTimestamp(), status: "Pending" 
            });

            const notifRef = doc(collection(db, "colleges", selectedCollegeID, "notifications"));
            await setDoc(notifRef, {
                title: "New Staff Registration",
                body: `${meta.n} has registered as an Accountant and is waiting for your approval.`,
                type: "AccountantRequest", senderID: user.uid, senderName: meta.n,
                targetRole: "Principal", isRead: false, timestamp: serverTimestamp()
            });
        }
        else if (role === "Teacher") {
            const tRef = doc(db, "colleges", selectedCollegeID, "teachers", user.uid);
            await setDoc(tRef, {
                name: meta.n, email: email, role: "Teacher", authID: user.uid, userID: user.uid,
                hasAgreedToDisclaimer: false, webFcmTokens: [], createdAt: serverTimestamp(),
                departmentID: meta.ext, status: "Pending"
            });
        }
        else if (role === "Student") {
            const sRef = doc(db, "colleges", selectedCollegeID, "students", meta.ext);
            const sSnap = await getDoc(sRef);
            if (sSnap.exists() && sSnap.data().userID && sSnap.data().userID !== user.uid) {
                throw new Error("This Roll Number has already been claimed by another verified user.");
            }
            await setDoc(sRef, { userID: user.uid, email: email, authStatus: "Verified" }, { merge: true });
        }

        // Wipe the payload from Auth Profile
        await updateProfile(user, { displayName: meta.n });
        return true; 

    } catch(e) {
        console.error("First time setup error:", e);
        throw e;
    }
}

// --- 3. LOGIN LOGIC ---
let loginFailedAttempts = 0; // 🚨 Track failed logins to stop brute force

signInBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const role = roleDropdown.value;

    if (!email || !password) {
        showToast("Enter Email and Password");
        return;
    }

    let roomCode = "";
    if (role === "Teacher") {
        roomCode = document.getElementById("loginRoomCode").value.trim().toUpperCase();
        if (!roomCode) {
            showToast("Enter Room Code");
            return;
        }
    }

    signInBtn.disabled = true;
    signInBtn.innerText = "Processing...";

    localStorage.removeItem("adhyora_role");
    localStorage.removeItem("adhyora_college");
    localStorage.removeItem("adhyora_roll");
    localStorage.removeItem("adhyora_roomcode");
    sessionStorage.clear(); // Ensure clean slate

    try {
        if (role === "Teacher") {
            const secureID = "TEACHER_" + roomCode;
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", secureID);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists()) {
                showToast("Invalid Room Code.");
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 🚨 THE FIX: Lost Verification Email Auto-Resend
        if (!user.emailVerified) {
            showToast("Email not verified! Sending a fresh link to your inbox...");
            try {
                await sendEmailVerification(user);
            } catch(e) {
                console.warn("Rate limited on verification emails");
            }
            await signOut(auth);
            document.getElementById("loginPassword").value = "";
            resetSignInBtn();
            return;
        }

        // Reset the brute force counter on successful login
        loginFailedAttempts = 0; 

        // 🚨 THE DEFERRED PROFILE CREATION HANDLER CALL
        if (user.displayName && user.displayName.startsWith("{")) {
            showToast("Finalizing verified profile setup...");
            await handleFirstTimeVerifiedLogin(user, role, email);
        }

        // 🚨 ROLE-BASED VERIFICATION & ROUTING
        if (role === "Student") {
            showToast("Verifying Student Access...");

            let studentSnap = null;
            let rollNo = "";
            
            try {
                const studentsRef = collection(db, "colleges", selectedCollegeID, "students");
                const q = query(studentsRef, where("userID", "==", user.uid), limit(1));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const studentDoc = querySnapshot.docs[0];
                    studentSnap = studentDoc;
                    rollNo = studentDoc.id; 
                }
            } catch (e) {
                console.error("Database query failed", e);
            }

            if (!studentSnap || !studentSnap.exists()) {
                showToast("Student profile not found in this college.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const studentData = studentSnap.data();
            const status = studentData.status || "Approved";
            
            if (status === "Declined" || status === "Banned") {
                showToast(`Access Denied: Account ${status} by Principal.`);
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            if (studentData.email?.toLowerCase() !== email.toLowerCase()) {
                showToast("Security Check Failed: Email mismatch.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            showToast("Login Successful!");
            localStorage.setItem("adhyora_role", "Student");
            localStorage.setItem("adhyora_college", selectedCollegeID);
            localStorage.setItem("adhyora_roll", rollNo);
            window.location.href = `studentDashboard.html?college=${selectedCollegeID}&uid=${user.uid}&roll=${rollNo}`;
        }

        else if (role === "Teacher") {
            showToast("Verifying Teacher Access...");

            const teacherRef = doc(db, "colleges", selectedCollegeID, "teachers", user.uid);
            const teacherSnap = await getDoc(teacherRef);

            if (!teacherSnap.exists()) {
                showToast("Teacher record not found in this college.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const teacherData = teacherSnap.data();

            if (teacherData.email?.toLowerCase() !== email.toLowerCase()) {
                showToast("Security Check Failed.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const status = teacherData.status || "Pending";

            if (status !== "Approved" && status !== "Pending") {
                showToast("Access Denied. Account Status: " + status);
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            showToast("Teacher Login Successful!");
            localStorage.setItem("adhyora_role", "Teacher");
            localStorage.setItem("adhyora_college", selectedCollegeID);
            localStorage.setItem("adhyora_roomcode", roomCode.toUpperCase());
            window.location.href = `teacherDashboard.html?college=${selectedCollegeID}&uid=${user.uid}`;
        }

        else if (role === "Principal") {
            showToast("Verifying Principal Access...");

            const principalRef = doc(db, "colleges", selectedCollegeID, "principals", user.uid);
            const principalSnap = await getDoc(principalRef);

            if (!principalSnap.exists()) {
                showToast("Access Denied: This account is not registered as Principal.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const principalData = principalSnap.data();

            if (principalData.email?.toLowerCase() !== email.toLowerCase()) {
                showToast("Security Check Failed.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            if (principalData.subRole === "Staff") {
                showToast("Staff must request a 1-time access code to log in via App.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            showToast("Principal Login Successful!");
            localStorage.setItem("adhyora_role", "Principal");
            localStorage.setItem("adhyora_college", selectedCollegeID);
            window.location.href = `principalDashboard.html?college=${selectedCollegeID}`;
        }

        else if (role === "Accountant") {
            showToast("Verifying Accountant Access...");

            const accountantRef = doc(db, "colleges", selectedCollegeID, "accountants", user.uid);
            const accountantSnap = await getDoc(accountantRef);

            if (!accountantSnap.exists()) {
                showToast("Accountant record not found in this college.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const accountantData = accountantSnap.data();

            if (accountantData.email?.toLowerCase() !== email.toLowerCase()) {
                showToast("Security Check Failed.");
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            const status = accountantData.status || "Pending";

            if (status === "Banned" || status === "Declined") {
                showToast("Access Denied. Account Status: " + status);
                sessionStorage.clear();
                await signOut(auth);
                document.getElementById("loginPassword").value = "";
                resetSignInBtn();
                return;
            }

            showToast("Accountant Login Successful!");
            localStorage.setItem("adhyora_role", "Accountant");
            localStorage.setItem("adhyora_college", selectedCollegeID);
            window.location.href = `accountantDashboard.html?college=${selectedCollegeID}&uid=${user.uid}`;
        }
        
    } catch (error) {
        document.getElementById("loginPassword").value = "";
        
        // 🚨 THE FIX: Brute Force UX Defense
        if (error.code === 'auth/invalid-credential') {
            loginFailedAttempts++;
            if (loginFailedAttempts >= 5) {
                showToast("Too many failed attempts. Auto-sending reset email...");
                try {
                    await sendPasswordResetEmail(auth, email);
                } catch(e) {}
                loginFailedAttempts = 0; 
            } else {
                showToast(`Invalid password. ${5 - loginFailedAttempts} attempts remaining.`);
            }
        } 
        else if (error.code === 'auth/too-many-requests') {
            showToast("Account temporarily locked due to many failed attempts. Try again later.");
        }
        else {
            showToast(getErrorMessage(error.code) || error.message);
        }
        
        resetSignInBtn();
    }
});

function resetSignInBtn() {
    signInBtn.disabled = false;
    signInBtn.innerText = "SignIn";
}

function isEmailValid(email) {
    const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicRegex.test(email)) return false;

    const domain = email.split('@')[1].toLowerCase();
    const blockedDomains = ["gmai.com", "gmail.co", "gmail.con", "yaho.com", "yahoo.co", "outlok.com", "hormail.com"];
    
    if (blockedDomains.includes(domain)) return false;
    return true;
}

// --- 4. REGISTRATION LOGIC ---
registerBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const role = roleDropdown.value;
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();

    if (!isEmailValid(email)) {
        showToast("Please enter a valid email address.");
        return;
    }
    
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regConfirmPassword").value;
    const rollNo = document.getElementById("regRollNo").value.trim().toUpperCase();
    const roomCode = document.getElementById("regRoomCode").value.trim().toUpperCase(); 

    if (!name || !email || !password) {
        showToast("Fill all required fields");
        return;
    }
    if (role === "Student" && !rollNo) {
        showToast("Roll Number is required for students");
        return;
    }
    if (role === "Teacher" && !roomCode) {
        showToast("Room Code is required for teachers");
        return;
    }
    if (password !== confirm) {
        showToast("Passwords do not match");
        return;
    }

    registerBtn.disabled = true;
    registerBtn.innerText = "Verifying...";

    try {
        // 🚨 1. Pre-Registration Verification Checks
        if (role === "Principal") {
            const lockRef = doc(db, "colleges", selectedCollegeID, "public_lookup", "PRINCIPAL_LOCK");
            const lockSnap = await getDoc(lockRef);
            if (lockSnap.exists()) {
                showToast("Registration Blocked: A Principal is already registered for this college.");
                resetRegBtn();
                return;
            }
        } 
        else if (role === "Teacher") {
            const secureID = "TEACHER_" + roomCode;
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", secureID);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists() || !(lookupSnap.data().deptID || lookupSnap.data().departmentID)) {
                showToast("Verification Failed. Invalid Room Code or missing Department.");
                resetRegBtn();
                return;
            }
        }
        else if (role === "Student") {
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", rollNo);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists()) {
                showToast(`Verification Failed. Roll No: ${rollNo} not found.`);
                resetRegBtn();
                return;
            }

            const dbName = lookupSnap.data().name || "";
            const normalizedInputName = name.replace(/\s/g, "").toLowerCase();
            const normalizedDbName = dbName.replace(/\s/g, "").toLowerCase();

            if (normalizedInputName !== normalizedDbName) {
                showToast("Verification Failed: Name does not match Roll Number.");
                resetRegBtn();
                return;
            }
        }

        // 🚨 2. Create Auth Profile
        registerBtn.innerText = "Creating Account...";
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        registerBtn.innerText = "Sending Verification...";
        await sendEmailVerification(user);

        // 🚨 3. Hide Payload in Display Name (ZERO FIRESTORE WRITES YET)
        let payload = { r: role, n: name, c: selectedCollegeID };
        
        if (role === "Teacher") {
            const secureID = "TEACHER_" + roomCode;
            const lookupSnap = await getDoc(doc(db, "colleges", selectedCollegeID, "public_lookup", secureID));
            payload.ext = lookupSnap.data().deptID || lookupSnap.data().departmentID;
        } 
        else if (role === "Student") {
            payload.ext = rollNo;
        }

        await updateProfile(user, { displayName: JSON.stringify(payload) });

        // 🚨 4. Log out and Redirect
        await signOut(auth);
        showToast("Success! A verification link has been sent to your email.");
        window.switchPanel('signInPanel');

    } catch (error) {
        showToast(getErrorMessage(error.code));
    } finally {
        resetRegBtn();
    }
});

// --- 5. FORGOT PASSWORD LOGIC ---
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

resetPasswordBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    
    const emailInput = document.getElementById("forgotEmail").value.trim().toLowerCase();

    if (!emailInput) {
        showToast("Enter your email address.");
        return;
    }

    resetPasswordBtn.disabled = true;
    resetPasswordBtn.innerText = "Sending...";
    showToast("Sending reset email..."); 

    try {
        await sendPasswordResetEmail(auth, emailInput);
        
        showToast("Reset email sent! Check your inbox.");
        document.getElementById("forgotEmail").value = ""; 
        window.switchPanel('signInPanel'); 
        
    } catch (error) {
        let errorMessage = "An error occurred.";
        if (error.code === 'auth/user-not-found') errorMessage = "No account found with this email.";
        else if (error.code === 'auth/invalid-email') errorMessage = "Invalid email format.";
        else errorMessage = error.message; 

        showToast("Error: " + errorMessage);
    } finally {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.innerText = "Send Reset Link";
    }
});

function resetRegBtn() {
    registerBtn.disabled = false;
    registerBtn.innerText = "Register";
}

function getErrorMessage(code) {
    switch (code) {
        case 'auth/email-already-in-use': return "Email already registered.";
        case 'auth/weak-password': return "Password too weak (Min 6 chars).";
        case 'auth/invalid-credential': return "Invalid email or password.";
        case 'auth/user-not-found': return "No account found.";
        default: return "An error occurred. Try again.";
    }
}


// ==========================================
// BACKGROUND PARTICLES & GLITCH EFFECTS
// ==========================================

tsParticles.load("tsparticles", {
    fpsLimit: 60, 
    detectRetina: false, 
    particles: {
        number: { value: 50, density: { enable: true, area: 800 } }, 
        color: { value: "#2ecc71" }, 
        links: { 
            enable: true, 
            distance: 110, 
            color: "#2ecc71", 
            opacity: 0.3, 
            width: 1 
        },
        move: { enable: true, speed: 1.2, outModes: { default: "out" } }, 
        opacity: { value: 0.4 },
        size: { value: { min: 1, max: 2 } } 
    },
    interactivity: {
        events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" } },
        modes: { grab: { distance: 150, links: { opacity: 0.6 } }, push: { quantity: 4 } }
    },
    background: { color: "transparent" } 
});

const TARGET_TEXT = "ADHYORA";
const DECODE_SPEED = 6; 
const CHAOS_CHARS = "अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहABCDEFGHIJKLMNOPQRSTUVWXYZ01010101#@%&*";

const elMain = document.getElementById('text-main');
const elRed = document.getElementById('text-red');
const elBlue = document.getElementById('text-blue');

let frame = 0;
let lockIndex = 0;
let isComplete = false;

function updateText() {
    if (isComplete) return;
    
    if (frame % 3 === 0) {
        let output = "";
        for (let i = 0; i < TARGET_TEXT.length; i++) {
            output += (i < lockIndex) ? TARGET_TEXT[i] : CHAOS_CHARS[Math.floor(Math.random() * CHAOS_CHARS.length)];
        }
        
        elMain.innerText = output;
        elRed.innerText = output;
        elBlue.innerText = output;
    }

    if (frame % DECODE_SPEED === 0) {
        lockIndex++;
        if (lockIndex > TARGET_TEXT.length) {
            isComplete = true;
            elMain.innerText = TARGET_TEXT;
            elRed.innerText = TARGET_TEXT;
            elBlue.innerText = TARGET_TEXT;
            
            elRed.classList.add('css-glitch-active');
            elBlue.classList.add('css-glitch-active');
            return; 
        }
    }
    
    frame++;
    requestAnimationFrame(updateText);
}

setTimeout(updateText, 500);

// ==========================================
// CUSTOM DROPDOWN BUILDER 
// ==========================================
function buildCustomDropdown(selectId) {
    let select = document.getElementById(selectId);
    if (!select || select.style.display === 'none') return;

    let customUI = document.createElement('div');
    customUI.className = 'custom-select-wrapper';

    let trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    let currentText = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : 'Select...';
    trigger.innerHTML = `<span>${currentText}</span><span style="font-size:10px; color:#2ecc71;">▼</span>`;

    let optionsList = document.createElement('div');
    optionsList.className = 'custom-options';

    Array.from(select.options).forEach((opt, index) => {
        if (index === 0 && opt.disabled) return; 

        let item = document.createElement('div');
        item.className = 'custom-option';
        if (opt.disabled) item.classList.add('disabled');
        item.innerText = opt.text;

        item.addEventListener('click', () => {
            if (opt.disabled) return;
            select.value = opt.value;
            trigger.querySelector('span').innerText = opt.text;
            customUI.classList.remove('open');
            select.dispatchEvent(new Event('change'));
        });
        optionsList.appendChild(item);
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-wrapper').forEach(el => {
            if(el !== customUI) el.classList.remove('open');
        });
        customUI.classList.toggle('open');
    });

    customUI.appendChild(trigger);
    customUI.appendChild(optionsList);
    
    select.parentNode.insertBefore(customUI, select);
    select.style.display = 'none';
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(el => el.classList.remove('open'));
});

buildCustomDropdown('roleDropdown');
