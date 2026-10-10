/**
 * auth.js - Authentication, Supabase SSO JWT & Role-Based Access Control (RBAC)
 */

const SESSION_KEY = "CAMPAIGN_SALES_CURRENT_SESSION";

class AuthManager {
  constructor() {
    this.currentUser = this.getSession();
  }

  getSession() {
    try {
      const data = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  // Parse JWT token Base64 JSON payload (Supabase / OAuth JWT)
  parseJwt(token) {
    if (!token || typeof token !== "string") return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("Failed to parse JWT token:", e);
      return null;
    }
  }

  // Handle SSO Invocation via Portal (URL Params / Hash Fragment)
  checkAndProcessPortalSSO() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash);

      const token = urlParams.get("access_token") || 
                    urlParams.get("token") || 
                    urlParams.get("jwt") || 
                    urlParams.get("sso_token") || 
                    hashParams.get("access_token") || 
                    hashParams.get("token");

      const urlPortalUrl = urlParams.get("portal_url") || 
                           urlParams.get("redirect_url") || 
                           urlParams.get("return_url") || 
                           hashParams.get("portal_url") || 
                           hashParams.get("redirect_url");

      if (urlPortalUrl) {
        sessionStorage.setItem("PORTAL_RETURN_URL", urlPortalUrl);
      }

      const portalUrl = urlPortalUrl || sessionStorage.getItem("PORTAL_RETURN_URL") || (document.referrer ? new URL(document.referrer).origin : null);

      // If no token in URL and no explicit portal URL params in query string, skip SSO attempt so refresh maintains current session
      const isExplicitPortalUrlCall = Boolean(token || urlPortalUrl || urlParams.has("portal") || urlParams.has("sso"));
      if (!isExplicitPortalUrlCall && !token) {
        return { isPortal: false, success: false };
      }

      const isPortalCall = isExplicitPortalUrlCall;

      // If token exists, parse and validate JWT
      if (token) {
        const payload = this.parseJwt(token);
        const nowSec = Math.floor(Date.now() / 1000);

        if (!payload || (payload.exp && payload.exp < nowSec)) {
          return this.handleSSOFailure(portalUrl, isPortalCall, "Token JWT SSO tidak valid atau sudah kadaluwarsa.");
        }

        const meta = payload.user_metadata || payload.raw_user_meta_data || {};
        const appMeta = payload.app_metadata || {};

        const username = meta.username || payload.email || meta.email || payload.sub || "sso_user";
        const fullname = meta.fullname || meta.full_name || meta.name || username;
        
        let role = (meta.role || appMeta.role || payload.role || "SALESMAN").toUpperCase().replace(/\s+/g, "_");
        if (!["SUPER_ADMIN", "MANAGER", "SALESMAN", "ADMIN_SALESMAN", "TOKO"].includes(role)) {
          role = "SALESMAN";
        }

        const storeId = meta.store_id || meta.storeId || null;
        const storeIds = meta.store_ids || meta.storeIds || (storeId ? [storeId] : []);

        let dbUser = window.db ? window.db.getUserByUsername(username) : null;
        if (!dbUser) {
          return this.handleSSOFailure(portalUrl, isPortalCall, "Akses Ditolak: User Anda tidak terdaftar di sistem Campaign ini.");
        }

        if (dbUser && dbUser.isActive === false) {
          return this.handleSSOFailure(portalUrl, isPortalCall, "Akun SSO ini telah dinonaktifkan di sistem.");
        }

        const sessionData = {
          id: dbUser ? dbUser.id : "sso_" + (payload.sub || Date.now()),
          username: username,
          fullname: fullname,
          role: role,
          storeId: storeId,
          storeIds: storeIds,
          isSSO: true,
          token: token,
          portalUrl: portalUrl || null,
          loginAt: new Date().toISOString()
        };

        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        } catch (e) {}

        this.currentUser = sessionData;

