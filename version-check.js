import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getRemoteConfig, fetchAndActivate, getString } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
};

const app = initializeApp(firebaseConfig);
const remoteConfig = getRemoteConfig(app);

remoteConfig.settings = {
  minimumFetchIntervalMillis: 0
};

// ==========================================
// 🚨 CHANGE ONLY THIS VERSION
// ==========================================
const LOCAL_VERSION = "1.0.56";

// ==========================================
// SHOW VERSION TEXT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const versionDisplayElement = document.getElementById("versionText");
  if (versionDisplayElement) {
    versionDisplayElement.innerText = `Version ${LOCAL_VERSION} (Web)`;
  }
});

// ==========================================
// LOAD CORRECT PAGE SCRIPT
// ==========================================
// 🚨 This now accepts a targetVersion parameter to bypass cache
function loadMainApp(targetVersion) {
  const versionToLoad = targetVersion || LOCAL_VERSION;
  const currentPage = window.location.pathname.toLowerCase();

  let appFile = "app.js";

  if (currentPage.includes("index")) {
    appFile = "app.js";
  } else if (currentPage.includes("student")) {
    appFile = "dashboardApp.js";
  } else if (currentPage.includes("teacher")) {
    appFile = "teacherApp.js";
  } else if (currentPage.includes("principal")) {
    appFile = "principalApp.js";
  }

  const appScript = document.createElement("script");
  appScript.type = "module";
  // 🚨 Inject the version into the URL so the browser downloads a fresh file
  appScript.src = `${appFile}?v=${versionToLoad}`;

  document.body.appendChild(appScript);
}

// ==========================================
// CHECK FIREBASE VERSION
// ==========================================
async function enforceVersionCheck() {
  try {
    await fetchAndActivate(remoteConfig);
    const remoteVersion = getString(remoteConfig, "web_version");

    console.log("LOCAL:", LOCAL_VERSION, "| REMOTE:", remoteVersion);

    // ==========================================
    // NEW VERSION DETECTED
    // ==========================================
    if (remoteVersion && remoteVersion !== LOCAL_VERSION) {
      console.log("🚨 NEW VERSION DETECTED!");

      // 1. Remove Service Workers (Kills background caching)
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // 2. Clear Standard PWA Caches
      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }

      // 3. Failsafe: Prevent infinite reload loops
      let lastAttempt = sessionStorage.getItem("update_attempt_" + remoteVersion);
      if (lastAttempt) {
        console.warn("HTML cache stubbornly persists. Bypassing and injecting new script directly.");
        // We load the new script immediately without reloading the page again
        loadMainApp(remoteVersion); 
        return;
      }
      
      sessionStorage.setItem("update_attempt_" + remoteVersion, "true");

      // 4. Force Hard Refresh WITH a Cache Buster in the URL
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("app_version", remoteVersion);
      
      // location.replace prevents the user from going "back" into the update loop
      window.location.replace(currentUrl.toString());
      return;
    }

    // ==========================================
    // APP IS UP TO DATE
    // ==========================================
    loadMainApp(LOCAL_VERSION);

  } catch (error) {
    console.error("Version Check Failed:", error);
    // LOAD APP EVEN IF REMOTE CONFIG FAILS (Fallback)
    loadMainApp(LOCAL_VERSION);
  }
}

// START
enforceVersionCheck();

// Note: If you have Service Worker/Notification click listeners at the bottom of this file, paste them right below this line!