        // Clean token from URL bar
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}

        return { isPortal: true, success: true, user: sessionData };
      }

      // If invoked from portal without token
      return this.handleSSOFailure(portalUrl, isPortalCall, "Akses via portal memerlukan token SSO JWT yang valid.");

    } catch (err) {
      console.error("SSO processing error:", err);
      const returnUrl = sessionStorage.getItem("PORTAL_RETURN_URL");
      return this.handleSSOFailure(returnUrl, true, "Terjadi kesalahan saat memproses token SSO.");
    }
  }

  handleSSOFailure(portalUrl, isPortalCall, reasonMsg) {
    const targetUrl = portalUrl || sessionStorage.getItem("PORTAL_RETURN_URL");
    console.warn("SSO Login Failed:", reasonMsg, "Target Portal URL:", targetUrl);

    if (isPortalCall && targetUrl) {
      alert(`${reasonMsg}\n\nAnda akan dikembalikan ke portal.`);
      window.location.href = targetUrl;
      return { isPortal: true, success: false, redirected: true };
    }

    return { isPortal: isPortalCall, success: false, redirected: false, message: reasonMsg };
  }

  login(username, password) {
    try {
      if (!username || !password) {
        return { success: false, message: "Silakan masukkan username dan password." };
      }

      const exactUsername = String(username).trim();
      const user = window.db.getUserByUsername(exactUsername);
      if (!user || String(user.username).trim() !== exactUsername) {
        return { success: false, message: "Username atau password salah." };
      }
      if (user.isActive === false) {
        return { success: false, message: "Akun ini telah dinonaktifkan oleh Admin." };
      }

      const actualPassword = String(user.passwordHash || user.password || "").trim();
      if (actualPassword !== String(password).trim()) {
        return { success: false, message: "Username atau password salah." };
      }

      const sessionData = {
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        role: user.role,
        storeId: user.storeId || null,
        loginAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      } catch (e) {}

      this.currentUser = sessionData;
      return { success: true, user: sessionData };
    } catch (err) {
      console.error("Login exception:", err);
      return { success: false, message: "Terjadi kesalahan saat login: " + err.message };
    }
  }

  logout() {
    let portalUrl = null;
    if (this.currentUser && this.currentUser.portalUrl) {
      portalUrl = this.currentUser.portalUrl;
    } else {
      portalUrl = sessionStorage.getItem("PORTAL_RETURN_URL");
    }

    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("PORTAL_RETURN_URL");
    } catch (e) {}
    this.currentUser = null;
    
    if (portalUrl) {
      window.location.href = portalUrl;
    } else {
      window.location.reload();
    }
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  isSSO() {
    return Boolean(this.currentUser && this.currentUser.isSSO);
  }

  getCurrentUser() {
    if (this.currentUser && window.db && typeof window.db.getUserByUsername === "function") {
      const dbUser = window.db.getUserByUsername(this.currentUser.username);
      if (dbUser && dbUser.role) {
        this.currentUser.role = dbUser.role;
        if (dbUser.fullname) this.currentUser.fullname = dbUser.fullname;
        if (dbUser.storeId !== undefined) this.currentUser.storeId = dbUser.storeId;
      }
    }
    return this.currentUser;
  }

  hasRole(allowedRoles) {
    if (!this.currentUser) return false;
    const userRole = String(this.currentUser.role || "").toUpperCase().replace(/\s+/g, "_");
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.map(r => String(r).toUpperCase().replace(/\s+/g, "_")).includes(userRole);
    }
    return userRole === String(allowedRoles).toUpperCase().replace(/\s+/g, "_");
  }

  // Role Checks
  isSuperAdmin() {
    return this.hasRole("SUPER_ADMIN");
  }

  isManagerOrAdmin() {
    return this.hasRole(["SUPER_ADMIN", "MANAGER"]);
  }

  isAdminSalesman() {
    return this.hasRole("ADMIN_SALESMAN");
  }

  isSalesman() {
    return this.hasRole("SALESMAN");
  }

  isToko() {
    return this.hasRole("TOKO");
  }
}

window.auth = new AuthManager();



