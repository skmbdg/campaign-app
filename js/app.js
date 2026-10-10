/**
 * app.js - Main Application Logic, UI Router & Event Handling
 */

document.addEventListener("DOMContentLoaded", () => {
  initApp();

  // Integrasi fitur tombol back fisik HP (Modal & Anti-Exit)
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "app";
  }
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    
    if (hash === "#app") {
      // User menekan back dari modal, kembali ke dashboard/app utama
      if (typeof closeAllModals === "function") closeAllModals();
    } else if (hash === "" || hash === "#") {
      // User menekan back dari #app, mencoba keluar dari aplikasi
      if (window.auth && window.auth.isLoggedIn()) {
        let portalUrl = null;
        if (window.auth.currentUser && window.auth.currentUser.portalUrl) {
          portalUrl = window.auth.currentUser.portalUrl;
        } else {
          portalUrl = sessionStorage.getItem("PORTAL_RETURN_URL");
        }
        
        if (portalUrl) {
           // Langsung alihkan ke portal tanpa menambah history baru agar tidak blank
           window.location.replace(portalUrl);
        } else {
           // Tahan! Kembalikan ke #app jika tidak ada portal
           window.location.hash = "app";
           showToast("Silakan gunakan tombol Logout jika ingin keluar.", "warning");
        }
      }
    } else if (hash.startsWith("#modal-")) {
      const activeModalId = hash.substring(1);
      document.querySelectorAll(".modal").forEach(m => {
        if (m.id === activeModalId) {
          m.classList.add("active");
        } else if (activeModalId === "modal-sku-breakdown" && m.id === "modal-campaign-detail") {
          // Biarkan modal-campaign-detail tetap active sebagai background untuk sku-breakdown
          m.classList.add("active");
        } else {
          m.classList.remove("active");
        }
      });
    } else {
      window.location.hash = "app";
    }
  });
});

async function loadCloudSnapshotsFromSupabase() {
  try {
    let config = null;
    if (window.db && typeof window.db.getSupabaseConfig === "function") {
      config = window.db.getSupabaseConfig();
    }
    if (!config) {
      const cfgStr = localStorage.getItem("CAMPAIGN_SUPABASE_CONFIG");
      if (cfgStr) {
        try { config = JSON.parse(cfgStr); } catch(e){}
      }
    }
    if (!config || !config.url || !config.anonKey) return false;

    const cleanUrl = config.url.replace(/\/+$/, "");
    const limit = 1000;
    let offset = 0;
    let allRows = [];
    let hasMore = true;

    while (hasMore) {
      const endpoint = `${cleanUrl}/rest/v1/${config.tableName || 'dashboard_snapshots'}?select=*&limit=${limit}&offset=${offset}`;
      const res = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        headers: {
          "apikey": config.anonKey,
          "Authorization": `Bearer ${config.anonKey}`,
          "Content-Type": "application/json"
        }
      });
      if (!res.ok) {
        if (allRows.length > 0) break; // if we got some, just use them
        return false;
      }
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        allRows.push(...rows);
        offset += rows.length;
        if (rows.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    if (allRows.length > 0 && window.db) {
      window.db.saveCloudSnapshotsToLocal(allRows);
      showToast(`Terhubung ke Supabase Cloud: Berhasil mengunduh & memulihkan ${allRows.length} record snapshot`, "info");
      if (typeof updateUserBadge === "function") updateUserBadge();
      if (typeof applyRolePermissions === "function") applyRolePermissions();
      if (typeof renderUsers === "function") renderUsers();
      if (typeof renderMasterData === "function") renderMasterData();
      if (typeof renderDashboard === "function") renderDashboard();
      return true;
    }
  } catch (err) {
    console.warn("Auto load Supabase Cloud snapshots error:", err);
  }
  return false;
}


async function initApp() {
  // Check if invoked via Portal SSO JWT token or portal parameter
  const ssoResult = window.auth.checkAndProcessPortalSSO();
  if (ssoResult.redirected) {
    // Automatically redirected back to portal on SSO failure
    return;
  }

  // Load cloud snapshots & user accounts from Supabase Cloud at startup
  await loadCloudSnapshotsFromSupabase();

  // Check auth session
  const currentUser = window.auth.getCurrentUser();
  if (!currentUser || !window.auth.isLoggedIn()) {
    showAuthOverlay(true);
  } else {
    // Validate if current session user is active
    const dbUser = window.db ? window.db.getUserByUsername(currentUser.username) : currentUser;
    if (dbUser && dbUser.isActive === false) {
      showToast("Akun Anda telah dinonaktifkan.", "danger");
      window.auth.logout();
      return;
    }
    showAuthOverlay(false);
    updateUserBadge();
    applyRolePermissions();

    navigateTo("dashboard");
  }

  setupEventListeners();
}

function showAuthOverlay(show) {
  const overlay = document.getElementById("auth-overlay");
  const loadingState = document.getElementById("auth-loading-state");
  const loginForm = document.getElementById("auth-login-form");

  if (show) {
    overlay.style.display = "flex";
    if (loadingState) loadingState.style.display = "none";
    if (loginForm) loginForm.style.display = "block";
  } else {
    overlay.style.display = "none";
  }
}

function toggleLoginPasswordVisibility() {
  const pwdInput = document.getElementById("login-password");
  const pwdIcon = document.getElementById("icon-login-pwd");
  if (!pwdInput || !pwdIcon) return;

  if (pwdInput.type === "password") {
    pwdInput.type = "text";
    pwdIcon.className = "fa-solid fa-eye-slash";
    pwdIcon.style.color = "#0284c7";
  } else {
    pwdInput.type = "password";
    pwdIcon.className = "fa-solid fa-eye";
    pwdIcon.style.color = "#64748b";
  }
}

function updateUserBadge() {
  const user = window.auth.getCurrentUser();
  if (!user) return;

  document.getElementById("user-display-name").textContent = user.fullname;
  document.getElementById("user-display-role").textContent = user.role.replace("_", " ");
  document.getElementById("user-avatar-initial").textContent = user.fullname.charAt(0).toUpperCase();
}

function applyRolePermissions() {
  const user = window.auth.getCurrentUser();
  if (!user) return;

  const rawRole = String(user.role || "").toUpperCase().trim().replace(/[\s\-]+/g, "_");
  const role = (rawRole === "ADMIN_SALESMAN" || rawRole === "ADMINSALESMAN" || rawRole === "ADMIN_SALES") ? "ADMIN_SALESMAN" : rawRole;
  
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isManagerOrAdmin = role === "SUPER_ADMIN" || role === "MANAGER";
  const isAdminSalesman = role === "ADMIN_SALESMAN";
  const isSalesman = role === "SALESMAN";
  const canUploadSales = isManagerOrAdmin || isAdminSalesman;

  document.querySelectorAll(".role-admin-and-salesadmin").forEach(el => {
    el.style.display = (isSuperAdmin || isAdminSalesman) ? "" : "none";
  });

  document.querySelectorAll(".role-admin").forEach(el => {
    el.style.display = isSuperAdmin ? "" : "none";
  });

  document.querySelectorAll(".role-admin-manager").forEach(el => {
      el.style.display = isManagerOrAdmin ? "" : "none";
    });

    document.querySelectorAll(".hide-for-salesman").forEach(el => {
      el.style.display = isSalesman ? "none" : "";
    });

    document.querySelectorAll(".hide-for-admin-salesman").forEach(el => {
      if (isAdminSalesman) {
        el.style.display = "none";
      } else if (isSalesman) {
        if (el.classList.contains("hide-for-salesman")) el.style.display = "none"; else el.style.display = "";
      } else {
        el.style.display = "";
      }
    });

  document.querySelectorAll(".role-sales-upload").forEach(el => {
    el.style.display = canUploadSales ? "" : "none";
  });

  document.querySelectorAll(".role-salesman-calc").forEach(el => {
    el.style.display = (isManagerOrAdmin || isAdminSalesman || isSalesman) ? "" : "none";
  });
}

function navigateTo(viewName) {
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.getAttribute("data-view") === viewName);
  });

  document.querySelectorAll(".view-section").forEach(sec => {
    sec.classList.remove("active");
  });

  const targetSec = document.getElementById("view-" + viewName);
  if (targetSec) {
    targetSec.classList.add("active");
  }

  // Update Top Bar Title
  const titles = {
    dashboard: "Dashboard Utama",
    achievements: "Pencapaian & Status Reward Toko",
    upload: "Upload Data Penjualan",
    master: "Master Data Toko & Produk",
    campaigns: "Pengaturan Master Program Campaign",
    users: "Daftar User & Hak Akses (RBAC)",
    backup: "Backup & Restore Database"
  };
  document.getElementById("page-title").textContent = titles[viewName] || "Dashboard";

  // Trigger View Refresh
  renderCurrentView(viewName);
}

function renderCurrentView(viewName) {
  switch (viewName) {
    case "dashboard":
      renderDashboard();
      break;
    case "achievements":
      renderAchievements();
      break;
    case "upload":
      renderSalesHistory();
      break;
    case "master":
      renderMasterData();
      break;
    case "campaigns":
      renderCampaigns();
      break;
    case "users":
      renderUsers();
      break;
  }
}

function getUserAssignedStoreIds(user) {
  if (!user) return [];
  let storeIds = [];
  if (Array.isArray(user.storeIds) && user.storeIds.length > 0) {
    storeIds.push(...user.storeIds);
  }
  if (user.storeId && !storeIds.includes(user.storeId)) {
    storeIds.push(user.storeId);
  }
  const stores = window.db.getStores();
  const uFull = String(user.fullname || "").trim().toLowerCase();
  const uName = String(user.username || "").trim().toLowerCase();

  stores.forEach(s => {
    const sSalesman = String(s.salesmanName || "").trim().toLowerCase();
    const isMatch = (s.userId === user.id) ||
                    (s.salesmanId === user.id) ||
                    (sSalesman && (sSalesman === uFull || sSalesman === uName || uFull.includes(sSalesman) || sSalesman.includes(uName)));

    if (isMatch && !storeIds.includes(s.id)) {
      storeIds.push(s.id);
    }
  });
  return storeIds;
}

function toggleCampaignSummaryPanel() {
  const panel = document.getElementById("dashboard-campaign-summary-panel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  panel.style.display = isHidden ? "block" : "none";
}

function populateDashMonthFilter() {
  const sel = document.getElementById("dash-month-filter");
  if (!sel) return;

  let currentVal = sel.value; if (!currentVal) currentVal = localStorage.getItem('dashLastMonth') || '';
  const currentMonthStr = new Date().toISOString().substring(0, 7); // e.g. "2026-10"

  const monthSet = new Set();
  monthSet.add(currentMonthStr);

  // Add months from active campaigns
  const campaigns = window.db.getCampaigns() || [];
  campaigns.forEach(c => {
    if (c.startDate) {
      const m = normalizeDateForEngine(c.startDate).substring(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
    if (c.endDate) {
      const m = normalizeDateForEngine(c.endDate).substring(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
  });

  // Add months from sales transactions via cached method
  const salesMonths = (window.db && typeof window.db.getAvailableSalesMonths === "function")
    ? window.db.getAvailableSalesMonths()
    : [];
  salesMonths.forEach(m => monthSet.add(m));

  const sortedMonths = Array.from(monthSet).sort().reverse();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  const existingValues = Array.from(sel.options).map(opt => opt.value).join(",");
  const newValues = [...sortedMonths, "ALL"].join(",");

  if (existingValues !== newValues) {
    sel.innerHTML = "";

    sortedMonths.forEach(mStr => {
      const parts = mStr.split("-");
      if (parts.length === 2) {
        const yyyy = parts[0];
        const mmIdx = parseInt(parts[1], 10) - 1;
        const mName = monthNames[mmIdx] || parts[1];
        const isCurrent = (mStr === currentMonthStr);
        
        const opt = document.createElement("option");
        opt.value = mStr;
        opt.textContent = `Cut-off s/d: ${mName} ${yyyy}${isCurrent ? ' (Bulan Berjalan)' : ''}`; 
        sel.appendChild(opt);
      }
    });

    const optAll = document.createElement("option");
    optAll.value = "ALL";
    optAll.textContent = "Hitung Seluruh Periode (Tanpa Cut-off)";
    sel.appendChild(optAll);
  }

  if (currentVal && (sortedMonths.includes(currentVal) || currentVal === "ALL")) {
    sel.value = currentVal;
    } else if (sortedMonths.includes(currentMonthStr)) {
    sel.value = currentMonthStr;
  } else if (sortedMonths.length > 0) {
    sel.value = sortedMonths[0];
  }
}

// --- RENDER DASHBOARD ---
function renderDashboard() {
  populateDashMonthFilter();
  
  setTimeout(() => {
    const sales = window.db.getSales() || [];
    let maxDate = "-";
    if (sales.length > 0) {
      let maxD = sales[0].transactionDate;
      for (let i = 1; i < sales.length; i++) {
        if (sales[i].transactionDate > maxD) maxD = sales[i].transactionDate;
      }
      if (maxD) {
        // Format to DD/MM/YYYY if possible
        const parts = maxD.split("-");
        if (parts.length === 3) {
          maxDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          maxDate = maxD;
        }
      }
    }

    // Fallback: If phone is using dummy sales but has real cloud achievements, use cloud timestamp
    const allAchs = window.db.getAchievements() || [];
    if (allAchs.length > 0 && maxDate === "15/10/2026") {
       let latestCalc = "";
       allAchs.forEach(a => { if (a.calculatedAt && a.calculatedAt > latestCalc) latestCalc = a.calculatedAt; });
       if (latestCalc) {
         const d = new Date(latestCalc);
         maxDate = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + d.getFullYear();
         localStorage.setItem("lastSalesImportTime", latestCalc);
       }
    }
    const updateEl = document.getElementById("dash-latest-update");
      if (updateEl) {
        let timeStr = "";
        try {
          const t = localStorage.getItem("lastSalesImportTime");
          if (t) {
            const d = new Date(t);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            timeStr = ` Jam ${hh}:${mm}`;
          }
        } catch(e) {}
        updateEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Update LSO/PSO : <strong>${maxDate}${timeStr}</strong>`;
      }
  }, 0);

  const selectedMonth = document.getElementById("dash-month-filter")?.value || new Date().toISOString().substring(0, 7);
  if (selectedMonth) localStorage.setItem('dashLastMonth', selectedMonth);
  const activeCampaigns = window.db.getCampaigns().filter(c => isCampaignRunningInMonth(c, selectedMonth));

  const stores = window.db.getStores();

  // Populate campaign filter dropdown if available
  const campFilter = document.getElementById("dash-campaign-filter");
  if (campFilter) {
    const currentVal = campFilter.value || "ALL";
    campFilter.innerHTML = '<option value="ALL">-- Semua Program Campaign Active --</option>';
    activeCampaigns.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.campaignCode} - ${c.campaignName}`;
      campFilter.appendChild(opt);
    });
    if (activeCampaigns.some(c => c.id === currentVal)) {
      campFilter.value = currentVal;
    } else {
      campFilter.value = "ALL";
    }
  }

  const calcMode = document.getElementById("dash-calc-mode")?.value || "CUMULATIVE";    // Just read saved achievements from database instead of live calculation to prevent UI hang!
    let data = window.db.getSnapshotForPeriod(selectedMonth, calcMode) || [];

  // Filter stored achievements by active campaigns running in selectedMonth
  const activeCampaignIds = new Set(activeCampaigns.map(c => String(c.id)));
  if (activeCampaignIds.size > 0 && data.length > 0) {
    data = data.filter(a => activeCampaignIds.has(String(a.campaignId)));
  }

  // Filter by selected campaign if specified
  const selectedCmpId = campFilter ? campFilter.value : "ALL";
  if (selectedCmpId !== "ALL") {
    data = data.filter(a => String(a.campaignId) === String(selectedCmpId));
  }

  // Filter if user is TOKO or SALESMAN
  const currentUser = window.auth.getCurrentUser();
  const isRestrictedUser = currentUser && (currentUser.role === "TOKO" || currentUser.role === "SALESMAN");
  let assignedStoreIds = [];
  if (isRestrictedUser) {
    assignedStoreIds = getUserAssignedStoreIds(currentUser);
    data = data.filter(a => assignedStoreIds.includes(a.storeId));
  }

  // Filter by search keyword (Store Name, Store Code, Campaign Name, Campaign Code)
  const searchInput = document.getElementById("dash-search-input");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (searchTerm) {
    data = data.filter(a => {
      const sName = String(a.storeName || "").toLowerCase();
      const sCode = String(a.storeCode || "").toLowerCase();
      const cName = String(a.campaignName || "").toLowerCase();
      const cCode = String(a.campaignCode || "").toLowerCase();
      const salesman = String(a.salesmanName || "").toLowerCase();
      return sName.includes(searchTerm) || sCode.includes(searchTerm) || cName.includes(searchTerm) || cCode.includes(searchTerm) || salesman.includes(searchTerm);
    });
  }

  // Sort data alphabetically by Store Name (A-Z)
  data.sort((a, b) => String(a.storeName || "").localeCompare(String(b.storeName || ""), "id", { sensitivity: "base" }));

  // Render Campaign Summary Table for the filtered data
  const campaignGroupMap = {};
  data.forEach(item => {
    const cId = item.campaignId || "unknown";
    if (!campaignGroupMap[cId]) {
      campaignGroupMap[cId] = {
        campaignId: cId,
        campaignCode: item.campaignCode,
        campaignName: item.campaignName,
        totalStores: 0,
        achievedStores: 0,
        unachievedStores: 0,
        totalQty: 0,
        totalOmzet: 0,
        totalRewards: 0
      };
    }
    const cGrp = campaignGroupMap[cId];
    cGrp.totalStores++;
    if (item.matchedTierLevel > 0) {
      cGrp.achievedStores++;
    } else {
      cGrp.unachievedStores++;
    }
    cGrp.totalQty += item.totalQty;
    cGrp.totalOmzet += item.totalOmzet;
    cGrp.totalRewards += item.totalRewardValue;
  });

  const cGroupKeys = Object.keys(campaignGroupMap);
  const countBadgeEl = document.getElementById("summary-active-count");
  if (countBadgeEl) {
    countBadgeEl.textContent = cGroupKeys.length;
  }

  const summaryTbody = document.querySelector("#table-campaign-summary tbody");
  if (summaryTbody) {
    summaryTbody.innerHTML = "";
    if (cGroupKeys.length === 0) {
      summaryTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:15px;">Tidak ditemukan data program campaign yang sesuai dengan filter/pencarian saat ini.</td></tr>`;
    } else {
      cGroupKeys.forEach(cId => {
        const cGrp = campaignGroupMap[cId];
        const pctAchieved = cGrp.totalStores > 0 ? Math.round((cGrp.achievedStores / cGrp.totalStores) * 100) : 0;
        const progressColor = pctAchieved >= 50 ? '#16a34a' : '#f59e0b';
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><span class="badge badge-info"><i class="fa-solid fa-bullhorn"></i> ${cGrp.campaignCode}</span></td>
          <td><strong>${cGrp.campaignName}</strong></td>
          <td style="text-align:center;"><strong>${cGrp.totalStores}</strong> Toko</td>
          <td style="text-align:center;"><span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> ${cGrp.achievedStores} Toko</span></td>
          <td style="text-align:center;"><span class="badge ${cGrp.unachievedStores > 0 ? 'badge-danger' : 'badge-secondary'}"><i class="fa-solid fa-circle-xmark"></i> ${cGrp.unachievedStores} Toko</span></td>
          <td style="text-align:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; flex-grow:1;">
                <div style="width:${pctAchieved}%; background:${progressColor}; height:100%;"></div>
              </div>
              <strong style="color:${progressColor}; font-size:0.83rem;">${pctAchieved}%</strong>
            </div>
          </td>
          <td><strong style="color:#0284c7;">${cGrp.totalQty} Unit</strong> <small style="color:#64748b;">(${formatPoin(cGrp.totalOmzet)})</small></td>
          <td><strong style="color:#16a34a;">${formatRupiah(cGrp.totalRewards)}</strong></td>
        `;
        summaryTbody.appendChild(tr);
      });
    }
  }

  // Table render
  const tbody = document.querySelector("#dashboard-table tbody");
  tbody.innerHTML = "";

  if (data.length === 0) {
    const parts = selectedMonth ? selectedMonth.split("-") : [];
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const mmIdx = parts.length > 1 ? parseInt(parts[1], 10) - 1 : -1;
    const monthText = mmIdx >= 0 ? `${monthNames[mmIdx]} ${parts[0]}` : (selectedMonth || 'Semua Periode');
    const modeText = calcMode === "MONTHLY_ONLY" ? "Mode Single Bulan" : "Mode Cut-off Kumulatif";

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:25px;">
      <i class="fa-solid fa-folder-open" style="font-size: 1.8rem; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
      ${searchTerm ? 'Tidak ditemukan data pencapaian toko yang sesuai dengan kata kunci pencarian.' : `Belum ada data snapshot tersimpan untuk periode <strong>${monthText}</strong> (${modeText}).<br><span style="font-size:0.83rem; color:#dc2626; font-weight:600; margin-top:6px; display:inline-block;"><i class="fa-solid fa-calculator"></i> Silakan lakukan <strong>"Hitung & Tutup Buku Bulanan"</strong> pada menu Master Campaign.</span>`}
    </td></tr>`;
    return;
  }

  data.forEach(item => {
    const isZeroSales = item.totalQty === 0 && item.totalOmzet === 0;
    const gapColor = item.matchedTierLevel > 0 ? '#15803d' : (isZeroSales ? '#dc2626' : '#b45309');

    const cmp = window.db.getCampaigns().find(c => c.id === item.campaignId);
    const ascTiers = (cmp && cmp.tiers) ? [...cmp.tiers].sort((a,b) => a.level - b.level) : [];
    const minTier = ascTiers[0] || null;

    let effBasis = item.effectiveTargetBasis || item.targetBasis;
    if (!effBasis || effBasis === "QTY") {
      if (minTier && minTier.minOmzet > 0 && (!minTier.minQty || minTier.minQty === 0)) {
        effBasis = "OMZET";
      }
    }

      let actualDisplay = "";
    if (effBasis === "OMZET") {
      actualDisplay = `<strong style="color:#0284c7; font-size:1.05rem;">Rp ${(item.totalOmzet || 0).toLocaleString("id-ID")}</strong><br><small style="color:#64748b;">${item.totalQty} Unit</small>`;
    } else if (effBasis === "POIN") {
      actualDisplay = `<strong style="color:#0284c7; font-size:1.05rem;">${(item.totalPoin || 0).toLocaleString("id-ID")} Poin</strong><br><small style="color:#64748b;">${item.totalQty} Unit</small>`;
    } else if (effBasis === "BOTH") {
      actualDisplay = `<strong>${item.totalQty} Unit</strong><br><small style="color:#64748b;">Rp ${(item.totalOmzet || 0).toLocaleString("id-ID")} / ${(item.totalPoin || 0).toLocaleString("id-ID")} Poin</small>`;
    } else {
      actualDisplay = `<strong style="color:#0284c7; font-size:1.05rem;">${item.totalQty} Unit</strong><br><small style="color:#64748b;">${(item.totalPoin || 0).toLocaleString("id-ID")} Poin</small>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge badge-info"><i class="fa-solid fa-bullhorn"></i> ${item.campaignCode || 'CMP'}</span><br><small style="color:#475569;">${item.campaignName}</small></td>
      <td><strong>${item.storeName}</strong></td>
      <td>${actualDisplay}</td>
      <td><span class="badge ${item.matchedTierLevel > 0 ? 'badge-success' : 'badge-secondary'}" style="cursor:pointer; text-decoration:underline; font-size:0.8rem; padding: 6px 10px;" onclick="showQuickTierSchema('${item.campaignId}', '${item.storeId}')" title="Klik untuk melihat skema tier"><i class="fa-solid fa-circle-info"></i> ${item.matchedTierName}</span></td>
      <td>
        <div style="background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden; margin-bottom:6px; width:100%;">
          <div style="width:${item.progressPercentage}%; background:${item.matchedTierLevel > 0 ? '#16a34a' : '#f59e0b'}; height:100%;"></div>
        </div>
        <span style="font-size:0.83rem; font-weight:600; color:${gapColor}; line-height:1.4; display:block;">${item.gapDescription}</span>
      </td>
      <td>
        ${item.totalRewardValue > 0 ? `<strong style="color:#16a34a; font-size:0.95rem;">${formatRupiah(item.totalRewardValue)}</strong>` : ''}
        ${item.goodsDescription ? `${item.totalRewardValue > 0 ? '<br>' : ''}<span class="badge badge-success" style="font-size:0.83rem; white-space:normal; text-align:left;"><i class="fa-solid fa-gift"></i> ${item.goodsDescription}</span>` : (item.totalRewardValue === 0 ? '<span style="color:#94a3b8; font-size:0.85rem;">-</span>' : '')}
      </td>
      <td>${getPayoutBadge(item.payoutStatus)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="showStoreCampaignBreakdown('${item.campaignId}', '${item.storeId}')">
          <i class="fa-solid fa-list-check"></i> Rincian SKU
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function showStoreCampaignBreakdown(campaignId, storeId) {
  try {
    const selectedMonth = document.getElementById("dash-month-filter")?.value || "";
    const calcMode = document.getElementById("dash-calc-mode")?.value || "MONTHLY_ONLY";
    let data = null;
    if (window.db && typeof window.db.getSnapshotForPeriod === "function") {
      const snaps = window.db.getSnapshotForPeriod(selectedMonth, calcMode) || [];
      data = snaps.find(a => String(a.campaignId) === String(campaignId) && String(a.storeId) === String(storeId));
    }
    if (!data) {
      showToast("Data rincian SKU tidak ditemukan.", "warning");
      return;
    }

    const titleEl = document.getElementById("breakdown-title");
    const bodyEl = document.getElementById("breakdown-body");

    if (titleEl) {
      titleEl.innerHTML = `<i class="fa-solid fa-list-check"></i> Rincian SKU & Pengambilan: <strong>${data.storeName || ''}</strong>`;
    }

    let groupsHTML = (data.groupBreakdowns || []).map(g => {
      const skuQtyMap = {};
      const skuOmzetMap = {};
      (g.skuSummaryList || []).forEach(s => {
        const codeToUse = s.productCode || s.masterCode;
          if (codeToUse) {
            skuQtyMap[codeToUse] = (skuQtyMap[codeToUse] || 0) + (s.totalQty || 0);
            skuOmzetMap[codeToUse] = (skuOmzetMap[codeToUse] || 0) + (s.totalOmzet || 0);
          }
          if (s.masterCode && s.masterCode !== codeToUse) {
            skuQtyMap[s.masterCode] = (skuQtyMap[s.masterCode] || 0) + (s.totalQty || 0);
            skuOmzetMap[s.masterCode] = (skuOmzetMap[s.masterCode] || 0) + (s.totalOmzet || 0);
          }
      });

      const skuListText = (g.products || []).map(p => {
        const qTaken = skuQtyMap[p.productCode] || skuQtyMap[p.id] || parseFloat(p.qtyTaken || p.qty_taken || p.qty || 0);
        const pOmzet = skuOmzetMap[p.productCode] || skuOmzetMap[p.id] || parseFloat(p.omzet || p.totalOmzet || 0);
        const pPrice = parseFloat(p.unitPrice || p.unit_price || 0);
        const badgeHTML = qTaken > 0
          ? `<span class="badge badge-success" style="font-size: 0.72rem; padding: 2px 6px; margin-left: 4px;"><i class="fa-solid fa-circle-check"></i> Pengambilan: ${qTaken.toLocaleString("id-ID")} Unit ${pOmzet > 0 ? `(${pOmzet.toLocaleString("id-ID")} Poin)` : ''}</span>`
          : `<span class="badge badge-secondary" style="font-size: 0.72rem; padding: 2px 6px; margin-left: 4px; opacity: 0.7;"><i class="fa-solid fa-minus"></i> Belum Ambil (0 Unit)</span>`;
        return `<code>${p.productCode || ''}</code> - ${p.productName || ''} (${pPrice} Poin/Unit) ${badgeHTML}`;
      }).join("<br>") || "<em>Tidak ada SKU terdaftar</em>";
      const totalOmzetVal = (typeof g.totalOmzet === "number" && !isNaN(g.totalOmzet)) ? g.totalOmzet : 0;

      const totalQtyVal = (typeof g.totalQty === "number" && !isNaN(g.totalQty)) ? g.totalQty : 0;
      const txCount = g.transactionsCount || (g.transactions ? g.transactions.length : 0);
      const skuList = g.skuSummaryList || [];
      const trxList = g.transactions || [];

      return `
        <div style="background: ${g.isPurchased ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${g.isPurchased ? '#86efac' : '#fca5a5'}; padding: 14px; border-radius: 8px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid ${g.isPurchased ? '#bbf7d0' : '#fecaca'}; padding-bottom: 6px; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong style="font-size: 1rem; color: #0f172a;"><i class="fa-solid fa-layer-group"></i> Group/Type: ${g.groupCode || ''} - ${g.groupName || ''}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="badge ${g.isPurchased ? 'badge-success' : 'badge-danger'}" style="font-size: 0.85rem; padding: 6px 10px;">
                ${g.isPurchased ? `<i class="fa-solid fa-circle-check"></i> Pengambilan: ${totalQtyVal} Unit (${formatPoin(totalOmzetVal)})` : '<i class="fa-solid fa-triangle-exclamation"></i> BELUM ADA PENGAMBILAN (0 Unit)'}
              </span>
              ${g.isPurchased ? `
                <button type="button" class="btn btn-sm" onclick="toggleGroupTrxDetail('${g.groupId}')" style="background: #0284c7; color: white; border: none; font-size: 0.78rem; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                  <i class="fa-solid fa-receipt"></i> Detail Faktur & Qty SKU (${txCount} Trx)
                </button>
              ` : ''}
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 2fr 1.2fr; gap: 12px; align-items: start;">
            <div>
              <label style="font-size: 0.8rem; font-weight: bold; color: #475569;">Daftar Produk / SKU yang Terhitung di Group Ini:</label>
              <div style="font-size: 0.85rem; margin-top: 4px; line-height: 1.6; color: #334155;">
                ${skuListText}
              </div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.85rem;">
              <div style="font-weight: bold; color: #0284c7; margin-bottom: 4px;"><i class="fa-solid fa-lightbulb"></i> Rekomendasi Salesman:</div>
              ${g.isPurchased 
                ? `<span style="color:#16a34a; font-weight:600;"><i class="fa-solid fa-check"></i> Sudah ada pengambilan (${txCount} faktur).</span>`
                : `<span style="color:#dc2626; font-weight:600;"><i class="fa-solid fa-hand-point-right"></i> PERLU DIKLOPKAN! Tawarkan SKU di group ${g.groupCode || ''} ini ke toko.</span>`}
            </div>
          </div>

          ${g.isPurchased ? `
            <div id="group-trx-detail-${g.groupId}" style="display: none; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #bae6fd; background: white; padding: 12px; border-radius: 6px; border: 1px solid #bae6fd;">
              
              <!-- SKU SUMMARY TABLE -->
              <div style="font-weight: bold; color: #0284c7; margin-bottom: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-boxes-stacked"></i> 1. Ringkasan Pengambilan per SKU Data Sales (${skuList.length} SKU Dibeli):
                </div>
                <div style="overflow-x: auto; width: 100%; border-radius: 6px; margin-bottom: 14px;">
                  <table class="table" style="font-size: 0.82rem; margin-bottom: 0; border: 1px solid #cbd5e1;">
                <thead style="background: #f1f5f9;">
                  <tr>
                    <th>Kode SKU (Data Sales)</th>
                    <th>Master SKU Matched</th>
                    <th>Poin / Unit</th>
                    <th>Total Qty</th>
                    <th>Total Poin / Omzet</th>
                  </tr>
                </thead>
                <tbody>
                  ${skuList.map(sku => `
                    <tr>
                      <td><strong style="color:#0f172a;"><code>${sku.productCode}</code></strong></td>
                      <td><code>${sku.masterCode || '-'}</code> <small style="color:#64748b;">(${sku.productName})</small></td>
                      <td>${formatPoin(sku.unitPrice)}</td>
                      <td><strong style="color: #0284c7;">${sku.totalQty} Unit</strong></td>
                      <td><strong style="color: #16a34a;">${formatPoin(sku.totalOmzet)}</strong></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
                </div>

                <!-- INVOICE TRANSACTIONS TABLE -->
              <div style="font-weight: bold; color: #b45309; margin-bottom: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-file-invoice-dollar"></i> 2. Rincian Faktur Penjualan (${trxList.length} Faktur / Transaksi):
              </div>
              <div style="max-height: 180px; overflow-x: auto; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 4px;">
                ${trxList.length === 0 && txCount > 0 ? '<div style="padding: 10px; font-size: 0.8rem; color: #b45309; background: #fffbeb; border-radius: 4px; text-align: center;"><i class="fa-solid fa-cloud-arrow-down"></i> Detail baris faktur sengaja tidak disertakan di versi Cloud/HP untuk memperingan penyimpanan Supabase (hemat 99% data). Silakan buka aplikasi di Komputer utama Anda untuk melihat rincian baris fakturnya.</div>' : ''}
                  <table class="table" style="font-size: 0.8rem; margin: 0; display: ${trxList.length === 0 && txCount > 0 ? 'none' : 'table'};">
                  <thead style="background: #f1f5f9; position: sticky; top: 0; z-index: 5;">
                    <tr>
                      <th>No Faktur</th>
                      <th>Tanggal</th>
                      <th>Kode SKU (Data Sales Real)</th>
                      <th>Master SKU Terhitung</th>
                      <th>Qty</th>
                      <th>Total Poin</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trxList.map(trx => `
                      <tr>
                        <td><code>${trx.invoiceNo}</code></td>
                        <td>${trx.transactionDate}</td>
                        <td><strong style="color:#0f172a;"><code>${trx.realProductCode || trx.productCode}</code></strong></td>
                        <td><code>${trx.masterProductCode || '-'}</code> <small style="color:#64748b;">(${trx.masterProductName || ''})</small></td>
                        <td><strong>${trx.qty} Unit</strong></td>
                        <td><strong style="color: #16a34a;">${formatPoin(trx.totalOmzet)}</strong></td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>

            </div>
          ` : ''}

        </div>
      `;
    }).join("");

    const cmp = window.db.getCampaignById(campaignId);
    const groups = window.db.getProductGroups() || [];

    const periodText = formatCampaignPeriod(data.startDate, data.endDate, selectedMonth, cmp);

    // Build Campaign Tier Rules HTML for Salesman Reference
    let campaignTiersHTML = "";
    if (cmp && cmp.tiers && cmp.tiers.length > 0) {
      campaignTiersHTML = cmp.tiers.map(t => {
        const activeRates = (t.rates || []).filter(r => r && typeof r.rateValue === "number" && r.rateValue > 0);
        let rateText = activeRates.map(r => {
          const tId = String(r.groupId || r.groupCode || "").toLowerCase().trim();
          const grp = groups.find(g => String(g.id || "").toLowerCase().trim() === tId || String(g.groupCode || "").toLowerCase().trim() === tId);
          const gLabel = (tId === "all_groups") ? "Semua Group Produk" : (grp ? (grp.groupName && grp.groupCode && grp.groupCode !== grp.groupName ? `${grp.groupCode} (${grp.groupName})` : (grp.groupName || grp.groupCode)) : (r.groupCode || r.groupId));
          return r.calculationType === "PERCENTAGE_OF_OMZET" ? `- ${gLabel}: ${r.rateValue}% dari Omzet` : `- ${gLabel}: Rp ${r.rateValue.toLocaleString("id-ID")}/unit`;
        }).join("<br>");

        let goodsText = "";
        if (t.goodsItems && Array.isArray(t.goodsItems) && t.goodsItems.length > 0) {
          goodsText = t.goodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
        } else {
          goodsText = t.goodsDescription || t.goodsName || "";
        }

        let cGoodsText = "";
        if (t.hasConsistencyBonus && t.consistencyGoodsItems && Array.isArray(t.consistencyGoodsItems) && t.consistencyGoodsItems.length > 0) {
          cGoodsText = t.consistencyGoodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
        }

        const isPeriodBonus = t.bonusType === "PERIOD_TOTAL";
        const bonusTitle = isPeriodBonus ? "Bonus Tambahan Periode" : "Bonus Tambahan Konsistensi Bulanan";
        const periodNote = isPeriodBonus ? "(Total Periode)" : "(tiap bulan aktif)";
        const unitNote = isPeriodBonus ? "Unit" : "Unit/bulan";
        const poinNote = isPeriodBonus ? "Poin" : "Poin/bulan";
        const omzetNote = isPeriodBonus ? "" : "/bulan";

        let targetText = "";
        if ((t.minQty === 0 || !t.minQty) && (t.minOmzet === 0 || !t.minOmzet)) targetText = "<i>Sesuai Syarat Paket Wajib</i>";
        else if (cmp.targetBasis === "OMZET") targetText = `Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
        else if (cmp.targetBasis === "POIN") targetText = `Total Poin &ge; ${(t.minOmzet > 0 ? t.minOmzet : (t.minQty || 0)).toLocaleString("id-ID")} Poin`;
        else if (cmp.targetBasis === "BOTH") targetText = `Qty &ge; ${t.minQty} Unit DAN Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
        else targetText = `Qty &ge; ${t.minQty} Unit`;

        let cTargetText = "";
        if ((t.consistencyMinQty === 0 || !t.consistencyMinQty) && (t.consistencyMinOmzet === 0 || !t.consistencyMinOmzet)) cTargetText = "<i>Sesuai Syarat Paket Wajib</i>";
        else if (cmp.targetBasis === "OMZET") cTargetText = `Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
        else if (cmp.targetBasis === "POIN") cTargetText = `Total Poin &ge; ${(t.consistencyMinOmzet > 0 ? t.consistencyMinOmzet : (t.consistencyMinQty || 0)).toLocaleString("id-ID")} ${poinNote} ${periodNote}`;
        else if (cmp.targetBasis === "BOTH") cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} DAN Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
        else cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} ${periodNote}`;

        const isCurrentMatchedTier = data.matchedTierLevel === t.level;

        let bundlingText = "";
        if (t.hasBundlingRequirements && t.bundlingItems && t.bundlingItems.length > 0) {
          const parts = t.bundlingItems.filter(b => b && b.itemCode).map(b => `${b.itemCode} >= ${b.minQty} Unit`);
          if (parts.length > 0) {
            bundlingText = `<div style="color: #b45309; font-weight: 600; margin-top: 3px; font-size: 0.8rem;"><i class="fa-solid fa-boxes-packing"></i> Syarat Paket Wajib: ${parts.join(" DAN ")} (Berlaku Kelipatan Paket)</div>`;
          }
        }

        return `
          <div style="background: ${isCurrentMatchedTier ? '#f0fdf4' : '#ffffff'}; border: 1px solid ${isCurrentMatchedTier ? '#86efac' : '#cbd5e1'}; padding: 10px 12px; border-radius: 6px; position: relative;">
            ${isCurrentMatchedTier ? `<span class="badge badge-success" style="position: absolute; top: 8px; right: 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-check"></i> Tier Toko Saat Ini</span>` : ""}
            <strong style="color: #0f172a; font-size: 0.88rem;">Tier Level ${t.level}: ${t.tierName}</strong><br>
            <span style="font-size: 0.82rem; color: #475569; font-weight: 600;">Syarat Target: ${targetText}</span>
            ${bundlingText}
            
            <div style="margin-top: 6px; font-size: 0.81rem; line-height: 1.45; color: #334155;">
              ${activeRates.length > 0 ? `<div style="color: #0284c7;"><strong>Rates Insentif per Item:</strong><br>${rateText}</div>` : ""}
              ${goodsText ? `<div style="color: #16a34a; margin-top:2px;"><strong>Bonus Hadiah Barang:</strong> ${goodsText}</div>` : ""}
              ${t.fixedVoucherAmount > 0 ? `<div style="color: #b45309; margin-top:2px;"><strong>Bonus Cash / Voucher:</strong> Rp ${t.fixedVoucherAmount.toLocaleString("id-ID")}</div>` : ""}
              ${t.hasConsistencyBonus ? `
                <div style="margin-top: 4px; background: #f0fdf4; border: 1px dashed #86efac; padding: 4px 8px; border-radius: 4px; color: #15803d; font-size: 0.78rem;">
                  <strong><i class="fa-solid fa-calendar-check"></i> ${bonusTitle}:</strong><br>
                  <i class="fa-solid fa-circle-dot"></i> Syarat: ${cTargetText}<br>
                  ${t.consistencyVoucherAmount > 0 ? `<i class="fa-solid fa-circle-dot"></i> Bonus Cash/Voucher: Rp ${t.consistencyVoucherAmount.toLocaleString("id-ID")}<br>` : ""}
                  ${cGoodsText ? `<i class="fa-solid fa-circle-dot"></i> Hadiah Barang Bonus: ${cGoodsText}` : ""}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join("");
    }

    const rewardBreakdownHTML = data.rewardItemBreakdown && data.rewardItemBreakdown.length > 0
      ? data.rewardItemBreakdown.map(b => {
          let rateDisp = b.calcType === "PERCENTAGE_OF_OMZET" ? `* ${b.rateValue}% dari Omzet` : `x Rp ${b.rateValue.toLocaleString("id-ID")}`;
          return `- Group ${b.groupCode}: ${b.qtyAchieved} unit ${rateDisp} = <strong>Rp ${b.rewardEarned.toLocaleString("id-ID")}</strong>`;
        }).join("<br>")
      : "";

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="background: #e0f2fe; border: 1px solid #bae6fd; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.9rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div><strong>Program Campaign:</strong> ${data.campaignCode || ''} - ${data.campaignName || ''}</div>
            <div><strong>Periode Campaign:</strong> <span class="badge badge-info" style="font-size: 0.85rem;"><i class="fa-solid fa-calendar-days"></i> ${periodText}</span></div>
            <div><strong>Nama Toko:</strong> ${data.storeName || ''} (${data.region || 'All Region'})</div>
            <div><strong>Status Matched Tier:</strong> <span class="badge ${data.matchedTierLevel > 0 ? 'badge-success' : 'badge-secondary'}">${data.matchedTierName || '-'}</span></div>
            <div style="grid-column: span 2;"><strong>Analisa Target Gap:</strong> <span style="font-weight:600; color:#b45309;">${data.gapDescription || '-'}</span></div>
          </div>
        </div>

        <!-- CAMPAIGN TIER REWARD STRUCTURE (SALESMAN PITCH GUIDE) -->
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <strong style="color: #b45309; font-size: 0.92rem;">
              <i class="fa-solid fa-bullhorn" style="color: #d97706;"></i> Panduan Skema Tier & Reward Campaign Ini (Informasi untuk Toko):
            </strong>
            <small style="color: #78350f; font-weight: 600;"><i class="fa-solid fa-lightbulb"></i> Salesman dapat me-refer ke aturan ini untuk penawaran SKU ke toko</small>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;">
            ${campaignTiersHTML}
          </div>
        </div>

        <!-- STORE'S CURRENT REWARD EARNINGS SUMMARY -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 14px; border-radius: 8px; margin-bottom: 15px; font-size: 0.88rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #86efac; padding-bottom: 6px; flex-wrap: wrap; gap: 8px;">
            <strong style="color: #15803d; font-size: 0.95rem;">
              <i class="fa-solid fa-trophy" style="color: #eab308;"></i> Total Perolehan Reward Toko Saat Ini:
            </strong>
            <span class="badge badge-success" style="font-size: 0.9rem; padding: 6px 12px;">
              <i class="fa-solid fa-gift"></i> Total Reward: ${data.totalRewardValue > 0 ? formatRupiah(data.totalRewardValue) : (data.goodsDescription ? data.goodsDescription : 'Rp 0')}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; color: #1e293b;">
            <div><strong>Status Level Tier:</strong> <span class="badge ${data.matchedTierLevel > 0 ? 'badge-success' : 'badge-secondary'}">${data.matchedTierName || 'Belum Lolos Tier'}</span></div>
            <div><strong>Status Payout:</strong> ${getPayoutBadge(data.payoutStatus)}</div>
            ${data.goodsDescription ? `<div style="grid-column: span 2;"><strong><i class="fa-solid fa-gift" style="color:#16a34a;"></i> Hadiah Barang diperoleh:</strong> <span style="color:#15803d; font-weight:600;">${data.goodsDescription}</span></div>` : ''}
            ${data.fixedVoucherAmount > 0 ? `<div><strong><i class="fa-solid fa-ticket" style="color:#b45309;"></i> Bonus Voucher / Cash:</strong> <span style="color:#b45309; font-weight:bold;">${formatRupiah(data.fixedVoucherAmount)}</span></div>` : ''}
            ${data.itemRateRewardsTotal > 0 ? `<div><strong><i class="fa-solid fa-coins" style="color:#0284c7;"></i> Insentif Rate SKU:</strong> ${formatRupiah(data.itemRateRewardsTotal)}</div>` : ''}
          </div>
          ${rewardBreakdownHTML ? `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #86efac; font-size: 0.82rem; color: #166534;">
              <strong>Rincian Rates Insentif per Group yang sudah didapat:</strong><br>
              ${rewardBreakdownHTML}
            </div>
          ` : ''}
        </div>

        <h5 style="color: #0f172a; margin-bottom: 10px;"><i class="fa-solid fa-boxes-stacked"></i> Rincian Pengambilan per Group / Type Produk Toko Ini:</h5>
        ${groupsHTML}
      `;
    }

    openModal("modal-breakdown");
  } catch (err) {
    console.error("Error displaying store breakdown modal:", err);
    showToast("Gagal menampilkan Rincian SKU: " + (err.message || err), "danger");
  }
}

function toggleGroupTrxDetail(groupId) {
  const el = document.getElementById("group-trx-detail-" + groupId);
  if (!el) return;
  if (el.style.display === "none" || !el.style.display) {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

// --- RENDER ACHIEVEMENTS ---
function renderAchievements() {
  populateAchMonthFilter();
  const tbody = document.querySelector("#achievements-full-table tbody");
  if(tbody) tbody.innerHTML = "";

  let achievements = window.db.getAchievements();

    // Filter out CUMULATIVE duplicate rows for pure monthly infinite campaigns
    achievements = achievements.filter(a => {
      const cmp = window.db.getCampaignById(a.campaignId);
      const evalPeriod = cmp ? cmp.evaluationPeriod : a.evaluationPeriod;
      const eDate = cmp ? cmp.endDate : a.endDate;
      const isPure = (evalPeriod === "PURE_MONTHLY");
      const noEndDate = (!eDate || String(eDate).trim() === "" || String(eDate).trim() === "-");
      if (isPure && noEndDate && a.snapshotCalcMode === "CUMULATIVE") return false;
      return true;
    });

    // Text Search Filter
    const searchFil = document.getElementById("ach-search-filter")?.value?.toLowerCase();
    if (searchFil) {
      achievements = achievements.filter(a => 
        (a.storeName || "").toLowerCase().includes(searchFil) ||
        (a.storeCode || "").toLowerCase().includes(searchFil) ||
        (a.campaignName || "").toLowerCase().includes(searchFil) ||
        (a.campaignCode || "").toLowerCase().includes(searchFil)
      );
    }

    const mFil = document.getElementById("ach-month-filter")?.value;
  if (mFil && mFil !== "ALL") achievements = achievements.filter(a => a.snapshotMonth === mFil);
    const cFil = document.getElementById("ach-campaign-filter")?.value;
    if (cFil && cFil !== "ALL") achievements = achievements.filter(a => a.campaignId === cFil);

    // Role filter
  const currentUser = window.auth.getCurrentUser();
  if (currentUser && (currentUser.role === "TOKO" || currentUser.role === "SALESMAN")) {
    const assignedStoreIds = getUserAssignedStoreIds(currentUser);
    achievements = achievements.filter(a => assignedStoreIds.includes(a.storeId));
  }

  // Sort achievements by Store Name A-Z
  achievements.sort((a, b) => String(a.storeName || "").localeCompare(String(b.storeName || ""), "id", { sensitivity: "base" }));

  if (achievements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#64748b;">Belum ada data kalkulasi pencapaian.</td></tr>`;
    return;
  }

  const isManagerOrAdmin = window.auth.isManagerOrAdmin();

  achievements.forEach(item => {
    let breakdownText = "-";
    if (item.rewardItemBreakdown && item.rewardItemBreakdown.length > 0) {
      breakdownText = item.rewardItemBreakdown.map(b => {
        let rateDisp = b.calcType === "PERCENTAGE_OF_OMZET" ? `* ${b.rateValue}% dari Omzet` : `x Rp ${b.rateValue.toLocaleString("id-ID")}`;
          return `${b.groupCode}: ${b.qtyAchieved} unit ${rateDisp} = Rp ${b.rewardEarned.toLocaleString("id-ID")}`;
      }).join("<br>");
    }

    const tr = document.createElement("tr");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
      const parts = (item.snapshotMonth || "").split("-");
      const mStr = parts.length === 2 ? `${monthNames[parseInt(parts[1],10)-1]} ${parts[0]}` : item.snapshotMonth;
      const modeStr = item.snapshotCalcMode === "MONTHLY_ONLY" ? "Single Bln" : "Kumulatif";
        const noGoods = !item.goodsDescription;
        const noCash = (!item.fixedCashAmount || item.fixedCashAmount === 0);
        const noVoucher = (!item.fixedVoucherAmount || item.fixedVoucherAmount === 0);
        const isTotalValueZero = (!item.totalRewardValue || item.totalRewardValue === 0);
        const isDisabled = (noGoods && noCash && noVoucher && isTotalValueZero);
        const displayStatus = isDisabled ? "PENDING" : item.payoutStatus;
      tr.innerHTML = `
        <td style="font-size:0.8rem;">
          <span class="badge badge-info"><i class="fa-solid fa-calendar"></i> ${mStr}</span><br>
          <span class="badge badge-secondary" style="font-size:0.7rem; margin-top:4px;">${modeStr}</span>
        </td>
        <td style="font-size:0.85rem; max-width:180px;">
          <strong>${item.campaignCode || ""}</strong><br>
          <span style="color:#64748b; font-size:0.75rem;">${item.campaignName || ""}</span>
        </td>
      <td><strong>${item.storeName}</strong></td>
      <td>${item.totalQty} Unit</td>
      <td><strong>${formatRupiah(item.totalOmzet)}</strong></td>
      <td><span class="badge ${item.matchedTierLevel > 0 ? 'badge-success' : 'badge-secondary'}" style="cursor:pointer; text-decoration:underline; font-size:0.8rem; padding: 6px 10px;" onclick="showQuickTierSchema('${item.campaignId}', '${item.storeId}')" title="Klik untuk melihat skema tier"><i class="fa-solid fa-circle-info"></i> Level ${item.matchedTierLevel}</span></td>
      <td style="font-size:0.8rem;">${breakdownText}</td>
      <td style="font-size:0.85rem;">
        ${item.goodsDescription ? `<strong>Barang:</strong> ${item.goodsDescription}<br>` : ''}
        ${item.fixedCashAmount > 0 ? `<strong>Uang Cash:</strong> ${formatRupiah(item.fixedCashAmount)}<br>` : ''}
        ${item.fixedVoucherAmount > 0 ? `<strong>Voucher:</strong> ${formatRupiah(item.fixedVoucherAmount)}` : ''}
      </td>
      <td><strong style="color:#16a34a; font-size:1.05rem;">${formatRupiah(item.totalRewardValue)}</strong></td>
        <td>${getPayoutBadge(displayStatus)}</td>
        ${isManagerOrAdmin ? `        <td>
          <select class="form-select btn-sm" onchange="changePayoutStatus('${item.id}', this.value, this)" style="width: auto;" ${isDisabled ? 'disabled' : ''}>
            <option value="PENDING" ${displayStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
            <option value="APPROVED" ${displayStatus === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
            <option value="TRANSFERRED" ${displayStatus === 'TRANSFERRED' ? 'selected' : ''}>TRANSFERRED</option>
            <option value="CLAIMED" ${displayStatus === 'CLAIMED' ? 'selected' : ''}>CLAIMED</option>
          </select>
        </td>` : `<td class="role-admin-manager">-</td>`}
    `;
    tbody.appendChild(tr);
  });
}



// --- RENDER SALES HISTORY ---
function resetSalesHistoryFilters() {
  const filterIds = ["sales-filter-inv", "sales-filter-date", "sales-filter-store", "sales-filter-prod", "sales-filter-qty", "sales-filter-price", "sales-filter-omzet"];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderSalesHistory();
}

function renderSalesHistory() {
  let sales = window.db.getSales() || [];
  const stores = window.db.getStores() || [];
  const products = window.db.getProducts() || [];

  // Auto-purge initial seed dummy transactions (trx_1..trx_4) if real imported sales exist
  const hasRealImportedData = sales.some(s => s.batchId && s.batchId !== "batch_initial");
  if (hasRealImportedData) {
    const seedIds = ["trx_1", "trx_2", "trx_3", "trx_4"];
    const cleaned = sales.filter(s => s.batchId !== "batch_initial" && !seedIds.includes(s.id));
    if (cleaned.length !== sales.length) {
      const db = window.db.getDatabase();
      db.salesTransactions = cleaned;
      window.db.saveDatabase(db);
      sales = cleaned;
    }
  }

  let filteredSales = sales;
  const currentUser = window.auth.getCurrentUser();
  if (currentUser && (currentUser.role === "TOKO" || currentUser.role === "SALESMAN")) {
    const assignedStoreIds = getUserAssignedStoreIds(currentUser);
    filteredSales = sales.filter(s => assignedStoreIds.includes(s.storeId));
  }

  // Read Excel-like Column Filters
  const fInv = (document.getElementById("sales-filter-inv")?.value || "").toLowerCase().trim();
  const fDate = (document.getElementById("sales-filter-date")?.value || "").toLowerCase().trim();
  const fStore = (document.getElementById("sales-filter-store")?.value || "").toLowerCase().trim();
  const fProd = (document.getElementById("sales-filter-prod")?.value || "").toLowerCase().trim();
  const fQty = (document.getElementById("sales-filter-qty")?.value || "").toLowerCase().trim();
  const fPrice = (document.getElementById("sales-filter-price")?.value || "").toLowerCase().trim();
  const fOmzet = (document.getElementById("sales-filter-omzet")?.value || "").toLowerCase().trim();

  const isFiltered = fInv || fDate || fStore || fProd || fQty || fPrice || fOmzet;

  if (isFiltered) {
    filteredSales = filteredSales.filter(item => {
      const store = stores.find(s => s.id === item.storeId || (s.storeCode && item.storeCode && s.storeCode.toLowerCase() === item.storeCode.toLowerCase()));
      const prod = products.find(p => p.id === item.productId || (p.productCode && item.productCode && p.productCode.toLowerCase() === item.productCode.toLowerCase()));

      const storeText = (store ? `${store.storeCode} ${store.storeName}` : (item.storeCode || item.storeId || '')).toLowerCase();
      const prodText = (prod ? `${prod.productCode} ${prod.productName}` : (item.productCode || item.productId || '')).toLowerCase();
      const invText = (item.invoiceNo || "").toLowerCase();
      const dateText = (item.transactionDate || "").toLowerCase();
      const qtyText = String(item.qty || "");
      const priceText = String(item.price || "");
      const omzetText = String(item.totalOmzet || "");

      if (fInv && !invText.includes(fInv)) return false;
      if (fDate && !dateText.includes(fDate)) return false;
      if (fStore && !storeText.includes(fStore)) return false;
      if (fProd && !prodText.includes(fProd)) return false;
      if (fQty && !qtyText.includes(fQty)) return false;
      if (fPrice && !priceText.includes(fPrice)) return false;
      if (fOmzet && !omzetText.includes(fOmzet)) return false;

      return true;
    });
  }

  const countEl = document.getElementById("sales-count");
  if (countEl) {
    countEl.textContent = isFiltered ? `${filteredSales.length} / Total ${sales.length}` : sales.length;
  }

  const tbody = document.querySelector("#sales-history-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (filteredSales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding: 25px;">${isFiltered ? '&#128269; Tidak ada data transaksi yang cocok dengan filter kolom.' : 'Belum ada data penjualan ter-upload.'}</td></tr>`;
    return;
  }

  const limitVal = document.getElementById("sales-limit-select")?.value || "500";
  let displaySales = [...filteredSales].reverse();
  if (limitVal !== "ALL") {
    const maxLimit = parseInt(limitVal, 10);
    displaySales = displaySales.slice(0, maxLimit);
  }

  displaySales.forEach(item => {
    const store = stores.find(s => s.id === item.storeId || (s.storeCode && item.storeCode && s.storeCode.toLowerCase() === item.storeCode.toLowerCase()));
    const prod = products.find(p => p.id === item.productId || (p.productCode && item.productCode && p.productCode.toLowerCase() === item.productCode.toLowerCase()));

    const rawStoreText = item.storeCode || (store ? store.storeCode : (item.storeId || '-'));
    const rawProdText = item.productCode || (prod ? prod.productCode : (item.productId || '-'));

    const storeDisplayName = store 
      ? `<strong>${rawStoreText}</strong> <small style="color:#64748b;">(${store.storeName})</small>`
      : `<strong>${rawStoreText}</strong>`;

    const prodDisplayName = prod 
      ? `<code>${rawProdText}</code> <small style="color:#16a34a; font-size:0.75rem;"><i class="fa-solid fa-check"></i> Master SKU: ${prod.productCode}</small>`
      : `<code>${rawProdText}</code>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${item.invoiceNo || '-'}</code></td>
      <td>${item.transactionDate || '-'}</td>
      <td>${storeDisplayName}</td>
      <td>${prodDisplayName}</td>
      <td><strong>${item.qty || 0}</strong></td>
      <td>${item.price || 0} Poin</td>
      <td><strong>${(item.totalOmzet || 0).toLocaleString("id-ID")} Poin</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- RENDER MASTER DATA ---
function renderMasterData() {
  const isSuperAdmin = window.auth.isSuperAdmin();
  const users = window.db.getUsers();

  // Stores
  const storesTbody = document.querySelector("#master-stores-table tbody");
  storesTbody.innerHTML = "";
  window.db.getStores().forEach(s => {
    const isEligible = s.isCampaignEligible !== false;
    const badgeHTML = isEligible 
      ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Boleh Ikut Campaign</span>'
      : '<span class="badge badge-danger"><i class="fa-solid fa-ban"></i> Blacklist / Excluded</span>';

    const assignedUser = users.find(u => u.id === s.userId || u.storeId === s.id || u.id === s.salesmanId);
    let userDisplayHTML = "";

    if (assignedUser) {
      const roleIcon = assignedUser.role === "SALESMAN" ? "fa-user-tie" : "fa-store";
      userDisplayHTML = `<span class="badge badge-info"><i class="fa-solid ${roleIcon}"></i> ${assignedUser.username} (${assignedUser.fullname})</span>`;
    } else if (s.salesmanName) {
      userDisplayHTML = `<span class="badge badge-secondary" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;"><i class="fa-solid fa-user-tie" style="color:#0284c7;"></i> ${s.salesmanName}</span>`;
    } else {
      userDisplayHTML = '<span style="color:#94a3b8; font-size:0.8rem;">Belum Di-assign</span>';
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${s.storeCode}</code></td>
      <td><strong>${s.storeName}</strong></td>
      <td>${s.region}</td>
        <td>${s.marketCategory || "-"}</td>
      <td>${userDisplayHTML}</td>
      <td>${badgeHTML}</td>
      ${isSuperAdmin ? `
      <td>
        <button class="btn btn-primary btn-sm" onclick="editStore('${s.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStore('${s.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>` : `<td class="role-admin">-</td>`}
    `;
    storesTbody.appendChild(tr);
  });

  // Groups
  const groupsTbody = document.querySelector("#master-groups-table tbody");
  groupsTbody.innerHTML = "";
  window.db.getProductGroups().forEach(g => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${g.groupCode}</code></td>
      <td><strong>${g.groupName}</strong></td>
      ${isSuperAdmin ? `
      <td>
        <button class="btn btn-primary btn-sm" onclick="editProductGroup('${g.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProductGroup('${g.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>` : `<td class="role-admin">-</td>`}
    `;
    groupsTbody.appendChild(tr);
  });

  // Products
  const productsTbody = document.querySelector("#master-products-table tbody");
  productsTbody.innerHTML = "";
  const groups = window.db.getProductGroups();

  window.db.getProducts().forEach(p => {
    const grp = groups.find(g => g.id === p.groupId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${p.productCode}</code></td>
      <td><strong>${p.productName}</strong></td>
      <td><span class="badge badge-info">${grp ? grp.groupCode : p.groupId}</span></td>
      <td><strong style="color:#0284c7; font-size:0.95rem;"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${p.unitPrice || 0} Poin/Unit</strong></td>
      ${isSuperAdmin ? `
      <td>
        <button class="btn btn-primary btn-sm" onclick="editProduct('${p.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>` : `<td class="role-admin">-</td>`}
    `;
    productsTbody.appendChild(tr);
  });
  
  if (typeof genericTableSortState !== 'undefined') {
      const initOrSort = (id, defaultCol) => {
        if (genericTableSortState[id] && genericTableSortState[id].colIndex >= 0) {
          applyTableSort(id, genericTableSortState[id].colIndex, genericTableSortState[id].isAsc);
        } else {
          applyTableSort(id, defaultCol, true);
        }
      };
      initOrSort('master-stores-table', 0);
      initOrSort('master-groups-table', 0);
      initOrSort('master-products-table', 0);
    }
  }

  function populateUserSelect(selectId, currentUserId = "", currentSalesmanName = "") {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Belum Di-assign ke User / Salesman --</option>';
  const users = window.db.getUsers() || [];
  
  users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    const roleBadge = u.role === "SALESMAN" ? "Salesman" : (u.role === "TOKO" ? "Toko" : u.role);
    opt.textContent = `${u.fullname || u.username} (${roleBadge})`;
    if (u.id === currentUserId) opt.selected = true;
    sel.appendChild(opt);
  });

  if (currentSalesmanName && !currentUserId) {
    const matchedUser = users.find(u => (u.fullname || "").toLowerCase() === currentSalesmanName.toLowerCase() || (u.username || "").toLowerCase() === currentSalesmanName.toLowerCase());
    if (matchedUser) {
      sel.value = matchedUser.id;
    } else {
      const opt = document.createElement("option");
      opt.value = "custom_" + currentSalesmanName;
      opt.textContent = `${currentSalesmanName} (Salesman Non-Akun)`;
      opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

function openAddStoreModal() {
  populateUserSelect("store-user-id");
  document.getElementById("store-id").value = "";
  document.getElementById("store-code").value = "";
  document.getElementById("store-name").value = "";
  document.getElementById("store-region").value = "";
    document.getElementById("store-market").value = "";
  document.getElementById("store-user-id").value = "";
  document.getElementById("store-campaign-eligible").value = "true";
  document.getElementById("modal-store-title").textContent = "Tambah Toko Baru";
  openModal("modal-store");
}

function editStore(id) {
  const s = window.db.getStores().find(item => item.id === id);
  if (!s) return;
  const users = window.db.getUsers();
  const assignedUser = users.find(u => u.id === s.userId || u.storeId === s.id || u.id === s.salesmanId);

  populateUserSelect("store-user-id", assignedUser ? assignedUser.id : "", s.salesmanName || "");
  document.getElementById("store-id").value = s.id;
  document.getElementById("store-code").value = s.storeCode;
  document.getElementById("store-name").value = s.storeName;
  document.getElementById("store-region").value = s.region || "";
    document.getElementById("store-market").value = s.marketCategory || "";
  document.getElementById("store-user-id").value = assignedUser ? assignedUser.id : (s.salesmanName ? "custom_" + s.salesmanName : "");
  document.getElementById("store-campaign-eligible").value = (s.isCampaignEligible !== false) ? "true" : "false";
  document.getElementById("modal-store-title").textContent = "Edit Data Toko";
  openModal("modal-store");
}

function deleteStore(id) {
  if (confirm("Apakah Anda yakin ingin menghapus data toko ini?")) {
    window.db.deleteStore(id);
    showToast("Toko berhasil dihapus", "success");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  }
}

function openAddGroupModal() {
  document.getElementById("group-id").value = "";
  document.getElementById("group-code").value = "";
  document.getElementById("group-name").value = "";
  document.getElementById("modal-group-title").textContent = "Tambah Group Produk";
  openModal("modal-group");
}

function editProductGroup(id) {
  const g = window.db.getProductGroups().find(item => item.id === id);
  if (!g) return;
  document.getElementById("group-id").value = g.id;
  document.getElementById("group-code").value = g.groupCode;
  document.getElementById("group-name").value = g.groupName;
  document.getElementById("modal-group-title").textContent = "Edit Group Produk";
  openModal("modal-group");
}

function deleteProductGroup(id) {
  if (confirm("Apakah Anda yakin ingin menghapus group produk ini?")) {
    window.db.deleteProductGroup(id);
    showToast("Group Produk berhasil dihapus", "success");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  }
}

function checkDuplicateSkuWarning() {
  const codeInput = document.getElementById("product-code");
  const warnBox = document.getElementById("product-sku-warn");
  const warnGrpSpan = document.getElementById("product-sku-warn-grp");
  if (!codeInput || !warnBox) return;

  const currentId = document.getElementById("product-id")?.value || "";
  const rawCode = codeInput.value.trim().toLowerCase();

  if (!rawCode) {
    warnBox.style.display = "none";
    return;
  }

  const products = window.db.getProducts();
  const groups = window.db.getProductGroups();

  const dup = products.find(p => p.id !== currentId && p.productCode && p.productCode.trim().toLowerCase() === rawCode);
  if (dup) {
    const grp = groups.find(g => g.id === dup.groupId);
    if (warnGrpSpan) warnGrpSpan.textContent = grp ? `${grp.groupCode} - ${grp.groupName}` : dup.groupId;
    warnBox.style.display = "block";
  } else {
    warnBox.style.display = "none";
  }
}

function openAddProductModal() {
  populateGroupSelect("product-group-id");
  document.getElementById("product-id").value = "";
  document.getElementById("product-code").value = "";
  document.getElementById("product-name").value = "";
  document.getElementById("product-price").value = "";
  document.getElementById("modal-product-title").textContent = "Tambah Produk Baru";
  checkDuplicateSkuWarning();
  openModal("modal-product");
}

function editProduct(id) {
  const p = window.db.getProducts().find(item => item.id === id);
  if (!p) return;
  populateGroupSelect("product-group-id");
  document.getElementById("product-id").value = p.id;
  document.getElementById("product-code").value = p.productCode;
  document.getElementById("product-name").value = p.productName;
  document.getElementById("product-group-id").value = p.groupId;
  document.getElementById("product-price").value = p.unitPrice;
  document.getElementById("modal-product-title").textContent = "Edit Data Produk (SKU)";
  checkDuplicateSkuWarning();
  openModal("modal-product");
}

function deleteProduct(id) {
  if (confirm("Apakah Anda yakin ingin menghapus produk ini?")) {
    window.db.deleteProduct(id);
    showToast("Produk berhasil dihapus", "success");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  }
}

function formatDateIndonesian(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const parts = String(yyyyMmDd).split("T")[0].split("-");
  if (parts.length < 3) return yyyyMmDd;
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const day = parseInt(parts[2], 10);
  const mmIdx = parseInt(parts[1], 10) - 1;
  const year = parts[0];
  const mName = monthNames[mmIdx] || parts[1];
  return `${day} ${mName} ${year}`;
}

function formatCampaignPeriod(startDate, endDate, selectedMonth = "", campaign = null) {
  const isPureMonthly = campaign && campaign.evaluationPeriod === "PURE_MONTHLY";

  if (isPureMonthly) {
    if (selectedMonth && selectedMonth !== "ALL") {
      return `Bulan ${formatMonthYearIndonesian(selectedMonth)}`;
    } else {
      const curMonth = new Date().toISOString().substring(0, 7);
      return `Bulan ${formatMonthYearIndonesian(curMonth)} (Rutin Bulanan)`;
    }
  }

  if (!endDate || String(endDate).trim() === "") {
    let mKey = (selectedMonth && selectedMonth !== "ALL") ? selectedMonth : new Date().toISOString().substring(0, 7);
    const monthText = formatMonthYearIndonesian(mKey);
    return `Cut-off ${monthText}`;
  }
  if (!startDate) return "Semua Periode";
  const startStr = formatDateIndonesian(startDate);
  const endStr = formatDateIndonesian(endDate);
  return `${startStr} s/d ${endStr}`;
}

function formatMonthYearIndonesian(yyyyMm) {
  if (!yyyyMm || yyyyMm.length < 7) return yyyyMm;
  const [yyyy, mm] = yyyyMm.split("-");
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const idx = parseInt(mm, 10) - 1;
  if (idx >= 0 && idx < 12) {
    return `${monthNames[idx]} ${yyyy}`;
  }
  return yyyyMm;
}

function populateCampaignMonthFilter() {
  const sel = document.getElementById("campaign-month-filter");
  if (!sel) return;

  const currentVal = sel.value || "ALL";
  const campaigns = window.db.getCampaigns() || [];
  const sales = window.db.getSales() || [];

  const monthsSet = new Set();
  const curMonth = new Date().toISOString().substring(0, 7);
  monthsSet.add(curMonth);

  sales.forEach(s => {
    if (s.transactionDate) {
      const m = normalizeDateForEngine(s.transactionDate).substring(0, 7);
      if (m) monthsSet.add(m);
    }
  });

  campaigns.forEach(c => {
    if (c.startDate) {
      const activeMs = getCampaignActiveMonths(c.startDate, c.endDate);
      activeMs.forEach(m => monthsSet.add(m));
    }
  });

  const sortedMonths = Array.from(monthsSet).sort().reverse();

  sel.innerHTML = '<option value="ALL">-- Semua Periode / Bulan --</option>';
  sortedMonths.forEach(mKey => {
    const opt = document.createElement("option");
    opt.value = mKey;
    opt.textContent = `${formatMonthYearIndonesian(mKey)} (${mKey})`;
    sel.appendChild(opt);
  });

  sel.value = currentVal;
}

// --- RENDER CAMPAIGNS ---
function renderCampaigns() {
  populateCampaignMonthFilter();

  const monthVal = document.getElementById("campaign-month-filter")?.value || "ALL";
  const statusVal = document.getElementById("campaign-status-filter")?.value || "ALL";

  const allCampaigns = window.db.getCampaigns() || [];
  const stores = window.db.getStores();
  const groups = window.db.getProductGroups();

  let filteredCampaigns = [...allCampaigns];

  // 1. Status filter
  if (statusVal !== "ALL") {
    filteredCampaigns = filteredCampaigns.filter(c => c.status === statusVal);
  }

  // 2. Running Month filter
  if (monthVal !== "ALL") {
    filteredCampaigns = filteredCampaigns.filter(c => {
      const startM = normalizeDateForEngine(c.startDate).substring(0, 7);
      if (!startM || startM > monthVal) return false;

      if (c.endDate && String(c.endDate).trim() !== "") {
        const endM = normalizeDateForEngine(c.endDate).substring(0, 7);
        if (endM && endM < monthVal) return false;
      }
      return true;
    });
  }

  // Summary badge update
  const summaryEl = document.getElementById("campaign-filter-summary-badge");
  if (summaryEl) {
    const mLabel = monthVal !== "ALL" ? `pada bulan <strong>${formatMonthYearIndonesian(monthVal)}</strong>` : "seluruh bulan";
    summaryEl.innerHTML = `Menampilkan <strong>${filteredCampaigns.length}</strong> dari ${allCampaigns.length} Campaign (${mLabel})`;
  }

  const tbody = document.querySelector("#campaigns-table tbody");
  tbody.innerHTML = "";

  if (filteredCampaigns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding: 25px;">
      <i class="fa-solid fa-folder-open" style="font-size: 1.8rem; display:block; margin-bottom: 8px; color:#cbd5e1;"></i>
      Tidak ada program campaign yang sesuai dengan filter bulan / status terpilih.
    </td></tr>`;
    return;
  }

  filteredCampaigns.forEach(c => {
    let tierText = c.tiers.map(t => `Tier ${t.level}: ${t.tierName}`).join("<br>");

    let scopeLabel = "";
    if (c.targetScope === "ALL_STORES") {
      scopeLabel = '<span class="badge badge-success">Semua Toko</span>';
    } else if (c.targetScope === "BY_MARKET") {
        scopeLabel = `<span class="badge badge-info"><i class="fa-solid fa-tags"></i> Kategori/Market: ${c.eligibleMarket || "-"}</span>`;
      } else if (c.targetScope === "EXCLUDED_STORES") {
      scopeLabel = `<span class="badge badge-danger">Semua Toko Kecuali (${c.eligibleStoreIds?.length || 0} Toko)</span>`;
    } else {
      scopeLabel = `<span class="badge badge-warning">${c.eligibleStoreIds?.length || 0} Toko Terpilih</span>`;
    }

    let eligibleProductText = "";
    if (c.productFilterScope === "BY_SKU") {
      const prods = window.db.getProducts();
      if (!c.eligibleProductIds || c.eligibleProductIds.length === 0) {
        eligibleProductText = '<span class="badge badge-warning"><i class="fa-solid fa-barcode"></i> Semua SKU Produk</span>';
      } else {
        const skuCodes = prods.filter(p => c.eligibleProductIds.includes(p.id)).map(p => p.productCode).join(", ");
        eligibleProductText = `<span class="badge badge-warning" title="${skuCodes}"><i class="fa-solid fa-barcode"></i> ${c.eligibleProductIds.length} SKU Terpilih</span>`;
      }
    } else {
      let eligibleGroupsText = c.eligibleGroupIds?.length > 0 
        ? c.eligibleGroupIds.map(id => groups.find(g => g.id === id)?.groupCode || id).join(", ") 
        : "Semua Group";
      eligibleProductText = `<span class="badge badge-info"><i class="fa-solid fa-layer-group"></i> ${eligibleGroupsText}</span>`;
    }

    const dateDisplay = (c.endDate && c.endDate.trim()) 
      ? `${c.startDate} s.d. ${c.endDate}` 
      : `<span class="badge badge-success" style="font-size:0.8rem;"><i class="fa-solid fa-infinity"></i> Berjalan Terus<br><small>(${c.startDate} dst)</small></span>`;

    const statusBadge = c.status === "ACTIVE" 
      ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> ACTIVE</span>' 
      : '<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> INACTIVE</span>';

    const tr = document.createElement("tr");
      const descVal = c.description ? c.description : "-";
      const isBelumSurat = descVal.toUpperCase().includes("BELUM ADA SURAT");
      let descHtml = `<small class="text-muted" style="white-space: pre-wrap; font-size: 0.75rem; display: block; max-width: 250px;">${descVal}</small>`;
      if (isBelumSurat) {
        descHtml = `<div style="white-space: pre-wrap; font-size: 0.75rem; display: block; max-width: 250px; background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 4px; border: 1px solid #fca5a5; font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> ${descVal}</div>`;
      }
      tr.innerHTML = ` 
        <td><strong>${c.campaignCode}</strong><br>${c.campaignName}</td>
        <td>${descHtml}</td>
        <td>${dateDisplay}</td>
      <td>${scopeLabel}</td>
      <td>${eligibleProductText}</td>
      <td><span class="badge badge-secondary">Base ${c.targetBasis}</span></td>
      <td style="font-size:0.85rem;">${tierText}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="showCampaignDetail('${c.id}')"><i class="fa-solid fa-eye"></i> Detail</button>
          <button class="btn btn-warning btn-sm" onclick="editCampaign('${c.id}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
          <button class="btn ${c.status === 'ACTIVE' ? 'btn-secondary' : 'btn-success'} btn-sm" onclick="toggleCampaignStatus('${c.id}')" title="Klik untuk mengubah status Aktif / Non-Aktif">
            <i class="fa-solid fa-power-off"></i> ${c.status === 'ACTIVE' ? 'Non-Aktifkan' : 'Aktifkan'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCampaign('${c.id}')"><i class="fa-solid fa-trash"></i> Hapus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (typeof genericTableSortState !== 'undefined' && genericTableSortState['campaigns-table']?.colIndex >= 0) {
    applyTableSort('campaigns-table', genericTableSortState['campaigns-table'].colIndex, genericTableSortState['campaigns-table'].isAsc);
  }
}

function showQuickTierSchema(campaignId, storeId) {
  const cmp = window.db.getCampaignById(campaignId);
  if (!cmp) return;
  const groups = window.db.getProductGroups() || [];

  const selectedMonth = document.getElementById("dash-month-filter")?.value || document.getElementById("ach-month-filter")?.value || "";
  const calcMode = document.getElementById("dash-calc-mode")?.value || "MONTHLY_ONLY";
  const snaps = window.db && typeof window.db.getSnapshotForPeriod === "function" ? (window.db.getSnapshotForPeriod(selectedMonth, calcMode) || []) : [];
  const snapshot = snaps.find(a => String(a.campaignId) === String(campaignId) && String(a.storeId) === String(storeId));

  const matchedTierLevel = snapshot ? snapshot.matchedTierLevel : 0;
  
    let campaignTiersHTML = "";
  
  const periodText = formatCampaignPeriod(cmp.startDate, cmp.endDate, selectedMonth, cmp);
  const headerHTML = `
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
      <div style="font-weight: 700; color: #0f172a; font-size: 0.95rem; margin-bottom: 4px;">${cmp.campaignName}</div>
      <div style="font-size: 0.82rem; color: #475569; margin-bottom: 10px;"><i class="fa-solid fa-calendar-days"></i> Periode Evaluasi: <strong>${periodText}</strong></div>
      <button class="btn btn-primary btn-sm" style="font-size: 0.78rem; padding: 5px 12px; font-weight: 600;" onclick="showCampaignSkus('${campaignId}')">
        <i class="fa-solid fa-boxes-stacked"></i> Lihat Daftar Produk SKU
      </button>
    </div>
  `;

  if (cmp.tiers && cmp.tiers.length > 0) {
    campaignTiersHTML = cmp.tiers.map(t => {
      const activeRates = (t.rates || []).filter(r => r && typeof r.rateValue === "number" && r.rateValue > 0);
      let rateText = activeRates.map(r => {
        const tId = String(r.groupId || r.groupCode || "").toLowerCase().trim();
        const grp = groups.find(g => String(g.id || "").toLowerCase().trim() === tId || String(g.groupCode || "").toLowerCase().trim() === tId);
        const gLabel = (tId === "all_groups") ? "Semua Group Produk" : (grp ? (grp.groupName && grp.groupCode && grp.groupCode !== grp.groupName ? `${grp.groupCode} (${grp.groupName})` : (grp.groupName || grp.groupCode)) : (r.groupCode || r.groupId));
        return r.calculationType === "PERCENTAGE_OF_OMZET" ? `- ${gLabel}: ${r.rateValue}% dari Omzet` : `- ${gLabel}: Rp ${r.rateValue.toLocaleString("id-ID")}/unit`;
      }).join("<br>");

      let goodsText = "";
      if (t.goodsItems && Array.isArray(t.goodsItems) && t.goodsItems.length > 0) {
        goodsText = t.goodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
      } else {
        goodsText = t.goodsDescription || t.goodsName || "";
      }

      let cGoodsText = "";
      if (t.hasConsistencyBonus && t.consistencyGoodsItems && Array.isArray(t.consistencyGoodsItems) && t.consistencyGoodsItems.length > 0) {
        cGoodsText = t.consistencyGoodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
      }

      const isPeriodBonus = t.bonusType === "PERIOD_TOTAL";
      const bonusTitle = isPeriodBonus ? "Bonus Tambahan Periode" : "Bonus Tambahan Konsistensi Bulanan";
      const periodNote = isPeriodBonus ? "(Total Periode)" : "(tiap bulan aktif)";
      const unitNote = isPeriodBonus ? "Unit" : "Unit/bulan";
      const poinNote = isPeriodBonus ? "Poin" : "Poin/bulan";
      const omzetNote = isPeriodBonus ? "" : "/bulan";

      let targetText = "";
      if ((t.minQty === 0 || !t.minQty) && (t.minOmzet === 0 || !t.minOmzet)) targetText = "<i>Sesuai Syarat Paket Wajib</i>";
      else if (cmp.targetBasis === "OMZET") targetText = `Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
      else if (cmp.targetBasis === "POIN") targetText = `Total Poin &ge; ${(t.minOmzet > 0 ? t.minOmzet : (t.minQty || 0)).toLocaleString("id-ID")} Poin`;
      else if (cmp.targetBasis === "BOTH") targetText = `Qty &ge; ${t.minQty} Unit DAN Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
      else targetText = `Qty &ge; ${t.minQty} Unit`;

      let cTargetText = "";
      if ((t.consistencyMinQty === 0 || !t.consistencyMinQty) && (t.consistencyMinOmzet === 0 || !t.consistencyMinOmzet)) cTargetText = "<i>Sesuai Syarat Paket Wajib</i>";
      else if (cmp.targetBasis === "OMZET") cTargetText = `Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
      else if (cmp.targetBasis === "POIN") cTargetText = `Total Poin &ge; ${(t.consistencyMinOmzet > 0 ? t.consistencyMinOmzet : (t.consistencyMinQty || 0)).toLocaleString("id-ID")} ${poinNote} ${periodNote}`;
      else if (cmp.targetBasis === "BOTH") cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} DAN Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
      else cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} ${periodNote}`;

      const isCurrentMatchedTier = String(matchedTierLevel) === String(t.level);

      let bundlingText = "";
      if (t.hasBundlingRequirements && t.bundlingItems && t.bundlingItems.length > 0) {
        const parts = t.bundlingItems.filter(b => b && b.itemCode).map(b => `${b.itemCode} >= ${b.minQty} Unit`);
        if (parts.length > 0) {
          bundlingText = `<div style="color: #b45309; font-weight: 600; margin-top: 3px; font-size: 0.8rem;"><i class="fa-solid fa-boxes-packing"></i> Syarat Paket Wajib: ${parts.join(" DAN ")} (Berlaku Kelipatan Paket)</div>`;
        }
      }

      let gapHTML = "";
      if (snapshot && snapshot.totalRewardValue !== undefined) {
          const mQty = snapshot.totalQty || 0;
          const mOmzet = snapshot.totalOmzet || 0;
          const mPoin = snapshot.totalPoin || 0;
          
          let gapTextBulanan = "";
            if (cmp.evaluationPeriod !== "PURE_MONTHLY" && t.hasConsistencyBonus) {
               let monthlyQty = mQty;
               let monthlyOmzet = mOmzet;
               let monthlyPoin = mPoin;
               if (calcMode !== "MONTHLY_ONLY") {
                 const monSnaps = window.db && typeof window.db.getSnapshotForPeriod === "function" ? (window.db.getSnapshotForPeriod(selectedMonth, "MONTHLY_ONLY") || []) : [];
                 const monSnap = monSnaps.find(a => String(a.campaignId) === String(campaignId) && String(a.storeId) === String(storeId));
                 if (monSnap) {
                   monthlyQty = monSnap.totalQty || 0;
                   monthlyOmzet = monSnap.totalOmzet || 0;
                   monthlyPoin = monSnap.totalPoin || 0;
                 }
               }
               
               const cTargetPoinVal = t.consistencyMinOmzet > 0 ? t.consistencyMinOmzet : (t.consistencyMinQty || 0);
               if (cmp.targetBasis === "QTY") {
                  const gapQ = Math.max(0, (t.consistencyMinQty || 0) - monthlyQty);
                  if (gapQ > 0) gapTextBulanan = `Kurang ${gapQ.toLocaleString("id-ID")} Unit`;
                  else gapTextBulanan = "✅ Tercapai!";
               } else if (cmp.targetBasis === "OMZET") {
                  const gapO = Math.max(0, cTargetPoinVal - monthlyOmzet);
                  if (gapO > 0) gapTextBulanan = `Kurang Rp ${gapO.toLocaleString("id-ID")}`;
                  else gapTextBulanan = "✅ Tercapai!";
               } else if (cmp.targetBasis === "POIN") {
                  const gapP = Math.max(0, cTargetPoinVal - monthlyPoin);
                  if (gapP > 0) gapTextBulanan = `Kurang ${gapP.toLocaleString("id-ID")} Poin`;
                  else gapTextBulanan = "✅ Tercapai!";
               } else if (cmp.targetBasis === "BOTH") {
                  const gapQ = Math.max(0, (t.consistencyMinQty || 0) - monthlyQty);
                  const gapO = Math.max(0, cTargetPoinVal - monthlyOmzet);
                  if (gapQ > 0 || gapO > 0) gapTextBulanan = `Kurang ${gapQ.toLocaleString("id-ID")} Unit & Rp ${gapO.toLocaleString("id-ID")}`;
                  else gapTextBulanan = "✅ Tercapai!";
               }
            }
            
              if (t.level > matchedTierLevel) {
             let gapText = "";
             const targetPoinVal = t.minOmzet > 0 ? t.minOmzet : (t.minQty || 0);
             
             
             if ((t.minQty === 0 || !t.minQty) && (t.minOmzet === 0 || !t.minOmzet)) {
                gapText = "Belum memenuhi Syarat Paket Wajib";
             } else if (cmp.targetBasis === "QTY") {
                const gapQ = Math.max(0, (t.minQty || 0) - mQty);
                if (gapQ > 0) gapText = `Kurang ${gapQ.toLocaleString("id-ID")} Unit`;
             } else if (cmp.targetBasis === "OMZET") {
                const gapO = Math.max(0, targetPoinVal - mOmzet);
                if (gapO > 0) gapText = `Kurang Rp ${gapO.toLocaleString("id-ID")}`;
             } else if (cmp.targetBasis === "POIN") {
                const gapP = Math.max(0, targetPoinVal - mPoin);
                if (gapP > 0) gapText = `Kurang ${gapP.toLocaleString("id-ID")} Poin`;
             } else if (cmp.targetBasis === "BOTH") {
                const gapQ = Math.max(0, (t.minQty || 0) - mQty);
                const gapO = Math.max(0, targetPoinVal - mOmzet);
                if (gapQ > 0 || gapO > 0) gapText = `Kurang ${gapQ.toLocaleString("id-ID")} Unit & Rp ${gapO.toLocaleString("id-ID")}`;
             }
             
             if (gapText) {
               gapHTML = `<div style="margin-top: 8px; padding: 6px 10px; background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 4px; color: #b45309; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-arrow-trend-up"></i> Progress Total: ${gapText} lagi untuk mencapai tier ini!` + (gapTextBulanan ? `<br><span style="color:#15803d; font-size:0.85rem;"><i class="fa-solid fa-bullseye"></i> Target Bulanan: ${gapTextBulanan}</span>` : "") + `</div>`;
             } else {
               gapHTML = `<div style="margin-top: 8px; padding: 6px 10px; background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 4px; color: #b45309; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-arrow-trend-up"></i> Syarat tercapai, namun belum memenuhi kriteria tier berjenjang.</div>`;
             }
          } else if (t.level === matchedTierLevel) {
             gapHTML = `<div style="margin-top: 8px; padding: 6px 10px; background: #f0fdf4; border: 1px dashed #22c55e; border-radius: 4px; color: #15803d; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-check-double"></i> Syarat tier ini sudah terpenuhi!` + (gapTextBulanan ? `<br><span style="color:#15803d; font-size:0.85rem;"><i class="fa-solid fa-bullseye"></i> Target Bulanan: ${gapTextBulanan}</span>` : "") + `</div>`;
          }
      }

      return `
        <div style="background: ${isCurrentMatchedTier ? '#f0fdf4' : '#ffffff'}; border: 1px solid ${isCurrentMatchedTier ? '#86efac' : '#cbd5e1'}; padding: 10px 12px; border-radius: 6px; position: relative; margin-bottom: 8px;">
          ${isCurrentMatchedTier ? `<span class="badge badge-success" style="position: absolute; top: 8px; right: 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-check"></i> Tier Toko Saat Ini</span>` : ""}
          <strong style="color: #0f172a; font-size: 0.88rem;">Tier Level ${t.level}: ${t.tierName}</strong><br>
          <span style="font-size: 0.82rem; color: #475569; font-weight: 600;">Syarat Target: ${targetText}</span>
          ${bundlingText}
          
          <div style="margin-top: 6px; font-size: 0.81rem; line-height: 1.45; color: #334155;">
            ${activeRates.length > 0 ? `<div style="color: #0284c7;"><strong>Rates Insentif per Item:</strong><br>${rateText}</div>` : ""}
            ${goodsText ? `<div style="color: #16a34a; margin-top:2px;"><strong>Bonus Hadiah Barang:</strong> ${goodsText}</div>` : ""}
            ${t.fixedVoucherAmount > 0 ? `<div style="color: #b45309; margin-top:2px;"><strong>Bonus Cash / Voucher:</strong> Rp ${t.fixedVoucherAmount.toLocaleString("id-ID")}</div>` : ""}
            ${t.hasConsistencyBonus ? `
              <div style="margin-top: 4px; background: #f0fdf4; border: 1px dashed #86efac; padding: 4px 8px; border-radius: 4px; color: #15803d; font-size: 0.78rem;">
                <strong><i class="fa-solid fa-calendar-check"></i> ${bonusTitle}:</strong><br>
                <i class="fa-solid fa-circle-dot"></i> Syarat: ${cTargetText}<br>
                ${t.consistencyVoucherAmount > 0 ? `<i class="fa-solid fa-circle-dot"></i> Bonus Cash/Voucher: Rp ${t.consistencyVoucherAmount.toLocaleString("id-ID")}<br>` : ""}
                ${cGoodsText ? `<i class="fa-solid fa-circle-dot"></i> Hadiah Barang Bonus: ${cGoodsText}` : ""}
              </div>
            ` : ""}
          </div>
          ${gapHTML}
        </div>
      `;
    }).join("");
  } else {
    campaignTiersHTML = "<em>Tidak ada data tier untuk campaign ini.</em>";
  }

  document.getElementById("quick-tier-body").innerHTML = headerHTML + campaignTiersHTML;
  openModal("modal-quick-tier");
}

function showCampaignDetail(campaignId) {
  const c = window.db.getCampaignById(campaignId);
  if (!c) return;

  const stores = window.db.getStores();
  const groups = window.db.getProductGroups();

  let storeListHTML = "";
  if (c.targetScope === "ALL_STORES") {
    storeListHTML = "<p class='badge badge-success'>Berlaku untuk SEMUA Toko terdaftar dalam sistem.</p>";
  } else if (c.targetScope === "BY_MARKET") {
        scopeLabel = `<span class="badge badge-info"><i class="fa-solid fa-tags"></i> Kategori/Market: ${c.eligibleMarket || "-"}</span>`;
      } else if (c.targetScope === "BY_MARKET") {
      storeListHTML = `<p class='badge badge-info'>Berlaku untuk SEMUA Toko dengan Kategori/Market: <strong>${c.eligibleMarket || "-"}</strong></p>`;
    } else if (c.targetScope === "EXCLUDED_STORES") {
    const excludedStores = stores.filter(s => c.eligibleStoreIds?.includes(s.id));
    storeListHTML = "<p class='badge badge-danger' style='margin-bottom:6px;'>Berlaku untuk SEMUA Toko KECUALI toko-toko berikut (" + excludedStores.length + " Toko Dikecualikan):</p>" +
      "<ul style='margin-left: 20px; font-size: 0.9rem;'>" + 
      excludedStores.map(s => `<li><span style='color:#dc2626; font-weight:600;'>[Dikecualikan]</span> <strong>${s.storeCode}</strong> - ${s.storeName} (${s.region})</li>`).join("") + 
      "</ul>";
  } else {
    const selectedStores = stores.filter(s => c.eligibleStoreIds?.includes(s.id));
    storeListHTML = "<p class='badge badge-warning' style='margin-bottom:6px;'>Berlaku KHUSUS Toko-Toko Terpilih berikut (" + selectedStores.length + " Toko):</p>" +
      "<ul style='margin-left: 20px; font-size: 0.9rem;'>" + 
      selectedStores.map(s => `<li><strong>${s.storeCode}</strong> - ${s.storeName} (${s.region})</li>`).join("") + 
      "</ul>";
  }

  let groupListHTML = "";
  if (c.productFilterScope === "BY_SKU") {
    const prods = window.db.getProducts();
    if (!c.eligibleProductIds || c.eligibleProductIds.length === 0) {
      groupListHTML = "<p class='badge badge-warning'><i class='fa-solid fa-barcode'></i> Mode SKU: Menghitung Seluruh Kode SKU Produk.</p>";
    } else {
      const selectedSkus = prods.filter(p => c.eligibleProductIds.includes(p.id)).sort((a, b) => String(a.productCode||"").localeCompare(String(b.productCode||"")));
      groupListHTML = "<p class='badge badge-warning' style='margin-bottom:6px;'><i class='fa-solid fa-barcode'></i> Mode SKU Terpilih (" + selectedSkus.length + " SKU):</p>" +
        "<ul style='margin-left: 20px; font-size: 0.9rem;'>" + 
        selectedSkus.map(p => `<li><code>${p.productCode}</code> - ${p.productName}</li>`).join("") + 
        "</ul>";
    }
  } else {
    if (!c.eligibleGroupIds || c.eligibleGroupIds.length === 0) {
      groupListHTML = "<p class='badge badge-info'>Menghitung Seluruh Group / Type Produk.</p>";
    } else {
      const selectedGroups = groups.filter(g => c.eligibleGroupIds.includes(g.id));
      groupListHTML = "<ul style='margin-left: 20px; font-size: 0.9rem;'>" + 
        selectedGroups.map(g => `<li><strong>${g.groupCode}</strong> - ${g.groupName}</li>`).join("") + 
        "</ul>";
    }
  }

  let tierHTML = c.tiers.map(t => {
    const activeRates = (t.rates || []).filter(r => r && typeof r.rateValue === "number" && r.rateValue > 0);
    let rateText = activeRates.map(r => {
      const grp = groups.find(g => g.id === r.groupId);
      const gLab = (r.groupId === "ALL_GROUPS") ? "Semua Group Produk" : (grp ? grp.groupCode : r.groupId);
        return r.calculationType === "PERCENTAGE_OF_OMZET" ? `- ${gLab}: ${r.rateValue}% dari Omzet` : `- ${gLab}: Rp ${r.rateValue.toLocaleString("id-ID")}/unit`;
    }).join("<br>");

    let goodsText = "";
    if (t.goodsItems && Array.isArray(t.goodsItems) && t.goodsItems.length > 0) {
      goodsText = t.goodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
    } else {
      goodsText = t.goodsDescription || t.goodsName || "";
    }

    let cGoodsText = "";
    if (t.hasConsistencyBonus && t.consistencyGoodsItems && Array.isArray(t.consistencyGoodsItems) && t.consistencyGoodsItems.length > 0) {
      cGoodsText = t.consistencyGoodsItems.filter(g => g && g.name).map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
    }

    const isPeriodBonus = t.bonusType === "PERIOD_TOTAL";
    const bonusTitle = isPeriodBonus ? "Bonus Tambahan Periode" : "Bonus Tambahan Konsistensi Bulanan";
    const periodNote = isPeriodBonus ? "(Total Periode)" : "(tiap bulan aktif)";
    const unitNote = isPeriodBonus ? "Unit" : "Unit/bulan";
    const poinNote = isPeriodBonus ? "Poin" : "Poin/bulan";
    const omzetNote = isPeriodBonus ? "" : "/bulan";

    let targetText = "";
    if ((t.minQty === 0 || !t.minQty) && (t.minOmzet === 0 || !t.minOmzet)) targetText = "<i>Sesuai Syarat Paket Wajib</i>";
        else if (c.targetBasis === "OMZET") targetText = `Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
    else if (c.targetBasis === "POIN") targetText = `Total Poin &ge; ${(t.minOmzet > 0 ? t.minOmzet : (t.minQty || 0)).toLocaleString("id-ID")} Poin`;
    else if (c.targetBasis === "BOTH") targetText = `Qty &ge; ${t.minQty} Unit DAN Omzet &ge; Rp ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
    else targetText = `Qty &ge; ${t.minQty} Unit`;

    let cTargetText = "";
    if ((t.consistencyMinQty === 0 || !t.consistencyMinQty) && (t.consistencyMinOmzet === 0 || !t.consistencyMinOmzet)) cTargetText = "<i>Sesuai Syarat Paket Wajib</i>";
        else if (c.targetBasis === "OMZET") cTargetText = `Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
    else if (c.targetBasis === "POIN") cTargetText = `Total Poin &ge; ${(t.consistencyMinOmzet > 0 ? t.consistencyMinOmzet : (t.consistencyMinQty || 0)).toLocaleString("id-ID")} ${poinNote} ${periodNote}`;
    else if (c.targetBasis === "BOTH") cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} DAN Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
    else cTargetText = `Qty &ge; ${t.consistencyMinQty || 0} ${unitNote} ${periodNote}`;

    let bundlingText = "";
    if (t.hasBundlingRequirements && t.bundlingItems && t.bundlingItems.length > 0) {
      const parts = t.bundlingItems.filter(b => b && b.itemCode).map(b => `${b.itemCode} >= ${b.minQty} Unit`);
      if (parts.length > 0) {
        bundlingText = `<div style="color: #b45309; font-weight: 600; margin-top: 3px; font-size: 0.85rem;"><i class="fa-solid fa-boxes-packing"></i> Syarat Paket Wajib: ${parts.join(" DAN ")} (Berlaku Kelipatan Paket)</div>`;
      }
    }

    return `
      <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #cbd5e1;">
        <strong>Tier Level ${t.level} (${t.tierName})</strong><br>
        <span style="font-size: 0.85rem; color: #475569;">Target Min Total: ${targetText}</span><br>
        ${bundlingText}
        ${activeRates.length > 0 ? `
          <div style="margin-top: 5px; font-size: 0.85rem; color: #0284c7;">
            <strong>Rates Reward per Item:</strong><br>${rateText}
          </div>
        ` : ""}
        ${goodsText ? `<div style="font-size:0.85rem; color:#16a34a; margin-top:3px;"><strong>Bonus Hadiah Barang:</strong> ${goodsText}</div>` : ""}
        ${t.fixedVoucherAmount > 0 ? `<div style="font-size:0.85rem; color:#b45309;"><strong>Bonus Voucher:</strong> Rp ${t.fixedVoucherAmount.toLocaleString("id-ID")}</div>` : ""}
        ${t.hasConsistencyBonus ? `
          <div style="margin-top: 6px; font-size: 0.83rem; background: #f0fdf4; border: 1px solid #86efac; padding: 6px 10px; border-radius: 6px; color: #15803d;">
            <strong><i class="fa-solid fa-calendar-check"></i> ${bonusTitle}:</strong><br>
            <i class="fa-solid fa-circle-dot"></i> Syarat: ${cTargetText}<br>
            ${t.consistencyVoucherAmount > 0 ? `<i class="fa-solid fa-circle-dot"></i> Bonus Cash/Voucher: Rp ${t.consistencyVoucherAmount.toLocaleString("id-ID")}<br>` : ""}
            ${cGoodsText ? `<i class="fa-solid fa-circle-dot"></i> Hadiah Barang Bonus: ${cGoodsText}` : ""}
          </div>
        ` : ''}
      </div>
    `;
  }).join("");

  const selectedMonth = document.getElementById("dash-month-filter")?.value || "";
  const periodText = formatCampaignPeriod(c.startDate, c.endDate, selectedMonth, c);

  document.getElementById("detail-cmp-title").textContent = `Keterkaitan Master Campaign: ${c.campaignCode} - ${c.campaignName}`;
  document.getElementById("detail-cmp-body").innerHTML = `
    <div style="background: #e0f2fe; border: 1px solid #bae6fd; padding: 12px 16px; border-radius: 8px; margin-bottom: 18px; font-size: 0.9rem;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <div><strong>Periode Campaign:</strong> <span class="badge badge-info" style="font-size: 0.85rem;"><i class="fa-solid fa-calendar-days"></i> ${periodText}</span></div>
        <div><strong>Periode Evaluasi:</strong> <span class="badge badge-secondary">${c.evaluationPeriod === 'PURE_MONTHLY' ? 'Murni Rutin Bulanan' : (c.evaluationPeriod === 'MONTHLY' ? 'Evaluasi Per Bulan (Periode Program)' : 'Akumulasi Total Periode')}</span></div>
        <div><strong>Dasar Target:</strong> <span class="badge badge-secondary">Base ${c.targetBasis || 'QTY'}</span></div>
        <div><strong>Kelipatan Reward:</strong> <span class="badge ${c.isMultiplier ? 'badge-success' : 'badge-secondary'}">${c.isMultiplier ? 'Berlaku Kelipatan' : '1x (Tanpa Kelipatan)'}</span></div>
      </div>
    </div>
    <div style="margin-bottom: 15px;">
      <h5 style="color: #0284c7; margin-bottom: 5px;"><i class="fa-solid fa-store"></i> 1. Toko yang Dilibatkan (Target Scope Toko):</h5>
      ${storeListHTML}
    </div>
    <hr style="margin: 15px 0; border: none; border-top: 1px solid #e2e8f0;">
    <div style="margin-bottom: 15px;">
      <h5 style="color: #0284c7; margin-bottom: 5px;"><i class="fa-solid fa-layer-group"></i> 2. Group / Type Produk yang Dihitung:</h5>
      ${groupListHTML}
    </div>
    <hr style="margin: 15px 0; border: none; border-top: 1px solid #e2e8f0;">
    <div>
      <h5 style="color: #0284c7; margin-bottom: 8px;"><i class="fa-solid fa-layer-group"></i> 3. Kriteria Target Bertingkat (Tiering & Rates):</h5>
      ${tierHTML}
    </div>
  `;

  openModal("modal-campaign-detail");
}

let currentFormTiersData = [];
let currentFormEligibleGroups = [];
let currentFormEligibleStores = [];
let currentFormEligibleSkus = [];

function renderCampaignEligibleSkuRows() {
  const container = document.getElementById("container-sku-select-rows");
  if (!container) return;

  const products = window.db.getProducts() || [];
  const groups = window.db.getProductGroups() || [];
  container.innerHTML = "";

  if (!currentFormEligibleSkus || currentFormEligibleSkus.length === 0) {
    container.innerHTML = `
      <div style="background:#f1f5f9; padding:8px 12px; border-radius:6px; color:#475569; font-size:0.83rem; text-align:center;">
        <i class="fa-solid fa-check-circle" style="color:#16a34a;"></i> <strong>Semua Kode SKU Produk</strong> (Tanpa pembatasan SKU khusus)
      </div>
    `;
    return;
  }

  currentFormEligibleSkus.forEach((selectedSkuId, rowIdx) => {
    let selectOptions = `<option value="">-- Pilih SKU Produk --</option>`;
    selectOptions += products.map(p => {
      const grp = groups.find(g => g.id === p.groupId);
      const grpCode = grp ? grp.groupCode : p.groupId;
      return `<option value="${p.id}" ${selectedSkuId === p.id ? 'selected' : ''}>SKU: ${p.productCode} - ${p.productName} (${grpCode})</option>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "eligible-sku-item-row";
    row.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;";
    row.innerHTML = `
      <select class="form-select form-select-sm eligible-sku-select" style="flex: 1; font-size: 0.85rem;" onchange="syncEligibleSkusFromDOM()">
        ${selectOptions}
      </select>
      <button type="button" class="btn btn-danger btn-sm" style="padding: 3px 8px; font-size: 0.78rem;" onclick="removeEligibleSkuRowFromForm(${rowIdx})" title="Hapus SKU Ini">
        <i class="fa-solid fa-xmark"></i> Hapus
      </button>
    `;
    container.appendChild(row);
  });
}

function addEligibleSkuRowToForm() {
  syncEligibleSkusFromDOM();
  currentFormEligibleSkus.push("");
  renderCampaignEligibleSkuRows();
}

function removeEligibleSkuRowFromForm(rowIdx) {
  syncEligibleSkusFromDOM();
  currentFormEligibleSkus.splice(rowIdx, 1);
  renderCampaignEligibleSkuRows();
}

function syncEligibleSkusFromDOM() {
  const selects = document.querySelectorAll("#container-sku-select-rows .eligible-sku-select");
  const result = [];
  selects.forEach(sel => {
    const val = sel.value;
    if (val) {
      result.push(val);
    }
  });
  currentFormEligibleSkus = result;
}

function renderCampaignEligibleStoreRows() {
  const container = document.getElementById("container-store-rows-list");
  if (!container) return;

  const stores = window.db.getStores() || [];
  container.innerHTML = "";

  if (!currentFormEligibleStores || currentFormEligibleStores.length === 0) {
    container.innerHTML = `
      <div style="background:#f1f5f9; padding:8px 12px; border-radius:6px; color:#475569; font-size:0.83rem; text-align:center;">
        <i class="fa-solid fa-info-circle" style="color:#0284c7;"></i> Belum ada toko terpilih. Klik tombol <strong>"+ Tambah Toko"</strong> di atas untuk menambahkan toko.
      </div>
    `;
    return;
  }

  currentFormEligibleStores.forEach((selectedStoreId, rowIdx) => {
    let selectOptions = `<option value="">-- Pilih Toko --</option>`;
    selectOptions += stores.map(s => {
      const isEligible = s.isCampaignEligible !== false;
      const exNote = !isEligible ? " [Excluded System]" : "";
      return `<option value="${s.id}" ${selectedStoreId === s.id ? 'selected' : ''}>${s.storeCode} - ${s.storeName} (${s.region || 'All Region'})${exNote}</option>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "eligible-store-item-row";
    row.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;";
    row.innerHTML = `
      <select class="form-select form-select-sm eligible-store-select" style="flex: 1; font-size: 0.85rem;" onchange="syncEligibleStoresFromDOM()">
        ${selectOptions}
      </select>
      <button type="button" class="btn btn-danger btn-sm" style="padding: 3px 8px; font-size: 0.78rem;" onclick="removeEligibleStoreRowFromForm(${rowIdx})" title="Hapus Toko Ini">
        <i class="fa-solid fa-xmark"></i> Hapus
      </button>
    `;
    container.appendChild(row);
  });
}

function addEligibleStoreRowToForm() {
  syncEligibleStoresFromDOM();
  currentFormEligibleStores.push("");
  renderCampaignEligibleStoreRows();
}

function removeEligibleStoreRowFromForm(rowIdx) {
  syncEligibleStoresFromDOM();
  currentFormEligibleStores.splice(rowIdx, 1);
  renderCampaignEligibleStoreRows();
}

function syncEligibleStoresFromDOM() {
  const selects = document.querySelectorAll("#container-store-rows-list .eligible-store-select");
  const result = [];
  selects.forEach(sel => {
    const val = sel.value;
    if (val) {
      result.push(val);
    }
  });
  currentFormEligibleStores = result;
}

function renderCampaignEligibleGroupRows() {
  const container = document.getElementById("container-group-select-rows");
  if (!container) return;

  const productGroups = window.db.getProductGroups() || [];
  container.innerHTML = "";

  if (!currentFormEligibleGroups || currentFormEligibleGroups.length === 0) {
    container.innerHTML = `
      <div style="background:#f1f5f9; padding:8px 12px; border-radius:6px; color:#475569; font-size:0.83rem; text-align:center;">
        <i class="fa-solid fa-check-circle" style="color:#16a34a;"></i> <strong>Semua Group Produk</strong> (Tanpa pembatasan group khusus)
      </div>
    `;
    return;
  }

  currentFormEligibleGroups.forEach((selectedGrpId, rowIdx) => {
    let selectOptions = `<option value="">-- Pilih Group Produk --</option>`;
    selectOptions += productGroups.map(g => `<option value="${g.id}" ${selectedGrpId === g.id ? 'selected' : ''}>${g.groupCode} - ${g.groupName}</option>`).join("");

    const row = document.createElement("div");
    row.className = "eligible-group-item-row";
    row.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;";
    row.innerHTML = `
      <select class="form-select form-select-sm eligible-group-select" style="flex: 1; font-size: 0.85rem;" onchange="syncEligibleGroupsFromDOM()">
        ${selectOptions}
      </select>
      <button type="button" class="btn btn-danger btn-sm" style="padding: 3px 8px; font-size: 0.78rem;" onclick="removeEligibleGroupRowFromForm(${rowIdx})" title="Hapus Group Ini">
        <i class="fa-solid fa-xmark"></i> Hapus
      </button>
    `;
    container.appendChild(row);
  });
}

function addEligibleGroupRowToForm() {
  syncEligibleGroupsFromDOM();
  currentFormEligibleGroups.push("");
  renderCampaignEligibleGroupRows();
}

function removeEligibleGroupRowFromForm(rowIdx) {
  syncEligibleGroupsFromDOM();
  currentFormEligibleGroups.splice(rowIdx, 1);
  renderCampaignEligibleGroupRows();
}

function syncEligibleGroupsFromDOM() {
  const selects = document.querySelectorAll("#container-group-select-rows .eligible-group-select");
  const result = [];
  selects.forEach(sel => {
    const val = sel.value;
    if (val) {
      result.push(val);
    }
  });
  currentFormEligibleGroups = result;
}

function renderCampaignTierBoxes() {
  const container = document.getElementById("campaign-tiers-container");
  if (!container) return;

  const productGroups = window.db.getProductGroups() || [];
  const basisVal = document.getElementById("cmp-basis")?.value || "QTY";

  container.innerHTML = "";

  if (currentFormTiersData.length === 0) {
    currentFormTiersData = [
      { level: 1, tierName: "Tier 1 Target Minimum", minQty: 30, minOmzet: 50000000, fixedVoucherAmount: 0, goodsName: "", goodsQty: 1, rates: [] },
      { level: 2, tierName: "Tier 2 Target Utama + Bonus", minQty: 50, minOmzet: 100000000, fixedVoucherAmount: 1000000, goodsName: "Kipas Angin Premium", goodsQty: 1, rates: [] },
      { level: 3, tierName: "Tier 3 Mega Target + Reward Top", minQty: 75, minOmzet: 200000000, fixedVoucherAmount: 2000000, goodsName: "Smart TV 43 Inch", goodsQty: 1, rates: [] }
    ];
  }

  currentFormTiersData.forEach((t, idx) => {
    const levelNum = idx + 1;
    t.level = levelNum;

    // Rates dynamic rows
    let rates = t.rates;
    if (!rates || !Array.isArray(rates)) {
      rates = [];
      t.rates = rates;
    }

    let ratesHTML = "";
    if (rates.length === 0) {
      ratesHTML = `<div style="background:#f8fafc; padding:8px 12px; border-radius:6px; color:#64748b; font-size:0.82rem; text-align:center; border:1px dashed #cbd5e1;">Belum ada rate insentif group yang ditambahkan untuk Tier ${levelNum}. Klik "+ Tambah Rate Insentif Group" jika ada.</div>`;
    } else {
      ratesHTML = rates.map((r, rateIdx) => {
        let grpOptions = `<option value="">-- Pilih Group Produk --</option>`;
          grpOptions += `<option value="ALL_GROUPS" ${r.groupId === "ALL_GROUPS" ? "selected" : ""}>-- SEMUA GROUP PRODUK --</option>`;
        grpOptions += productGroups.map(g => `<option value="${g.id}" ${r.groupId === g.id ? 'selected' : ''}>${g.groupCode} - ${g.groupName}</option>`).join("");

        return `
          <div class="tier-rate-item-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
              <select class="form-select form-select-sm tier-rate-group-id" style="flex: 2; font-size: 0.82rem;">
                ${grpOptions}
              </select>
              <select class="form-select form-select-sm tier-rate-calc-type" style="flex: 1.5; font-size: 0.82rem;">
                <option value="PER_UNIT_AMOUNT" ${r.calculationType === 'PER_UNIT_AMOUNT' || !r.calculationType ? 'selected' : ''}>Rp / Unit</option>
                <option value="PERCENTAGE_OF_OMZET" ${r.calculationType === 'PERCENTAGE_OF_OMZET' ? 'selected' : ''}>% dari Omzet</option>
              </select>
              <div style="display:flex; align-items:center; gap:4px;">
                <input type="number" step="any" class="form-control form-control-sm tier-rate-value" placeholder="0" value="${r.rateValue || 0}" style="width: 90px; font-size: 0.82rem;" title="Isi nominal atau persen">
              </div>
            <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="removeRateFromTier(${idx}, ${rateIdx})" title="Hapus Rate Ini">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        `;
      }).join("");
    }

    const tierThemes = [
      { bg: "#f0f9ff", border: "#bae6fd", accent: "#0284c7", titleColor: "#0369a1" }, // Tier 1: Soft Sky Blue
      { bg: "#f0fdf4", border: "#bbf7d0", accent: "#16a34a", titleColor: "#15803d" }, // Tier 2: Soft Emerald Green
      { bg: "#fffbeb", border: "#fde68a", accent: "#d97706", titleColor: "#b45309" }, // Tier 3: Soft Amber Gold
      { bg: "#faf5ff", border: "#e9d5ff", accent: "#9333ea", titleColor: "#7e22ce" }, // Tier 4: Soft Purple
      { bg: "#fff1f2", border: "#fecdd3", accent: "#e11d48", titleColor: "#be123c" }, // Tier 5: Soft Rose
      { bg: "#f0fdfa", border: "#99f6e4", accent: "#0d9488", titleColor: "#0f766e" }  // Tier 6+: Soft Teal
    ];
    const theme = tierThemes[idx % tierThemes.length];

    const tierBox = document.createElement("div");
    tierBox.className = "tier-box";
    tierBox.setAttribute("data-tier-index", idx);
    tierBox.style.cssText = `background: ${theme.bg}; padding: 16px; border-radius: 8px; border: 1px solid ${theme.border}; border-left: 5px solid ${theme.accent}; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);`;

    // Standard goods items setup
    let items = t.goodsItems;
    if (!items || !Array.isArray(items) || items.length === 0) {
      if (t.goodsName || t.goodsDescription) {
        items = [{ name: t.goodsName || t.goodsDescription, qty: t.goodsQty || 1 }];
      } else {
        items = [{ name: "", qty: 1 }];
      }
      t.goodsItems = items;
    }

    let goodsItemsHTML = items.map((item, itemIdx) => {
      return `
        <div class="goods-item-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
          <input type="text" class="form-control form-control-sm goods-item-name" placeholder="Nama Barang (Contoh: Emas Logam Mulia / Air Fryer)" value="${item.name || ''}" style="flex: 2; font-size: 0.82rem;">
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" step="any" min="0" class="form-control form-control-sm goods-item-qty" placeholder="Qty / Gram" value="${item.qty || 1}" style="width: 80px; font-size: 0.82rem;">
            <span style="font-size:0.75rem; color:#64748b;">Qty</span>
          </div>
          ${items.length > 1 ? `
            <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="removeGoodsItemFromTier(${idx}, ${itemIdx})" title="Hapus Barang Ini">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join("");

    // Consistency goods items setup
    let cItems = t.consistencyGoodsItems;
    if (!cItems || !Array.isArray(cItems) || cItems.length === 0) {
      cItems = [{ name: "", qty: 1 }];
      t.consistencyGoodsItems = cItems;
    }

    let consistencyGoodsItemsHTML = cItems.map((cItem, cItemIdx) => {
      return `
        <div class="consistency-goods-item-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
          <input type="text" class="form-control form-control-sm consistency-goods-item-name" placeholder="Nama Barang Konsistensi (Contoh: Emas 0.5 Gram)" value="${cItem.name || ''}" style="flex: 2; font-size: 0.82rem;">
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" step="any" min="0" class="form-control form-control-sm consistency-goods-item-qty" placeholder="Qty / Gram" value="${cItem.qty || 1}" style="width: 80px; font-size: 0.82rem;">
            <span style="font-size:0.75rem; color:#64748b;">Qty</span>
          </div>
          ${cItems.length > 1 ? `
            <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="removeConsistencyGoodsItemFromTier(${idx}, ${cItemIdx})" title="Hapus Barang Konsistensi Ini">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join("");

    // Bundling requirements items setup
    let bItems = t.bundlingItems;
    if (!bItems || !Array.isArray(bItems) || bItems.length === 0) {
      bItems = [{ itemCode: "", minQty: 5 }];
      t.bundlingItems = bItems;
    }

    const allProducts = window.db.getProducts() || [];
    const allGroups = window.db.getProductGroups() || [];

    let bundlingItemsHTML = bItems.map((bItem, bIdx) => {
      let selectOptions = `<option value="">-- Pilih SKU atau Group Produk --</option>`;
      selectOptions += `<optgroup label="Kode SKU Produk">`;
      selectOptions += allProducts.map(p => `<option value="${p.productCode}" ${bItem.itemCode === p.productCode ? 'selected' : ''}>SKU: ${p.productCode} - ${p.productName}</option>`).join("");
      selectOptions += `</optgroup>`;
      selectOptions += `<optgroup label="Group / Type Produk">`;
      selectOptions += allGroups.map(g => `<option value="${g.groupCode}" ${bItem.itemCode === g.groupCode ? 'selected' : ''}>Group: ${g.groupCode} - ${g.groupName}</option>`).join("");
      selectOptions += `</optgroup>`;

      return `
        <div class="bundling-item-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; background: white; padding: 6px 10px; border-radius: 6px; border: 1px solid #fde68a;">
          <div style="flex: 2;">
            <select class="form-select form-select-sm bundling-item-code" style="font-size: 0.82rem;">
              ${selectOptions}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:0.78rem; color:#78350f; font-weight:600;">Min:</span>
            <input type="number" step="any" min="1" class="form-control form-control-sm bundling-item-min-qty" placeholder="5" value="${bItem.minQty || 5}" style="width: 80px; font-size: 0.82rem;">
            <span style="font-size:0.75rem; color:#64748b;">Poin</span>
          </div>
          ${bItems.length > 1 ? `
            <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="removeBundlingItemFromTier(${idx}, ${bIdx})" title="Hapus Syarat SKU Ini">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join("");

    tierBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed ${theme.border};">
        <div style="font-weight: bold; color: ${theme.titleColor}; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
          <span style="background: ${theme.accent}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: bold;">
            Tier Level ${levelNum}
          </span>
          <i class="fa-solid fa-medal" style="color: ${theme.accent};"></i> Pengaturan Tier ${levelNum}
        </div>
        ${currentFormTiersData.length > 1 ? `
          <button type="button" class="btn btn-danger btn-sm" onclick="removeTierFromForm(${idx})">
            <i class="fa-solid fa-trash"></i> Hapus Tier
          </button>
        ` : ''}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label class="form-label">Nama Tier</label>
          <input type="text" class="form-control tier-input-name" value="${t.tierName || 'Tier ' + levelNum}" required>
        </div>
        <div class="container-tier-qty" style="${basisVal === 'OMZET' ? 'display:none;' : ''}">
          <label class="form-label">Target Min Qty Total (Unit/Poin)</label>
          <input type="number" class="form-control tier-input-qty" value="${t.minQty || 0}" placeholder="30">
        </div>
        <div class="container-tier-omzet" style="${basisVal === 'QTY' ? 'display:none;' : ''}">
          <label class="form-label" style="color:#d97706;">Target Min Omzet (Rp)</label>
          <input type="number" class="form-control tier-input-omzet" value="${t.minOmzet || 0}" placeholder="50000000">
        </div>
      </div>

      <!-- SYARAT BUNDLING PER SKU / GROUP (PAKET WAJIB MINIMAL) -->
      <div style="background: #fffbeb; padding: 12px; border-radius: 6px; border: 1px solid #fde68a; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
          <label class="form-label" style="color: #b45309; font-weight: bold; margin-bottom: 0; font-size: 0.88rem;">
            <i class="fa-solid fa-boxes-packing"></i> Syarat Paket Bundling (Wajib Minimal Masing-Masing SKU/Group):
          </label>
          <label style="font-size: 0.82rem; color: #b45309; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; margin: 0;">
            <input type="checkbox" class="tier-input-bundling-active" onchange="toggleBundlingBox(${idx})" ${t.hasBundlingRequirements ? 'checked' : ''}>
            <span>Aktifkan Syarat Bundling Tier ${levelNum}</span>
          </label>
        </div>

        <div class="tier-bundling-details" id="tier-bundling-details-${idx}" style="${t.hasBundlingRequirements ? '' : 'display: none;'} margin-top: 10px; border-top: 1px dashed #fde68a; padding-top: 10px;">
          <div style="font-size:0.8rem; color:#78350f; margin-bottom:8px; background:white; padding:6px 10px; border-radius:4px; border:1px solid #fde68a;">
            <i class="fa-solid fa-circle-info"></i> Toko HANYA lolos tier & dapat kelipatan reward jika <strong>seluruh SKU/Group di bawah ini memenuhi syarat minimalnya</strong>. Kelipatan reward dihitung berdasarkan paket terkecil yang lengkap.
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label class="form-label" style="margin-bottom:0; font-weight:bold; color:#b45309; font-size:0.82rem;">
              <i class="fa-solid fa-list-check"></i> Daftar SKU / Group Wajib Paket Bundling:
            </label>
            <button type="button" class="btn btn-warning btn-sm" style="padding: 3px 9px; font-size: 0.78rem; background:#d97706; color:white; border:none;" onclick="addBundlingItemToTier(${idx})">
              <i class="fa-solid fa-plus"></i> Tambah SKU/Group Wajib
            </button>
          </div>

          <div class="bundling-items-list" id="bundling-items-list-${idx}">
            ${bundlingItemsHTML}
          </div>
        </div>
      </div>

      <!-- RATE INCENTIVE PER TYPE / PRODUCT GROUP -->
      <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <label class="form-label" style="color:#0f172a; margin-bottom: 0; font-weight:bold; font-size:0.88rem;">
            <i class="fa-solid fa-coins" style="color:#0284c7;"></i> Rate Insentif per Unit untuk Type/Group Produk:
          </label>
          <button type="button" class="btn btn-primary btn-sm" style="padding: 3px 9px; font-size: 0.78rem;" onclick="addRateToTier(${idx})">
            <i class="fa-solid fa-plus"></i> Tambah Rate Insentif Group
          </button>
        </div>
        <div class="tier-rates-list" id="tier-rates-list-${idx}">
          ${ratesHTML}
        </div>
        <small style="color:#64748b; font-size:0.78rem; display:block; margin-top:6px;">
          <i class="fa-solid fa-info-circle"></i> Tambahkan rate insentif rupiah per unit untuk group produk tertentu yang berlaku pada Tier ${levelNum}.
        </small>
      </div>

      <!-- BONUS TETAP VOUCHER & HADIAH BARANG MULTI-ITEM -->
      <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 12px;">
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 14px; align-items: start;">
          <div>
            <label class="form-label" style="color:#0f172a; font-weight:bold;"><i class="fa-solid fa-money-bill-wave" style="color:#b45309;"></i> Bonus Voucher / Cash (Rp)</label>
            <input type="number" class="form-control tier-input-voucher" value="${t.fixedVoucherAmount ? t.fixedVoucherAmount : ''}" placeholder="0">
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin-bottom:0; font-weight:bold; color:#15803d; font-size:0.85rem;">
                <i class="fa-solid fa-gift"></i> Hadiah Barang / Produk (Dapat Multi-Jenis):
              </label>
              <button type="button" class="btn btn-primary btn-sm" style="padding: 3px 9px; font-size: 0.78rem;" onclick="addGoodsItemToTier(${idx})">
                <i class="fa-solid fa-plus"></i> Tambah Barang
              </button>
            </div>

            <div class="goods-items-list" id="goods-items-list-${idx}">
              ${goodsItemsHTML}
            </div>
          </div>
        </div>
      </div>

      <!-- REWARD BONUS TAMBAHAN -->
      <div style="background: #f0fdf4; padding: 12px; border-radius: 6px; border: 1px solid #86efac;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
          <label class="form-label" style="color: #16a34a; font-weight: bold; margin-bottom: 0; font-size: 0.88rem;">
            <i class="fa-solid fa-gift"></i> Pengaturan Bonus Tambahan Tier ${levelNum}:
          </label>
          <label style="font-size: 0.82rem; color: #15803d; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; margin: 0;">
            <input type="checkbox" class="tier-input-consistency-active" onchange="toggleConsistencyBox(${idx})" ${t.hasConsistencyBonus ? 'checked' : ''}>
            <span>Aktifkan Bonus Tambahan Tier ${levelNum}</span>
          </label>
        </div>

        <div class="tier-consistency-details" id="tier-consistency-details-${idx}" style="${t.hasConsistencyBonus ? '' : 'display: none;'} margin-top: 10px; border-top: 1px dashed #bbf7d0; padding-top: 10px;">
          
          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-bottom: 12px; background: white; padding: 10px; border-radius: 6px; border: 1px solid #bbf7d0;">
            <div>
              <label style="font-size: 0.82rem; color: #15803d; font-weight: bold; display: block; margin-bottom: 4px;">
                <i class="fa-solid fa-list-check"></i> Jenis Syarat Bonus Tambahan:
              </label>
              <select class="form-select btn-sm tier-input-bonus-type" onchange="toggleBonusTypeFields(${idx})" style="font-size: 0.82rem; font-weight: 600; color: #15803d;">
                <option value="MONTHLY_CONSISTENCY" ${t.bonusType === 'PERIOD_TOTAL' ? '' : 'selected'}>&#128197; Syarat Minimal Per Bulan (Konsistensi Bulanan)</option>
                <option value="PERIOD_TOTAL" ${t.bonusType === 'PERIOD_TOTAL' ? 'selected' : ''}>&#128200; Syarat Minimal Total Selama Periode (Total Akumulasi)</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.82rem; color: #15803d; font-weight: bold; display: block; margin-bottom: 4px;">
                <i class="fa-solid fa-calculator"></i> Kelipatan Bonus Tambahan:
              </label>
              <select class="form-select btn-sm tier-input-consistency-multiplier" style="font-size: 0.82rem;">
                <option value="false" ${!t.isConsistencyMultiplier ? 'selected' : ''}>1 Kali Saja (Flat / Tidak Berkelipatan)</option>
                <option value="true" ${t.isConsistencyMultiplier ? 'selected' : ''}>Berlaku Kelipatan (Mengikuti Target Multiplier)</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="container-tier-qty" style="${basisVal === 'OMZET' ? 'display:none;' : ''}">
              <label class="form-label lbl-bonus-qty-${idx}" style="font-size:0.82rem; color:#15803d;">
                ${t.bonusType === 'PERIOD_TOTAL' ? 'Target Min Qty Total Periode (Unit)' : 'Target Min Qty per Bulan (Unit)'}
              </label>
              <input type="number" class="form-control form-control-sm tier-input-consistency-qty" value="${t.consistencyMinQty || 0}" placeholder="Contoh: 10">
            </div>
            <div class="container-tier-omzet" style="${basisVal === 'QTY' ? 'display:none;' : ''}">
              <label class="form-label lbl-bonus-omzet-${idx}" style="font-size:0.82rem; color:#15803d;">
                ${t.bonusType === 'PERIOD_TOTAL' ? 'Target Min Poin Total Periode' : 'Target Min Poin per Bulan'}
              </label>
              <input type="number" class="form-control form-control-sm tier-input-consistency-omzet" value="${t.consistencyMinOmzet || 0}" placeholder="Contoh: 100">
            </div>
            <div>
              <label class="form-label" style="font-size:0.82rem; color:#15803d;">Bonus Cash / Voucher (Rp)</label>
              <input type="number" class="form-control form-control-sm tier-input-consistency-voucher" value="${t.consistencyVoucherAmount ? t.consistencyVoucherAmount : ''}" placeholder="0">
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin-bottom:0; font-weight:bold; color:#15803d; font-size:0.82rem;">
                <i class="fa-solid fa-gift"></i> Hadiah Barang Bonus Tambahan (Bisa Multi-Item):
              </label>
              <button type="button" class="btn btn-success btn-sm" style="padding: 3px 9px; font-size: 0.78rem;" onclick="addConsistencyGoodsItemToTier(${idx})">
                <i class="fa-solid fa-plus"></i> Tambah Barang Bonus
              </button>
            </div>

            <div class="consistency-goods-items-list" id="consistency-goods-items-list-${idx}">
              ${consistencyGoodsItemsHTML}
            </div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(tierBox);
  });
}

function addRateToTier(tierIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx]) {
    if (!currentFormTiersData[tierIdx].rates) {
      currentFormTiersData[tierIdx].rates = [];
    }
    currentFormTiersData[tierIdx].rates.push({
      groupId: "",
      calculationType: "PER_UNIT_AMOUNT",
      rateValue: 0
    });
  }
  renderCampaignTierBoxes();
}

function removeRateFromTier(tierIdx, rateIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx] && currentFormTiersData[tierIdx].rates) {
    currentFormTiersData[tierIdx].rates.splice(rateIdx, 1);
  }
  renderCampaignTierBoxes();
}

function toggleBundlingBox(tierIdx) {
  const box = document.querySelector(`.tier-box[data-tier-index="${tierIdx}"]`);
  if (!box) return;
  const isChecked = box.querySelector(".tier-input-bundling-active")?.checked;
  const detailsEl = document.getElementById(`tier-bundling-details-${tierIdx}`);
  if (detailsEl) {
    detailsEl.style.display = isChecked ? "block" : "none";
  }
}

function addBundlingItemToTier(tierIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx]) {
    if (!currentFormTiersData[tierIdx].bundlingItems) {
      currentFormTiersData[tierIdx].bundlingItems = [];
    }
    currentFormTiersData[tierIdx].bundlingItems.push({ itemCode: "", minQty: 5 });
  }
  renderCampaignTierBoxes();
}

function removeBundlingItemFromTier(tierIdx, itemIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx] && currentFormTiersData[tierIdx].bundlingItems) {
    currentFormTiersData[tierIdx].bundlingItems.splice(itemIdx, 1);
  }
  renderCampaignTierBoxes();
}

function toggleBonusTypeFields(tierIdx) {
  const box = document.querySelector(`.tier-box[data-tier-index="${tierIdx}"]`);
  if (!box) return;
  const bType = box.querySelector(".tier-input-bonus-type")?.value || "MONTHLY_CONSISTENCY";
  const lblQty = box.querySelector(`.lbl-bonus-qty-${tierIdx}`);
  const lblOmzet = box.querySelector(`.lbl-bonus-omzet-${tierIdx}`);

  if (lblQty) {
    lblQty.textContent = bType === "PERIOD_TOTAL" ? "Target Min Qty Total Periode (Unit)" : "Target Min Qty per Bulan (Unit)";
  }
  if (lblOmzet) {
    lblOmzet.textContent = bType === "PERIOD_TOTAL" ? "Target Min Poin Total Periode" : "Target Min Poin per Bulan";
  }
}

function toggleConsistencyBox(tierIdx) {
  const box = document.querySelector(`.tier-box[data-tier-index="${tierIdx}"]`);
  if (!box) return;
  const isChecked = box.querySelector(".tier-input-consistency-active")?.checked;
  const detailsEl = document.getElementById(`tier-consistency-details-${tierIdx}`);
  if (detailsEl) {
    detailsEl.style.display = isChecked ? "block" : "none";
  }
}

function addGoodsItemToTier(tierIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx]) {
    if (!currentFormTiersData[tierIdx].goodsItems) {
      currentFormTiersData[tierIdx].goodsItems = [];
    }
    currentFormTiersData[tierIdx].goodsItems.push({ name: "", qty: 1 });
  }
  renderCampaignTierBoxes();
}

function removeGoodsItemFromTier(tierIdx, itemIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx] && currentFormTiersData[tierIdx].goodsItems) {
    currentFormTiersData[tierIdx].goodsItems.splice(itemIdx, 1);
  }
  renderCampaignTierBoxes();
}

function addConsistencyGoodsItemToTier(tierIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx]) {
    if (!currentFormTiersData[tierIdx].consistencyGoodsItems) {
      currentFormTiersData[tierIdx].consistencyGoodsItems = [];
    }
    currentFormTiersData[tierIdx].consistencyGoodsItems.push({ name: "", qty: 1 });
  }
  renderCampaignTierBoxes();
}

function removeConsistencyGoodsItemFromTier(tierIdx, itemIdx) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData[tierIdx] && currentFormTiersData[tierIdx].consistencyGoodsItems) {
    currentFormTiersData[tierIdx].consistencyGoodsItems.splice(itemIdx, 1);
  }
  renderCampaignTierBoxes();
}

function syncCurrentFormTiersFromDOM() {
  const boxes = document.querySelectorAll("#campaign-tiers-container .tier-box");
  if (!boxes || boxes.length === 0) return;

  const newTiers = [];
  boxes.forEach((box, idx) => {
    const nameVal = box.querySelector(".tier-input-name")?.value.trim() || `Tier ${idx + 1}`;
    const qtyVal = parseInt(box.querySelector(".tier-input-qty")?.value || "0");
    const omzetVal = parseFloat(box.querySelector(".tier-input-omzet")?.value || "0");
    const voucherVal = parseFloat(box.querySelector(".tier-input-voucher")?.value || "0");

    // Gather multi-item goods rows
    const goodsRows = box.querySelectorAll(".goods-item-row");
    const goodsItems = [];
    goodsRows.forEach(row => {
      const gName = row.querySelector(".goods-item-name")?.value.trim() || "";
      const gQty = parseFloat(row.querySelector(".goods-item-qty")?.value || "1");
      if (gName) {
        goodsItems.push({ name: gName, qty: gQty });
      }
    });

    const goodsDescription = goodsItems.map(g => formatGoodsItemString(g.name, g.qty)).join(" + ");
    const goodsNameVal = goodsItems.length > 0 ? goodsItems[0].name : "";
    const goodsQtyVal = goodsItems.length > 0 ? goodsItems[0].qty : 0;

    // Bundling requirements items
    const hasBundling = box.querySelector(".tier-input-bundling-active")?.checked || false;
    const bRows = box.querySelectorAll(".bundling-item-row");
    const bundlingItems = [];
    bRows.forEach(row => {
      const bCode = row.querySelector(".bundling-item-code")?.value.trim() || "";
      const bMinQ = parseFloat(row.querySelector(".bundling-item-min-qty")?.value || "1");
      if (bCode) {
        bundlingItems.push({ itemCode: bCode, minQty: bMinQ });
      }
    });
    const hasConsistency = box.querySelector(".tier-input-consistency-active")?.checked || false;
    const bonusTypeVal = box.querySelector(".tier-input-bonus-type")?.value || "MONTHLY_CONSISTENCY";
    const isCMultiplier = box.querySelector(".tier-input-consistency-multiplier")?.value === "true";
    const cMinQty = parseInt(box.querySelector(".tier-input-consistency-qty")?.value || "0");
    const cMinOmzet = parseFloat(box.querySelector(".tier-input-consistency-omzet")?.value || "0");
    const cVoucher = parseFloat(box.querySelector(".tier-input-consistency-voucher")?.value || "0");

    const cGoodsRows = box.querySelectorAll(".consistency-goods-item-row");
    const consistencyGoodsItems = [];
    cGoodsRows.forEach(row => {
      const cgName = row.querySelector(".consistency-goods-item-name")?.value.trim() || "";
      const cgQty = parseFloat(row.querySelector(".consistency-goods-item-qty")?.value || "1");
      if (cgName) {
        consistencyGoodsItems.push({ name: cgName, qty: cgQty });
      }
    });

    const rateRows = box.querySelectorAll(".tier-rate-item-row");
    const rates = [];
    rateRows.forEach(row => {
      const grpId = row.querySelector(".tier-rate-group-id")?.value || "";
      const calcType = row.querySelector(".tier-rate-calc-type")?.value || "PER_UNIT_AMOUNT";
      const val = parseFloat(row.querySelector(".tier-rate-value")?.value || "0");
      if (grpId) {
        rates.push({
          groupId: grpId,
          calculationType: calcType,
          rateValue: val
        });
      }
    });

    newTiers.push({
      id: "tier_" + (idx + 1) + "_" + Date.now(),
      level: idx + 1,
      tierName: nameVal,
      minQty: qtyVal,
      minOmzet: omzetVal,
      hasBundlingRequirements: hasBundling,
      bundlingItems: bundlingItems,
      fixedVoucherAmount: voucherVal,
      goodsItems: goodsItems,
      goodsName: goodsNameVal,
      goodsDescription: goodsDescription,
      goodsQty: goodsQtyVal,
      hasConsistencyBonus: hasConsistency,
      bonusType: bonusTypeVal,
      isConsistencyMultiplier: isCMultiplier,
      consistencyMinQty: cMinQty,
      consistencyMinOmzet: cMinOmzet,
      consistencyVoucherAmount: cVoucher,
      consistencyGoodsItems: consistencyGoodsItems,
      rates: rates
    });
  });

  currentFormTiersData = newTiers;
}

function addTierToForm() {
  syncCurrentFormTiersFromDOM();
  const nextLevel = currentFormTiersData.length + 1;
  const lastTier = currentFormTiersData[currentFormTiersData.length - 1];

  const defaultQty = lastTier ? lastTier.minQty + 25 : nextLevel * 25;
  const defaultOmzet = lastTier ? lastTier.minOmzet + 50000000 : nextLevel * 50000000;
  const defaultRates = lastTier && lastTier.rates ? lastTier.rates.map(r => ({ ...r })) : [];

  currentFormTiersData.push({
    id: "tier_" + nextLevel + "_" + Date.now(),
    level: nextLevel,
    tierName: `Tier ${nextLevel} Target Level ${nextLevel}`,
    minQty: defaultQty,
    minOmzet: defaultOmzet,
    fixedVoucherAmount: 0,
    goodsName: "",
    goodsDescription: "",
    goodsQty: 1,
    rates: defaultRates
  });

  renderCampaignTierBoxes();
}

function removeTierFromForm(index) {
  syncCurrentFormTiersFromDOM();
  if (currentFormTiersData.length <= 1) return;
  currentFormTiersData.splice(index, 1);
  renderCampaignTierBoxes();
}

function toggleProductFilterMode(mode) {
  const byGroup = document.getElementById("container-filter-by-group");
  const bySku = document.getElementById("container-filter-by-sku");
  if (mode === "BY_SKU") {
    if (byGroup) byGroup.style.display = "none";
    if (bySku) bySku.style.display = "block";
  } else {
    if (byGroup) byGroup.style.display = "block";
    if (bySku) bySku.style.display = "none";
  }
}

function populateProductSkuCheckboxes(selectedSkuIds = null) {
  const skusDiv = document.getElementById("checkboxes-product-skus");
  if (!skusDiv) return;
  skusDiv.innerHTML = "";
  const products = window.db.getProducts() || [];
  const groups = window.db.getProductGroups() || [];

  if (products.length === 0) {
    skusDiv.innerHTML = `<span style="color:#64748b; font-size:0.85rem;">Belum ada SKU Produk terdaftar di Master Data.</span>`;
    return;
  }

  products.forEach(p => {
    const grp = groups.find(g => g.id === p.groupId);
    const isChecked = selectedSkuIds === null || (Array.isArray(selectedSkuIds) && selectedSkuIds.includes(p.id));
    const grpCode = grp ? grp.groupCode : p.groupId;

    const label = document.createElement("label");
    label.style.cssText = "font-size:0.83rem; cursor:pointer; display:flex; align-items:center; gap:6px; background:white; padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1;";
    label.innerHTML = `
      <input type="checkbox" name="cmp-sku-cb" value="${p.id}" ${isChecked ? 'checked' : ''}>
      <span><code>${p.productCode}</code> - ${p.productName} <small style="color:#64748b;">(${grpCode})</small></span>
    `;
    skusDiv.appendChild(label);
  });
}

function filterProductSkuCheckboxes(keyword) {
  const term = (keyword || "").toLowerCase().trim();
  const labels = document.querySelectorAll("#checkboxes-product-skus label");
  labels.forEach(lbl => {
    const txt = lbl.textContent.toLowerCase();
    lbl.style.display = txt.includes(term) ? "flex" : "none";
  });
}

function selectAllProductSkus(check) {
  document.querySelectorAll("input[name='cmp-sku-cb']").forEach(cb => {
    if (cb.closest("label").style.display !== "none") {
      cb.checked = check;
    }
  });
}

function openAddCampaignModal() {
  document.getElementById("cmp-id").value = "";
  
  // Reset Eligible Store Rows
  currentFormEligibleStores = [];
  renderCampaignEligibleStoreRows();

  // Reset Eligible Product Groups
  currentFormEligibleGroups = [];
  renderCampaignEligibleGroupRows();

  // Reset Eligible Product SKUs
  currentFormEligibleSkus = [];
  renderCampaignEligibleSkuRows();

  // Reset Product Filter Mode
  const groupRadio = document.querySelector("input[name='cmp-product-filter-scope'][value='BY_GROUP']");
  if (groupRadio) groupRadio.checked = true;
  toggleProductFilterMode("BY_GROUP");

  document.getElementById("cmp-code").value = "CMP-" + new Date().getFullYear() + "-P" + Math.floor(Math.random()*100);
  document.getElementById("cmp-name").value = "";
document.getElementById("cmp-description").value = "";
  document.getElementById("cmp-start-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("cmp-end-date").value = "";
  document.getElementById("cmp-evaluation-period").value = "PURE_MONTHLY";
  document.getElementById("cmp-basis").value = "QTY";
  document.getElementById("cmp-is-multiplier").value = "true";
  document.getElementById("cmp-scope").value = "ALL_STORES";
  document.getElementById("cmp-status").value = "ACTIVE";

  // Default dynamic tiers
  currentFormTiersData = [
    { level: 1, tierName: "Tier 1 Target Minimum", minQty: 30, minOmzet: 50000000, fixedVoucherAmount: 0, goodsName: "", goodsQty: 1, rates: [] },
    { level: 2, tierName: "Tier 2 Target Utama + Bonus", minQty: 50, minOmzet: 100000000, fixedVoucherAmount: 0, goodsName: "", goodsQty: 1, rates: [] },
    { level: 3, tierName: "Tier 3 Mega Target + Reward Top", minQty: 75, minOmzet: 200000000, fixedVoucherAmount: 0, goodsName: "", goodsQty: 1, rates: [] }
  ];

  renderCampaignTierBoxes();
  toggleBasisFields("QTY");
  toggleStoreCheckboxes("ALL_STORES");

  // Reset Save Button State
  const saveBtn = document.getElementById("btn-save-campaign");
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Program Campaign`;
  }

  document.getElementById("modal-campaign-title").innerHTML = `<i class="fa-solid fa-bullhorn"></i> Pengaturan Master Program Campaign Baru`;
  openModal("modal-campaign");
}

function toggleCampaignStatus(id) {
  const c = window.db.getCampaignById(id);
  if (!c) return;
  const newStatus = c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  c.status = newStatus;
  window.db.saveCampaign(c);
  showToast(`Status campaign '${c.campaignCode}' diubah menjadi ${newStatus === 'ACTIVE' ? 'Aktif' : 'Non-Aktif'}!`, newStatus === "ACTIVE" ? "success" : "warning");
  renderCampaigns();
}

function editCampaign(id) {
  const c = window.db.getCampaignById(id);
  if (!c) return;

  // Render checkboxes first
  openAddCampaignModal();

  document.getElementById("cmp-id").value = c.id;
  document.getElementById("cmp-code").value = c.campaignCode || "";
  document.getElementById("cmp-name").value = c.campaignName || "";
document.getElementById("cmp-description").value = c.description || "";
  document.getElementById("cmp-start-date").value = c.startDate || "";
  document.getElementById("cmp-end-date").value = c.endDate || "";
  document.getElementById("cmp-evaluation-period").value = c.evaluationPeriod || "TOTAL";
  document.getElementById("cmp-basis").value = c.targetBasis || "QTY";
  document.getElementById("cmp-is-multiplier").value = c.isMultiplier ? "true" : "false";
  document.getElementById("cmp-scope").value = c.targetScope || "ALL_STORES";
    const mktInput = document.getElementById("cmp-eligible-market");
    if (mktInput) mktInput.value = c.eligibleMarket || "";
  document.getElementById("cmp-status").value = c.status || "ACTIVE";

  // Set Product Filter Mode
  const filterScope = c.productFilterScope || "BY_GROUP";
  const filterRadio = document.querySelector(`input[name='cmp-product-filter-scope'][value='${filterScope}']`);
  if (filterRadio) filterRadio.checked = true;
  toggleProductFilterMode(filterScope);

  // Populate store dropdown rows selection
  currentFormEligibleStores = (c.eligibleStoreIds && Array.isArray(c.eligibleStoreIds)) ? [...c.eligibleStoreIds] : [];
  renderCampaignEligibleStoreRows();

  // Populate eligible group rows selection
  currentFormEligibleGroups = (c.eligibleGroupIds && Array.isArray(c.eligibleGroupIds)) ? [...c.eligibleGroupIds] : [];
  renderCampaignEligibleGroupRows();

  // Populate eligible SKU rows selection
  currentFormEligibleSkus = (c.eligibleProductIds && Array.isArray(c.eligibleProductIds)) ? [...c.eligibleProductIds] : [];
  renderCampaignEligibleSkuRows();

  // Populate dynamic tiers from campaign object
  currentFormTiersData = (c.tiers && c.tiers.length > 0)
    ? JSON.parse(JSON.stringify(c.tiers))
    : [
        { level: 1, tierName: "Tier 1 Target Minimum", minQty: 30, minOmzet: 50000000, fixedVoucherAmount: 0, goodsName: "", goodsQty: 1, rates: [] }
      ];

  renderCampaignTierBoxes();
  toggleBasisFields(c.targetBasis || "QTY");
  toggleStoreCheckboxes(c.targetScope || "ALL_STORES");

  document.getElementById("modal-campaign-title").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Master Program Campaign: <strong>${c.campaignCode}</strong>`;
}

function deleteCampaign(id) {
  if (confirm("Apakah Anda yakin ingin menghapus program campaign ini?")) {
    window.db.deleteCampaign(id);
    showToast("Program Campaign berhasil dihapus", "warning");
    renderCampaigns();
    syncMasterDataToSupabaseCloudSilently();
  }
}

function toggleStoreCheckboxes(scopeVal) {
  const container = document.getElementById("container-store-select-rows");
    const marketContainer = document.getElementById("container-store-market");
  const lblTitle = document.getElementById("lbl-eligible-stores-title");
  const lblHint = document.getElementById("lbl-eligible-stores-hint");

  if (!container) return;

  if (marketContainer) {
      marketContainer.style.display = scopeVal === "BY_MARKET" ? "block" : "none";
    }
    if (scopeVal === "SELECTED_STORES" || scopeVal === "EXCLUDED_STORES") {
    container.style.display = "block";
    if (lblTitle) {
      if (scopeVal === "EXCLUDED_STORES") {
        lblTitle.innerHTML = `<i class="fa-solid fa-ban" style="color:#dc2626;"></i> Daftar Toko yang DIKECUALIKAN dari Campaign Ini:`;
      } else {
        lblTitle.innerHTML = `<i class="fa-solid fa-store" style="color:#0284c7;"></i> Daftar Toko Peserta Terpilih dalam Campaign Ini:`;
      }
    }
    if (lblHint) {
      if (scopeVal === "EXCLUDED_STORES") {
        lblHint.innerHTML = `<i class="fa-solid fa-info-circle"></i> Seluruh toko terdaftar AKAN diikutsertakan, KECUALI toko-toko yang ditambahkan di atas.`;
      } else {
        lblHint.innerHTML = `<i class="fa-solid fa-info-circle"></i> HANYA toko-toko yang ditambahkan di atas yang berhak mengikuti campaign ini.`;
      }
    }
  } else {
    container.style.display = "none";
  }
}

function openMonthlyClosingModal() {
  const sel = document.getElementById("closing-month-select");
  if (!sel) return;

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const monthSet = new Set();
  monthSet.add(currentMonthStr);

  const campaigns = window.db.getCampaigns() || [];
  campaigns.forEach(c => {
    if (c.startDate) {
      const m = normalizeDateForEngine(c.startDate).substring(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
    if (c.endDate) {
      const m = normalizeDateForEngine(c.endDate).substring(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
  });

  const sales = window.db.getSales() || [];
  sales.forEach(s => {
    if (s.transactionDate) {
      const m = normalizeDateForEngine(s.transactionDate).substring(0, 7);
      if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
  });

  const sortedMonths = Array.from(monthSet).sort().reverse();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  sel.innerHTML = "";
  sortedMonths.forEach(mStr => {
    const parts = mStr.split("-");
    if (parts.length === 2) {
      const yyyy = parts[0];
      const mmIdx = parseInt(parts[1], 10) - 1;
      const mName = monthNames[mmIdx] || parts[1];
      const isCurrent = (mStr === currentMonthStr);
      
      const opt = document.createElement("option");
      opt.value = mStr;
        opt.textContent = `Periode Bulan: ${mName} ${yyyy}${isCurrent ? ' (Bulan Berjalan)' : ''}`;
      sel.appendChild(opt);
    }
  });

  openModal("modal-monthly-closing");
}

function runCalculation() {
  openMonthlyClosingModal();
}

function toggleAccordion(itemId) {
  const item = document.getElementById(itemId);
  if (item) {
    item.classList.toggle("active");
  }
}

function filterStoreCheckboxes(keyword) {
  const term = keyword.toLowerCase().trim();
  const labels = document.querySelectorAll("#checkboxes-stores label");
  labels.forEach(lbl => {
    const txt = lbl.textContent.toLowerCase();
    lbl.style.display = txt.includes(term) ? "flex" : "none";
  });
}

function selectAllStores(check) {
  document.querySelectorAll("input[name='cmp-store-cb']").forEach(cb => {
    if (cb.closest("label").style.display !== "none") {
      cb.checked = check;
    }
  });
}

function selectAllGroups(check) {
  document.querySelectorAll("input[name='cmp-group-cb']").forEach(cb => {
    cb.checked = check;
  });
}

function toggleBasisFields(basisVal) {
  const basis = basisVal || document.getElementById("cmp-basis")?.value || "QTY";
  document.querySelectorAll(".container-tier-qty").forEach(el => {
    el.style.display = (basis === "OMZET" || basis === "POIN") ? "none" : "block";
  });
  document.querySelectorAll(".container-tier-omzet").forEach(el => {
    if (basis === "QTY") {
      el.style.display = "none";
    } else {
      el.style.display = "block";
      const lbl = el.querySelector("label");
      if (lbl) {
        lbl.textContent = basis === "OMZET" ? "Target Min Omzet Rupiah / DPP (Rp)" : "Target Min Poin (Qty x Poin Unit)";
      }
    }
  });
}

// --- RENDER USERS ---
function renderUsers() {
  const tbody = document.querySelector("#users-table tbody");
  tbody.innerHTML = "";
  
  // Sort users by username A-Z
  const sortedUsers = window.db.getUsers().sort((a, b) => {
    const nameA = String(a.username || "").toLowerCase();
    const nameB = String(b.username || "").toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  sortedUsers.forEach(u => {
    let roleBadge = `<span class="badge badge-info">${u.role}</span>`;
    if (u.role === 'SUPER_ADMIN') roleBadge = '<span class="badge badge-danger">SUPER ADMIN</span>';
    else if (u.role === 'MANAGER') roleBadge = '<span class="badge badge-warning">MANAGER</span>';
    else if (u.role === 'SALESMAN') roleBadge = '<span class="badge badge-primary"><i class="fa-solid fa-user-tie"></i> SALESMAN</span>';
    else if (u.role === 'SUPERVISOR') roleBadge = '<span class="badge badge-primary" style="background:#4f46e5;"><i class="fa-solid fa-user-shield"></i> SUPERVISOR</span>';

    const pwdVal = u.passwordHash || u.password || "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${u.username}</code></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="user-avatar-small" style="width: 28px; height: 28px; background: #0ea5e9; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">${String(u.fullname || u.username).charAt(0).toUpperCase()}</div>
          <span>${u.fullname || u.username}</span>
        </div>
      </td>
      <td>${roleBadge}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="pwd-text-${u.id}" style="font-family: monospace; font-weight: bold; color: #0284c7;">        </span>
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" title="Tampilkan / Sembunyikan Password" onclick="toggleUserPasswordRow('${u.id}', '${pwdVal}')">
            <i class="fa-solid fa-eye" id="pwd-icon-${u.id}"></i>
          </button>
          <button class="btn btn-secondary btn-sm" title="Edit Data User" onclick="editUser('${u.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm" title="Hapus User" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    if (u.isActive === false) tr.style.opacity = "0.5";
    tbody.appendChild(tr);
    });

    if (typeof genericTableSortState !== 'undefined' && genericTableSortState['users-table']?.colIndex >= 0) {
    applyTableSort('users-table', genericTableSortState['users-table'].colIndex, genericTableSortState['users-table'].isAsc);
  }
}

function toggleUserPasswordRow(id, actualPassword) {
  const span = document.getElementById(`pwd-text-${id}`);
  const icon = document.getElementById(`pwd-icon-${id}`);
  if (!span || !icon) return;

  if (span.textContent === "••••••••") {
    span.textContent = actualPassword || "(Kosong)";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    span.textContent = "••••••••";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

function toggleModalPasswordType() {
  const input = document.getElementById("user-password");
  const icon = document.getElementById("modal-pwd-icon");
  if (!input || !icon) return;

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

function openAddUserModal() {
  document.getElementById("user-id").value = "";
  document.getElementById("user-username").value = "";
  document.getElementById("user-password").value = "";
  document.getElementById("user-fullname").value = "";
  document.getElementById("user-role").value = "TOKO";

  populateStoreSelect("user-store-id");
  document.getElementById("user-store-id").value = "";

  document.getElementById("modal-user-title").innerHTML = `<i class="fa-solid fa-user-plus"></i> Registrasi User Baru`;
  openModal("modal-user");
}

function editUser(id) {
  const u = window.db.getUsers().find(user => user.id === id);
  if (!u) return;

  document.getElementById("user-id").value = u.id;
  document.getElementById("user-username").value = u.username;
  document.getElementById("user-password").value = u.passwordHash || u.password || "";
  document.getElementById("user-fullname").value = u.fullname;
  document.getElementById("user-role").value = u.role || "TOKO";

  populateStoreSelect("user-store-id");
  document.getElementById("user-store-id").value = u.storeId || "";

  document.getElementById("modal-user-title").innerHTML = `<i class="fa-solid fa-user-pen"></i> Edit Data User & Password: <strong>${u.username}</strong>`;
  openModal("modal-user");
}

async function syncMasterDataToSupabaseCloudSilently() {
  try {
    let config = null;
    if (window.db && typeof window.db.getSupabaseConfig === "function") {
      config = window.db.getSupabaseConfig();
    }
    if (!config) {
      const cfgStr = localStorage.getItem("CAMPAIGN_SUPABASE_CONFIG");
      if (cfgStr) try { config = JSON.parse(cfgStr); } catch(e){}
    }
    if (!config || !config.url || !config.anonKey) return;

    const systemUsers = (window.db ? window.db.getUsers() : []).map(u => ({
      id: u.id,
      username: u.username,
      passwordHash: u.passwordHash || u.password || "",
      fullname: u.fullname,
      role: u.role,
      storeId: u.storeId || null,
      storeIds: u.storeIds || [],
      isActive: u.isActive !== false,
      updatedAt: u.updatedAt || u.createdAt || new Date().toISOString()
    }));

    const systemProducts = window.db ? (typeof window.db.getProducts === "function" ? window.db.getProducts() : []) : [];
    const systemStores = window.db ? (typeof window.db.getStores === "function" ? window.db.getStores() : []) : [];
    const systemGroups = window.db ? (typeof window.db.getProductGroups === "function" ? window.db.getProductGroups() : []) : [];
    const systemCampaigns = window.db ? (typeof window.db.getCampaigns === "function" ? window.db.getCampaigns() : []) : [];

    const payloadRow = {
      id: "_users_config_row",
      snapshot_month: "ALL",
      calc_mode: "CUMULATIVE",
      store_code: "_USERS_CONFIG",
      store_name: "System Master Data Configuration",
      region: "ALL",
      salesman_name: "SYSTEM",
      campaign_code: "_SYSTEM_",
      campaign_name: "System Configuration",
      target_basis: "SYSTEM",
      matched_tier_level: 0,
      matched_tier_name: "SYSTEM",
      progress_percentage: 100,
      gap_description: "SYSTEM",
      total_qty: 0,
      total_omzet: 0,
      total_reward_value: 0,
      goods_description: "",
      sku_breakdown: { 
        users: systemUsers,
        products: systemProducts,
        stores: systemStores,
        productGroups: systemGroups,
        campaigns: systemCampaigns
      },
      updated_at: new Date().toISOString()
    };

    const cleanUrl = config.url.replace(/\/+$/, "");
    await fetch(`${cleanUrl}/rest/v1/${config.tableName || 'dashboard_snapshots'}`, {
      method: "POST",
      headers: {
        "apikey": config.anonKey,
        "Authorization": `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify([payloadRow])
    });
  } catch(e) {
    console.warn("Auto background sync users to Supabase error:", e);
  }
}

function deleteUser(id) {
  if (confirm("Apakah Anda yakin ingin menghapus user ini?")) {
    window.db.deleteUser(id);
    showToast("User berhasil dihapus", "success");
    renderUsers();
    syncMasterDataToSupabaseCloudSilently();
  }
}

// --- GENERIC TABLE SORTING LOGIC ---
let genericTableSortState = {};

function initSortableTables() {
  const tableIds = ["master-stores-table", "master-groups-table", "master-products-table", "users-table", "campaigns-table", "dashboard-table", "achievements-full-table"];
  
  tableIds.forEach(tableId => {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    genericTableSortState[tableId] = { colIndex: -1, isAsc: true };
    
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, index) => {
      const thText = th.textContent.trim().toLowerCase();
      if (thText === 'aksi' || thText === '') return;
      
      th.style.cursor = 'pointer';
      th.title = 'Klik untuk mengurutkan kolom ini';
      th.style.userSelect = 'none';
      
      if (!th.querySelector('.sort-icon-g')) {
        th.innerHTML += ' <i class="fa-solid fa-sort sort-icon-g" style="color: #cbd5e1; font-size: 0.8rem; margin-left: 5px;"></i>';
      }
      
      th.addEventListener('click', () => {
        if (genericTableSortState[tableId].colIndex === index) {
          genericTableSortState[tableId].isAsc = !genericTableSortState[tableId].isAsc;
        } else {
          genericTableSortState[tableId].colIndex = index;
          genericTableSortState[tableId].isAsc = true;
        }
        
        applyTableSort(tableId, index, genericTableSortState[tableId].isAsc);
        updateSortIcons(table, index, genericTableSortState[tableId].isAsc);
      });
    });
  });
}

function naturalCompare(a, b) {
  var ax = [], bx = [];
  a.replace(/(\d+)|(\D+)/g, function(_, d, s) { ax.push([d || Infinity, s || '']) });
  b.replace(/(\d+)|(\D+)/g, function(_, d, s) { bx.push([d || Infinity, s || '']) });
  while(ax.length && bx.length) {
    var an = ax.shift();
    var bn = bx.shift();
    var nn = (an[0] - bn[0]) || (an[1].localeCompare(bn[1]));
    if(nn) return nn;
  }
  return ax.length - bx.length;
}

function applyTableSort(tableId, colIndex, isAsc) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const cellA = a.children[colIndex];
    const cellB = b.children[colIndex];
    if (!cellA || !cellB) return 0;
    let valA = cellA.textContent.trim();
    let valB = cellB.textContent.trim();
    return isAsc ? naturalCompare(valA, valB) : naturalCompare(valB, valA);
  });
  tbody.innerHTML = '';
  rows.forEach(r => tbody.appendChild(r));
}

function updateSortIcons(table, colIndex, isAsc) {
  const headers = table.querySelectorAll('thead th');
  headers.forEach((th, idx) => {
    const icon = th.querySelector('.sort-icon-g');
    if (!icon) return;
    
    if (idx === colIndex) {
      icon.className = isAsc ? 'fa-solid fa-sort-up sort-icon-g' : 'fa-solid fa-sort-down sort-icon-g';
      icon.style.color = '#0284c7';
    } else {
      icon.className = 'fa-solid fa-sort sort-icon-g';
      icon.style.color = '#cbd5e1';
    }
  });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  initSortableTables();
  
  // Navigation Router
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const view = link.getAttribute("data-view");
      navigateTo(view);
      
      // Auto-tutup menu di HP setelah diklik
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('collapsed');
      }
    });
  });

  // Tab Navigators in Master Data
  document.querySelectorAll(".tab-btn").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      tabBtn.classList.add("active");

      document.querySelectorAll(".tab-content").forEach(tc => tc.style.display = "none");
      const targetId = tabBtn.getAttribute("data-tab");
      document.getElementById(targetId).style.display = "block";
    });
  });

  // Login Form Submission
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const unameEl = document.getElementById("login-username");
    const passEl = document.getElementById("login-password");
    const errEl = document.getElementById("login-error-msg");

    const uname = unameEl ? unameEl.value.trim() : "";
    const pass = passEl ? passEl.value : "";

    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }

    let res = window.auth.login(uname, pass);
    /* Auto-sync removed from login to prevent hang on fake URL */

    if (res.success) {
      showToast("Selamat datang, " + res.user.fullname + "!", "success");
      showAuthOverlay(false);
      updateUserBadge();
      applyRolePermissions();
      navigateTo("dashboard");
    } else {
      showToast(res.message, "danger");
      if (errEl) {
        errEl.style.display = "block";
        errEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${res.message}`;
      }
    }
  });

  // Logout Button
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
      window.auth.logout();
    }
  });

  // Monthly Closing Form Submission
  document.getElementById("form-monthly-closing")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const targetMonth = document.getElementById("closing-month-select")?.value;
    if (!targetMonth) {
      showToast("Pilih bulan periode yang akan dihitung.", "warning");
      return;
    }

    const btnSubmit = document.getElementById("btn-submit-monthly-closing");
    const origHtml = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.style.backgroundColor = '#dc2626';
      btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses Hitung & Tutup Buku...`;
    }

    setTimeout(() => {
      try {
        // Pre-calculate both modes (CUMULATIVE & MONTHLY_ONLY) for targetMonth
        const filterVal = document.getElementById("closing-data-filter")?.value || "ADA_PENGAMBILAN";
          const currentMonth = new Date().toISOString().slice(0, 7);
          const applyFilter = (achievements) => {
            if (targetMonth === currentMonth) return achievements; // Bulan berjalan tampil semua
            if (filterVal === "SEMUA") return achievements;
            return achievements.filter(a => {
              if (filterVal === "TERCAPAI_SAJA") return a.matchedTierLevel > 0;
              if (filterVal === "ADA_PENGAMBILAN") return a.matchedTierLevel > 0 || a.totalQty > 0;
              return true;
            });
          };

          let resultsCum = window.engine.calculateAllActiveCampaignAchievements(targetMonth, "CUMULATIVE");
          resultsCum = applyFilter(resultsCum);
          window.db.saveSnapshotForPeriod(targetMonth, "CUMULATIVE", resultsCum);
          
          let resultsMonthly = window.engine.calculateAllActiveCampaignAchievements(targetMonth, "MONTHLY_ONLY");
          resultsMonthly = applyFilter(resultsMonthly);
          window.db.saveSnapshotForPeriod(targetMonth, "MONTHLY_ONLY", resultsMonthly);

        const parts = targetMonth.split("-");
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const mmIdx = parseInt(parts[1], 10) - 1;
        const monthText = `${monthNames[mmIdx] || ''} ${parts[0]}`;

        showToast(`Sukses memproses & menyimpan Tutup Buku pencapaian bulan ${monthText} (Mode Kumulatif & Single Bulan)!`, "success");
        closeModal("modal-monthly-closing");

        // Sync dashboard month filter to the processed month
        const dashMonthEl = document.getElementById("dash-month-filter");
        if (dashMonthEl) dashMonthEl.value = targetMonth;

        renderDashboard();
        renderAchievements();
      } catch (err) {
        console.error("Error processing monthly closing:", err);
        showToast("Gagal memproses Tutup Buku: " + (err.message || err), "danger");
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.style.backgroundColor = '';
          btnSubmit.innerHTML = origHtml || `<i class="fa-solid fa-floppy-disk"></i> Proses Hitung & Simpan Snapshot`;
        }
      }
    }, 50);
  });

  // Sales File Input Parser (Native Excel .xlsx / .xls & CSV with Smart Mapping)
  document.getElementById("sales-file-input")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    processUploadedSalesFile(file);
  });

  // Clear Sales Button
  document.getElementById("btn-clear-sales")?.addEventListener("click", () => {
    if (confirm("Apakah Anda yakin ingin menghapus seluruh data penjualan?")) {
      window.db.clearSales();
      showToast("Semua data penjualan berhasil dibersihkan", "warning");
      renderSalesHistory();
      renderDashboard();
    }
  });

  // Add Modals Trigger
  document.getElementById("btn-add-campaign")?.addEventListener("click", () => {
    openAddCampaignModal();
  });
  document.getElementById("btn-add-user")?.addEventListener("click", () => {
    openAddUserModal();
  });
  document.getElementById("btn-add-store")?.addEventListener("click", () => openAddStoreModal());
  document.getElementById("btn-add-group")?.addEventListener("click", () => openAddGroupModal());
  document.getElementById("btn-add-product")?.addEventListener("click", () => openAddProductModal());
  document.getElementById("product-code")?.addEventListener("input", checkDuplicateSkuWarning);

  // Campaign Form Submission
  document.getElementById("form-campaign")?.addEventListener("submit", (e) => {
    e.preventDefault();

    const saveBtn = document.getElementById("btn-save-campaign");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan & Menghitung...`;
    }

    setTimeout(() => {
      try {
        const code = document.getElementById("cmp-code").value.trim();
          const description = document.getElementById("cmp-description").value.trim();
        const name = document.getElementById("cmp-name").value.trim();
        const startDate = document.getElementById("cmp-start-date").value;
        const endDate = document.getElementById("cmp-end-date").value;
        const evaluationPeriod = document.getElementById("cmp-evaluation-period").value;
        const basis = document.getElementById("cmp-basis").value;
        const isMultiplier = document.getElementById("cmp-is-multiplier").value === "true";
        const scope = document.getElementById("cmp-scope").value;
        const status = document.getElementById("cmp-status")?.value || "ACTIVE";

        const productFilterScope = document.querySelector("input[name='cmp-product-filter-scope']:checked")?.value || "BY_GROUP";
        syncEligibleStoresFromDOM();
        const selectedStores = currentFormEligibleStores;
        
        syncEligibleGroupsFromDOM();
        const selectedGroups = currentFormEligibleGroups;

        syncEligibleSkusFromDOM();
        const selectedSkus = currentFormEligibleSkus;

        // Sync latest tier data from DOM input elements
        syncCurrentFormTiersFromDOM();

        // Ensure minQty / minOmzet respect target basis and auto-sort tiers by target value ascending
        const processedTiers = currentFormTiersData
          .map(t => ({
            ...t,
            minQty: (basis === "OMZET" || basis === "POIN") ? 0 : (t.minQty || 0),
            minOmzet: (basis === "QTY") ? 0 : (t.minOmzet || 0)
          }))
          .sort((a, b) => {
            const valA = (basis === "OMZET" || basis === "POIN") ? a.minOmzet : a.minQty;
            const valB = (basis === "OMZET" || basis === "POIN") ? b.minOmzet : b.minQty;
            return valA - valB;
          })
          .map((t, idx) => ({
            ...t,
            level: idx + 1
          }));

        const cmpId = document.getElementById("cmp-id").value;

        const campaignPayload = {
          id: cmpId || undefined,
          campaignCode: code,
          campaignName: name,
          description: description,
          startDate: startDate,
          endDate: endDate,
          evaluationPeriod: evaluationPeriod,
          targetBasis: basis,
          isMultiplier: isMultiplier,
          targetScope: scope,
            eligibleMarket: scope === "BY_MARKET" ? (document.getElementById("cmp-eligible-market")?.value.trim() || "") : "",
          productFilterScope: productFilterScope,
          eligibleStoreIds: (scope === "SELECTED_STORES" || scope === "EXCLUDED_STORES") ? selectedStores : [],
          eligibleGroupIds: selectedGroups,
          eligibleProductIds: selectedSkus,
          status: status,
          tiers: processedTiers
        };

        window.db.saveCampaign(campaignPayload);
        showToast(cmpId ? "Master Program Campaign berhasil diperbarui!" : "Master Program Campaign & aturan tiering berhasil disimpan!", "success");
        closeModal("modal-campaign");
        renderCampaigns();
        syncMasterDataToSupabaseCloudSilently();
      } catch (err) {
        console.error("Error saving campaign:", err);
        showToast("Gagal menyimpan campaign: " + (err.message || err), "danger");
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Program Campaign`;
        }
      }
    }, 50);
  });

  // Forms Submissions
  document.getElementById("form-user")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const userId = document.getElementById("user-id").value;
    const uname = document.getElementById("user-username").value.trim();
    const pass = document.getElementById("user-password").value;
    const fname = document.getElementById("user-fullname").value.trim();
    const role = document.getElementById("user-role").value;
    const storeId = document.getElementById("user-store-id").value;

    const nowIso = new Date().toISOString();

    if (userId) {
      window.db.updateUser(userId, {
        username: uname,
        passwordHash: pass,
        password: pass,
        fullname: fname,
        role: role,
        storeId: storeId || null,
        updatedAt: nowIso
      });
      showToast("Data user & password berhasil diperbarui!", "success");
    } else {
      window.db.addUser({
        username: uname,
        password: pass,
        fullname: fname,
        role: role,
        storeId: storeId || null,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      showToast("User baru berhasil ditambahkan!", "success");
    }
    closeModal("modal-user");
    renderUsers();
    syncMasterDataToSupabaseCloudSilently();
  });

  document.getElementById("form-store")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("store-id").value;
    const code = document.getElementById("store-code").value.trim();
    const name = document.getElementById("store-name").value.trim();
    const reg = document.getElementById("store-region").value.trim();
      const marketCat = document.getElementById("store-market")?.value.trim() || "";
    const selectedUserId = document.getElementById("store-user-id").value;
    const isEligible = document.getElementById("store-campaign-eligible").value === "true";

    const users = window.db.getUsers();
    const selectedUser = users.find(u => u.id === selectedUserId);

    let userId = null;
    let salesmanId = null;
    let salesmanName = "";

    if (selectedUser) {
      userId = selectedUser.id;
      salesmanName = selectedUser.fullname || selectedUser.username;
      if (selectedUser.role === "SALESMAN") {
        salesmanId = selectedUser.id;
      }
    } else if (selectedUserId.startsWith("custom_")) {
      salesmanName = selectedUserId.replace("custom_", "");
    }

    window.db.addStore({
      id: id,
      storeCode: code,
      storeName: name,
        region: reg,
        marketCategory: marketCat,
      userId: userId,
      salesmanId: salesmanId,
      salesmanName: salesmanName,
      isCampaignEligible: isEligible
    });

    showToast(id ? "Data Toko berhasil diperbarui!" : "Toko baru berhasil ditambahkan!", "success");
    closeModal("modal-store");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  });

  document.getElementById("form-group")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("group-id").value;
    const code = document.getElementById("group-code").value.trim();
    const name = document.getElementById("group-name").value.trim();

    window.db.addProductGroup({ id: id, groupCode: code, groupName: name });
    showToast(id ? "Group Produk berhasil diperbarui!" : "Group Produk baru berhasil ditambahkan!", "success");
    closeModal("modal-group");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  });

  document.getElementById("form-product")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("product-id").value;
    const code = document.getElementById("product-code").value.trim();
    const name = document.getElementById("product-name").value.trim();
    const grpId = document.getElementById("product-group-id").value;
    const price = document.getElementById("product-price").value;

    window.db.addProduct({ id: id, productCode: code, productName: name, groupId: grpId, unitPrice: price });
    showToast(id ? "Produk SKU berhasil diperbarui!" : "Produk SKU baru berhasil ditambahkan!", "success");
    closeModal("modal-product");
    renderMasterData();
    syncMasterDataToSupabaseCloudSilently();
  });

  // Backup & Restore
  document.getElementById("btn-backup-export").addEventListener("click", () => {
    downloadLocalDatabaseBackup();
  });

  document.getElementById("btn-backup-import-trigger").addEventListener("click", () => {
    document.getElementById("backup-file-input").click();
  });

  document.getElementById("backup-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        window.db.saveDatabase(parsed);
        showToast("Database berhasil di-restore!", "success");
        window.location.reload();
      } catch (err) {
        showToast("Format file JSON tidak valid.", "danger");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-reset-seed")?.addEventListener("click", () => {
    if (confirm("Apakah Anda yakin ingin mereset seluruh database ke data demo bawaan?")) {
      window.db.resetToSeed();
      showToast("Database telah di-reset!", "warning");
      window.location.reload();
    }
  });

  // CSV Export for Achievements
  document.getElementById("export-csv-btn")?.addEventListener("click", () => {
    exportAchievementsCSV();
  });

  // Supabase Sync Form Listener
  document.getElementById("form-supabase-config")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = document.getElementById("supabase-url").value.trim().replace(/\/+$/, "");
    const anonKey = document.getElementById("supabase-anon-key").value.trim();
    const tableName = document.getElementById("supabase-table-name").value.trim() || "dashboard_snapshots";

    if (!url || !anonKey) {
      showToast("Harap isi URL dan Anon API Key Supabase", "danger");
      return;
    }

    const btnSave = document.getElementById("btn-save-supabase-sync");
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mempublikasikan...';
    }

    try {
      await publishDashboardSnapshotToSupabase({ url, anonKey, tableName });
      closeModal("modal-supabase-sync");
    } catch (err) {
      showToast("Gagal Sync Supabase: " + err.message, "danger");
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Publish Snapshot';
      }
    }
  });
}



let currentUploadedWorkbook = null;
let currentSheetName = "";
let rawUploadedMatrix = [];
let currentUploadedFileHeaders = [];
let currentUploadedFileRows = [];
let selectedHeaderRowIndex = 0;
let selectedExcludeColumnIndex = -1;
let selectedExcludedValues = new Set();

function processUploadedSalesFile(file) {
  if (!file) return;

  if (typeof XLSX === "undefined") {
    showToast("Pustaka SheetJS (XLSX) belum dimuat.", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buffer = e.target.result;
      const data = new Uint8Array(buffer);
      
      let workbook = null;

      try {
        workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
      } catch (err1) {
        console.warn("XLSX type:array failed, trying binary string read...", err1);
        try {
          let binary = "";
          const bytes = new Uint8Array(data);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          workbook = XLSX.read(binary, { type: "binary", cellDates: true, raw: false });
        } catch (err2) {
          console.error("All XLSX parse attempts failed:", err2);
          showToast("Format file tidak dapat dibaca. Pastikan file berupa Excel (.xlsx / .xls) atau CSV.", "danger");
          return;
        }
      }

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        showToast("File tidak memiliki lembar kerja (sheet) yang valid.", "danger");
        return;
      }

      currentUploadedWorkbook = workbook;
      const bestSheet = findBestSheetName(workbook);
      populateSheetSelect(workbook.SheetNames, bestSheet);
      loadWorkbookSheet(bestSheet);
      openModal("modal-mapping");

    } catch (err) {
      console.error("Gagal membaca file:", err);
      showToast("Gagal membaca file penjualan: " + (err.message || err), "danger");
    }
  };

  reader.onerror = () => {
    showToast("Gagal membaca file dari disk.", "danger");
  };

  reader.readAsArrayBuffer(file);
}

function findBestSheetName(workbook) {
  const names = workbook.SheetNames;
  if (names.length === 1) return names[0];

  const keywords = ["penjualan", "sales", "detail", "trx", "transaksi", "data", "report", "faktur"];
  for (let n of names) {
    const norm = String(n).toLowerCase();
    if (keywords.some(kw => norm.includes(kw))) {
      return n;
    }
  }

  // Pick sheet with highest non-empty row count
  let maxRows = -1;
  let bestName = names[0];
  names.forEach(n => {
    const sheet = workbook.Sheets[n];
    if (sheet) {
      const sheetJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (sheetJson.length > maxRows) {
        maxRows = sheetJson.length;
        bestName = n;
      }
    }
  });

  return bestName;
}

function populateSheetSelect(sheetNames, activeSheetName) {
  const sel = document.getElementById("map-sheet-name");
  if (!sel) return;
  sel.innerHTML = "";

  sheetNames.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `Sheet: ${name}${name === activeSheetName ? ' (? Terpilih)' : ''}`;
    if (name === activeSheetName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function handleSheetChange(sheetName) {
  if (!currentUploadedWorkbook) return;
  loadWorkbookSheet(sheetName);
}

function loadWorkbookSheet(sheetName) {
  currentSheetName = sheetName;
  const worksheet = currentUploadedWorkbook.Sheets[sheetName];
  if (!worksheet) return;

  const sheetJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
  rawUploadedMatrix = sheetJson || [];

  if (rawUploadedMatrix.length === 0) {
    showToast(`Sheet '${sheetName}' kosong!`, "warning");
  }

  const detectedIdx = detectHeaderRowIndex(rawUploadedMatrix);
  populateHeaderRowSelect(rawUploadedMatrix, detectedIdx);
  handleHeaderRowChange(detectedIdx);
}

function readAsTextFallback(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    handleSalesFileUploadText(e.target.result);
  };
  reader.readAsText(file);
}

function handleSalesFileUploadText(fileContent) {
  currentUploadedWorkbook = null;
  populateSheetSelect(["Data Penjualan (Text/CSV)"], "Data Penjualan (Text/CSV)");

  const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    showToast("File kosong atau tidak memiliki baris data.", "danger");
    return;
  }

  // Detect delimiter (tab, comma, semicolon)
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";")) delimiter = ";";

  // Parse raw matrix
  const matrix = lines.map(line => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, "")));
  rawUploadedMatrix = matrix;

  const detectedIdx = detectHeaderRowIndex(rawUploadedMatrix);
  populateHeaderRowSelect(rawUploadedMatrix, detectedIdx);
  handleHeaderRowChange(detectedIdx);
  openModal("modal-mapping");
}

function detectHeaderRowIndex(matrix) {
  const keywords = ["faktur", "invoice", "tgl", "tanggal", "date", "toko", "cust", "customer", "pelanggan", "produk", "sku", "item", "barang", "qty", "jumlah", "harga", "total", "omzet", "rp", "netto", "cabang", "outlet"];
  let maxScore = -1;
  let bestIndex = -1;

  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i];
    if (!row || !Array.isArray(row)) continue;

    const nonCols = row.filter(c => String(c || "").trim() !== "");
    if (nonCols.length < 2) continue; // Skip single-cell title lines

    let score = 0;
    nonCols.forEach(cell => {
      const norm = String(cell).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (keywords.some(kw => norm.includes(kw))) {
        score++;
      }
    });

    if (score > maxScore && score >= 2) {
      maxScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex !== -1) return bestIndex;

  // Fallback: find first row with >= 3 non-empty columns
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i];
    if (!row) continue;
    const nonCols = row.filter(c => String(c || "").trim() !== "");
    if (nonCols.length >= 3) {
      return i;
    }
  }

  return 0;
}

function populateHeaderRowSelect(matrix, detectedIdx) {
  const sel = document.getElementById("map-header-row");
  if (!sel) return;
  sel.innerHTML = "";

  let count = 0;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const row = matrix[i];
    if (!row || row.every(c => String(c).trim() === "")) continue;

    const previewCells = row.map(c => String(c).trim()).filter(c => c !== "");
    const previewText = previewCells.join(" | ");
    if (previewText.length === 0) continue;

    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Baris ${i + 1}: ${previewText.substring(0, 85)}${previewText.length > 85 ? '...' : ''}${i === detectedIdx ? ' (? Terdeteksi Header)' : ''}`;
    if (i === detectedIdx) opt.selected = true;
    sel.appendChild(opt);
    count++;
  }
}

function handleHeaderRowChange(rowIndexVal) {
  const rowIndex = parseInt(rowIndexVal);
  selectedHeaderRowIndex = rowIndex;

  if (!rawUploadedMatrix || rawUploadedMatrix.length <= rowIndex) return;

  const rawHeaderRow = rawUploadedMatrix[rowIndex] || [];
  currentUploadedFileHeaders = rawHeaderRow.map(h => String(h || "").trim());

  // Data rows are non-empty rows strictly after selected header row
  currentUploadedFileRows = rawUploadedMatrix
    .slice(rowIndex + 1)
    .filter(row => row && row.some(cell => String(cell || "").trim() !== ""))
    .map(row => row.map(c => String(c || "").trim()));

  const mapping = autoDetectColumnIndices(currentUploadedFileHeaders);
  populateMappingSelects(currentUploadedFileHeaders, mapping);
  updateMappingPreview();
}

const MAPPING_STORAGE_KEY = "CAMPAIGN_APP_SAVED_SALES_MAPPING_V1";

function saveMappingConfig(headerRowIdx, headers) {
  try {
    const keys = ["inv", "date", "store", "storeName", "storeRegion", "storeMarket", "product", "qty", "price"];
    const selectIds = {
      inv: "map-col-inv",
      date: "map-col-date",
      store: "map-col-store", storeName: "map-col-store-name", storeRegion: "map-col-store-region", storeMarket: "map-col-store-market", product: "map-col-product",
      qty: "map-col-qty",
      price: "map-col-price"
    };

    const mappedHeaderTexts = {};
    const mappingIndices = {};

    keys.forEach(k => {
      const idx = parseInt(document.getElementById(selectIds[k])?.value || "-1");
      mappingIndices[k] = idx;
      if (idx >= 0 && headers && headers[idx]) {
        mappedHeaderTexts[k] = headers[idx];
      }
    });

    let excludeColumnHeaderText = "";
    let excludedValues = [];
    if (selectedExcludeColumnIndex >= 0 && headers && headers[selectedExcludeColumnIndex]) {
      excludeColumnHeaderText = headers[selectedExcludeColumnIndex];
      excludedValues = Array.from(selectedExcludedValues);
    }

    const config = {
      headerRowIndex: headerRowIdx,
      mappingIndices: mappingIndices,
      mappedHeaderTexts: mappedHeaderTexts,
      excludeColumnHeaderText: excludeColumnHeaderText,
      excludedValues: excludedValues,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn("Could not save mapping config:", err);
  }
}

function getSavedMappingConfig() {
  try {
    const json = localStorage.getItem(MAPPING_STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (err) {
    return null;
  }
}

function autoDetectColumnIndices(headers) {
  const norm = headers.map(h => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  const savedConfig = getSavedMappingConfig();
  const result = {};

  const keys = ["inv", "date", "store", "storeName", "storeRegion", "storeMarket", "product", "qty", "price"];
  let isSavedApplied = false;

  // 1. Try saved mapping header text exact/clean match first
  if (savedConfig && savedConfig.mappedHeaderTexts) {
    keys.forEach(k => {
      const savedText = savedConfig.mappedHeaderTexts[k];
      if (savedText) {
        const cleanSaved = String(savedText).toLowerCase().replace(/[^a-z0-9]/g, "");
        const matchedIdx = norm.findIndex(hNorm => hNorm && hNorm === cleanSaved);
        if (matchedIdx !== -1) {
          result[k] = matchedIdx;
          isSavedApplied = true;
        }
      }
    });
  }

  // 2. Keyword alias matching for any key not matched by saved text
  const aliasMap = {
    inv: ['nofaktur', 'faktur', 'no_faktur', 'invoice', 'noinvoice', 'inv', 'noinv', 'idtransaksi', 'trxid', 'bukti', 'nobukti', 'nomor'],
    date: ['tanggal', 'tgl', 'date', 'transactiondate', 'trxdate', 'tanggalfaktur'],
    store: ['kodetoko', 'kode_toko', 'storecode', 'custcode', 'customercode', 'kdtoko', 'idtoko', 'custid', 'gruptoko', 'kodegruptoko', 'kode/grup', 'customer', 'pelanggan', 'toko'],
      storeName: ['namatoko', 'nama_toko', 'storename', 'custname', 'customername', 'nmtoko', 'namapelanggan'],
      storeRegion: ['wilayah', 'region', 'area', 'cabang', 'branch'],
      storeMarket: ['market', 'kategori', 'category', 'tipe', 'jenis'],
    product: ['kodeproduk', 'kode_produk', 'productcode', 'sku', 'kodesku', 'itemcode', 'kdproduk', 'kdsku', 'kodeskuproduk', 'typeproduk', 'produk', 'type', 'barang'],
    qty: ['qty', 'quantity', 'jumlah', 'unit', 'jumlahunit', 'qtyunit', 'totalqty', 'banyaknya', 'volume', 'kuantitas'],
    // 'totalomzet', 'omzet', 'totalharga', 'total' are prioritized before unit prices
    price: ['poin', 'totalpoin', 'nilaipoin', 'poinsatuan', 'totalomzet', 'omzet', 'totalharga', 'total', 'amount', 'netto', 'harga', 'price', 'unitprice', 'hargasatuan', 'hargagroup', 'val', 'nilai']
  };

  const findIdx = (aliases, defaultFallbackIdx) => {
    for (let i = 0; i < norm.length; i++) {
      if (!norm[i]) continue;
      if (aliases.some(alias => norm[i].includes(alias))) return i;
    }
    return defaultFallbackIdx < headers.length ? defaultFallbackIdx : 0;
  };

  keys.forEach((k, defaultIdx) => {
    if (result[k] === undefined) {
      if (k === "storeName" || k === "storeRegion" || k === "storeMarket") {
        // Find by alias, but if not found, default to -1 (Optional)
        const found = findIdx(aliasMap[k], -1);
        result[k] = (found >= 0) ? found : -1;
      } else {
        // Adjust defaultIdx for remaining required fields since we inserted two optional fields
        const adjustedDefaultIdx = (k === "product") ? 3 : (k === "qty") ? 4 : (k === "price") ? 5 : defaultIdx;
        result[k] = findIdx(aliasMap[k], adjustedDefaultIdx);
      }
    }
  });

  const noticeEl = document.getElementById("mapping-saved-notice");
  if (noticeEl) {
    noticeEl.style.display = isSavedApplied ? "block" : "none";
  }

  return result;
}

function populateMappingSelects(headers, mapping) {
  const fieldIds = {
    inv: "map-col-inv",
    date: "map-col-date",
    store: "map-col-store", storeName: "map-col-store-name", storeRegion: "map-col-store-region", storeMarket: "map-col-store-market", product: "map-col-product",
    qty: "map-col-qty",
    price: "map-col-price"
  };

  Object.keys(fieldIds).forEach(key => {
    const sel = document.getElementById(fieldIds[key]);
    if (!sel) return;
    sel.innerHTML = (key === "price" || key === "storeName" || key === "storeRegion" || key === "storeMarket") ? '<option value="-1">-- Tidak Memakai / Abaikan --</option>' : '';
    headers.forEach((h, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `Kolom ${idx + 1}: ${h || '(Kolom Kosong)'}`;
      if (idx === mapping[key]) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  // Populate Exclude Column Target Dropdown
  selectedExcludeColumnIndex = -1;
  selectedExcludedValues.clear();

  const excludeSel = document.getElementById("map-col-exclude-target");
  let restoredExcludeIdx = -1;
  const savedConfig = getSavedMappingConfig();

  if (excludeSel) {
    excludeSel.innerHTML = '<option value="-1">-- Tidak Memakai Filter Pengecualian Kolom --</option>';
    headers.forEach((h, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `Kolom ${idx + 1}: ${h || '(Kolom Kosong)'}`;
      
      // Auto-restore based on saved text
      if (savedConfig && savedConfig.excludeColumnHeaderText && savedConfig.excludeColumnHeaderText === h) {
        opt.selected = true;
        restoredExcludeIdx = idx;
      }
      
      excludeSel.appendChild(opt);
    });
  }

  const containerVals = document.getElementById("container-exclude-values");
  if (containerVals) containerVals.style.display = "none";
  const badgeSummary = document.getElementById("exclude-summary-badge");
  if (badgeSummary) badgeSummary.style.display = "none";

  if (restoredExcludeIdx >= 0) {
    // Generate the checkboxes
    handleExcludeColumnChange(restoredExcludeIdx);
    // Re-check the previously saved values
    if (savedConfig && Array.isArray(savedConfig.excludedValues)) {
      const listEl = document.getElementById("exclude-checkbox-list");
      if (listEl) {
        const checkboxes = listEl.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => {
          if (savedConfig.excludedValues.includes(decodeURIComponent(cb.value))) {
            cb.checked = true;
          }
        });
      }
      // Re-trigger calculation
      handleExcludeCheckboxChange();
    }
  }
}

function handleExcludeColumnChange(colIdxVal) {
  const colIdx = parseInt(colIdxVal);
  selectedExcludeColumnIndex = colIdx;
  selectedExcludedValues.clear();

  const containerVals = document.getElementById("container-exclude-values");
  const listEl = document.getElementById("exclude-checkbox-list");
  const countSpan = document.getElementById("exclude-values-count");
  const badgeSummary = document.getElementById("exclude-summary-badge");

  if (colIdx < 0 || !currentUploadedFileRows || currentUploadedFileRows.length === 0) {
    if (containerVals) containerVals.style.display = "none";
    if (badgeSummary) badgeSummary.style.display = "none";
    updateMappingPreview();
    return;
  }

  // Count unique values in this column
  const valCounts = {};
  currentUploadedFileRows.forEach(row => {
    const rawVal = String(row[colIdx] || "").trim();
    const valKey = rawVal === "" ? "(Kosong / Blank)" : rawVal;
    valCounts[valKey] = (valCounts[valKey] || 0) + 1;
  });

  const uniqueKeys = Object.keys(valCounts).sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));

  if (listEl) {
    listEl.innerHTML = "";
    uniqueKeys.forEach((key, idx) => {
      const count = valCounts[key];
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; gap: 8px;";
      div.innerHTML = `
        <input type="checkbox" id="chk-exclude-val-${idx}" value="${encodeURIComponent(key)}" onchange="handleExcludeCheckboxChange()">
        <label for="chk-exclude-val-${idx}" style="cursor: pointer; margin: 0; user-select: none;">
          <strong style="color: #0f172a;">${key}</strong> <small style="color: #64748b;">(${count} baris transaksi)</small>
        </label>
      `;
      listEl.appendChild(div);
    });
  }

  if (countSpan) countSpan.textContent = uniqueKeys.length;
  if (containerVals) containerVals.style.display = "block";

  handleExcludeCheckboxChange();
}

function handleExcludeCheckboxChange() {
  selectedExcludedValues.clear();
  const listEl = document.getElementById("exclude-checkbox-list");
  if (listEl) {
    const checkedInputs = listEl.querySelectorAll("input[type='checkbox']:checked");
    checkedInputs.forEach(cb => {
      selectedExcludedValues.add(decodeURIComponent(cb.value));
    });
  }

  updateExcludeSummaryBadge();
  updateMappingPreview();
}

function toggleAllExcludeValues(checkAll) {
  const listEl = document.getElementById("exclude-checkbox-list");
  if (!listEl) return;
  const checkboxes = listEl.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    cb.checked = checkAll;
  });
  handleExcludeCheckboxChange();
}

function updateExcludeSummaryBadge() {
  const badgeSummary = document.getElementById("exclude-summary-badge");
  if (!badgeSummary) return;

  if (selectedExcludeColumnIndex < 0 || selectedExcludedValues.size === 0) {
    badgeSummary.style.display = "none";
    return;
  }

  let matchCount = 0;
  currentUploadedFileRows.forEach(cols => {
    const rawVal = String(cols[selectedExcludeColumnIndex] || "").trim();
    const valKey = rawVal === "" ? "(Kosong / Blank)" : rawVal;
    if (selectedExcludedValues.has(valKey)) {
      matchCount++;
    }
  });

  const colName = currentUploadedFileHeaders[selectedExcludeColumnIndex] || `Kolom ${selectedExcludeColumnIndex + 1}`;
  badgeSummary.style.display = "block";
  badgeSummary.innerHTML = `<i class="fa-solid fa-filter-circle-xmark"></i> <strong>Filter Exclude Aktif:</strong> ${matchCount} dari total ${currentUploadedFileRows.length} baris transaksi dengan nilai terpilih pada kolom <u>"${colName}"</u> akan <strong>DIBUANG (dikecualikan)</strong> dari impor.`;
}


function renderMappingMasterReference() {
  const container = document.getElementById("mapping-master-reference");
  if (!container) return;

  const stores = window.db.getStores() || [];
  const products = window.db.getProducts() || [];

  const storeListText = stores.map(s => `<code>${s.storeCode}</code> (${s.storeName})`).join(", ") || "Belum ada master toko";
  const prodListText = products.map(p => `<code>${p.productCode}</code> (${p.productName})`).join(", ") || "Belum ada master produk";

  container.innerHTML = `
    <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <strong style="color:#0f172a;"><i class="fa-solid fa-store"></i> Master Toko (${stores.length}):</strong>
      <div style="font-size: 0.8rem; color: #334155; margin-top: 4px; max-height: 90px; overflow-y: auto; line-height: 1.5;">${storeListText}</div>
    </div>
    <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <strong style="color:#0f172a;"><i class="fa-solid fa-box"></i> Master SKU Produk (${products.length}):</strong>
      <div style="font-size: 0.8rem; color: #334155; margin-top: 4px; max-height: 90px; overflow-y: auto; line-height: 1.5;">${prodListText}</div>
    </div>
  `;
}

function findMatchedStore(val, stores) {
  if (!val || !stores || !Array.isArray(stores)) return null;
  const raw = String(val).trim().toLowerCase();
  const cleanVal = raw.replace(/[^a-z0-9]/g, "");
  if (!cleanVal) return null;

  // --- PHASE 1: STRICT KODE TOKO (STORE CODE) MATCHING ---
  // 1A. Exact match by raw storeCode
  let match = stores.find(s => s && s.storeCode && String(s.storeCode).trim().toLowerCase() === raw);
  if (match) return match;

  // 1B. Clean exact match by alphanumeric storeCode
  match = stores.find(s => s && s.storeCode && String(s.storeCode).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (match) return match;

  // 1C. Prefix match by storeCode (longest storeCode first to prevent short prefix stealing)
  const sortedStoresByCode = [...stores]
    .filter(s => s && s.storeCode)
    .sort((a, b) => String(b.storeCode).length - String(a.storeCode).length);

  match = sortedStoresByCode.find(s => {
    const sCodeClean = String(s.storeCode).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (sCodeClean.length >= 2) {
      return cleanVal.startsWith(sCodeClean);
    }
    return false;
  });
  if (match) return match;

  // --- PHASE 2: NAMA TOKO (STORE NAME) FALLBACK MATCHING ---
  // 2A. Exact match by raw storeName
  match = stores.find(s => s && s.storeName && String(s.storeName).trim().toLowerCase() === raw);
  if (match) return match;

  // 2B. Clean exact match by alphanumeric storeName
  match = stores.find(s => s && s.storeName && String(s.storeName).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (match) return match;

  // 2C. Prefix match by storeName (longest storeName first)
  const sortedStoresByName = [...stores]
    .filter(s => s && s.storeName)
    .sort((a, b) => String(b.storeName).length - String(a.storeName).length);

  match = sortedStoresByName.find(s => {
    const sNameClean = String(s.storeName).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (sNameClean.length >= 5) {
      return cleanVal.startsWith(sNameClean);
    }
    return false;
  });
  if (match) return match;

  return null;
}

function findBestGroupIdForProduct(prodCode, groups) {
  if (!groups || groups.length === 0) return "grp_type_a";
  const cleanCode = String(prodCode || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Check if prodCode contains any groupCode
  for (const g of groups) {
    if (!g || !g.groupCode) continue;
    const cleanGrpCode = String(g.groupCode).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanGrpCode && cleanGrpCode.length >= 2 && cleanCode.includes(cleanGrpCode)) {
      return g.id;
    }
  }

  // 2. Check if prodCode contains groupName
  for (const g of groups) {
    if (!g || !g.groupName) continue;
    const cleanGrpName = String(g.groupName).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanGrpName && cleanGrpName.length >= 3 && cleanCode.includes(cleanGrpName)) {
      return g.id;
    }
  }

  // 3. Fallback: Find or create a 'Non-Campaign / General' group
  let unassignedGrp = groups.find(g => g.groupCode === "UMUM" || g.groupCode === "OTHER" || String(g.groupName).toLowerCase().includes("lain") || String(g.groupName).toLowerCase().includes("umum"));
  if (unassignedGrp) return unassignedGrp.id;

  const newGrp = window.db.addProductGroup({
    groupCode: "UMUM",
    groupName: "Produk Umum / Non-Campaign"
  });
  groups.push(newGrp);
  return newGrp.id;
}

function findMatchedProduct(val, products) {
  if (!val || !products || !Array.isArray(products)) return null;
  const rawCode = String(val).trim();
  if (!rawCode) return null;

  const rawLower = rawCode.toLowerCase();
  const cleanVal = rawLower.replace(/[^a-z0-9]/g, "");
  if (!cleanVal) return null;

  // 1A. Exact match by raw productCode
  let match = products.find(p => p && p.productCode && String(p.productCode).trim().toLowerCase() === rawLower);
  if (match) return match;

  // 1B. Clean exact match by alphanumeric productCode
  match = products.find(p => p && p.productCode && String(p.productCode).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (match) return match;

  // 1C. Prefix match by productCode (longest first)
  const sortedProductsByCode = [...products]
    .filter(p => p && p.productCode)
    .sort((a, b) => String(b.productCode).length - String(a.productCode).length);

  match = sortedProductsByCode.find(p => {
    const pCodeClean = String(p.productCode).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (pCodeClean.length >= 2) {
      return cleanVal.startsWith(pCodeClean);
    }
    return false;
  });
  if (match) return match;

  // 2A. Exact match by raw productName
  match = products.find(p => p && p.productName && String(p.productName).trim().toLowerCase() === rawLower);
  if (match) return match;

  // 2B. Clean exact match by alphanumeric productName
  match = products.find(p => p && p.productName && String(p.productName).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (match) return match;

  // 2C. Prefix match by productName (longest first)
  const sortedProductsByName = [...products]
    .filter(p => p && p.productName)
    .sort((a, b) => String(b.productName).length - String(a.productName).length);

  match = sortedProductsByName.find(p => {
    const pNameClean = String(p.productName).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (pNameClean.length >= 5) {
      return cleanVal.startsWith(pNameClean);
    }
    return false;
  });
  if (match) return match;

  return null;
}

function toggleImportModeFields() {
  const mode = document.querySelector("input[name='sales-import-mode']:checked")?.value || "OVERWRITE_ALL";
  const monthBox = document.getElementById("container-replace-month");
  if (monthBox) {
    monthBox.style.display = (mode === "REPLACE_MONTH") ? "block" : "none";
  }
}

function populateReplaceMonthOptions(datesList = []) {
  const sel = document.getElementById("select-replace-month");
  if (!sel) return;

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthSet = new Set();

  // 1. Months from current uploaded Excel rows
  if (Array.isArray(datesList)) {
    datesList.forEach(d => {
      if (!d) return;
      const norm = (typeof normalizeDateForEngine === "function") 
        ? normalizeDateForEngine(d) 
        : String(d);
      if (norm && /^\d{4}-\d{2}/.test(norm)) {
        monthSet.add(norm.substring(0, 7));
      }
    });
  }

  // 2. Months from existing DB sales
  const existingSales = window.db.getSales() || [];
  existingSales.forEach(s => {
    if (s.transactionDate) {
      const norm = (typeof normalizeDateForEngine === "function") 
        ? normalizeDateForEngine(s.transactionDate) 
        : String(s.transactionDate);
      if (norm && /^\d{4}-\d{2}/.test(norm)) {
        monthSet.add(norm.substring(0, 7));
      }
    }
  });

  // Default fallback if empty
  if (monthSet.size === 0) {
    const curYear = new Date().getFullYear();
    monthSet.add(`${curYear}-10`);
    monthSet.add(`${curYear}-11`);
    monthSet.add(`${curYear}-12`);
  }

  const sortedMonths = Array.from(monthSet).sort().reverse();
    currentVal = sel.value; if (!currentVal) currentVal = localStorage.getItem('dashLastMonth') || '';

  sel.innerHTML = "";
  sortedMonths.forEach(m => {
    const parts = m.split("-");
    const yyyy = parts[0];
    const mmIdx = parseInt(parts[1], 10) - 1;
    const label = `${m} (${monthNames[mmIdx] || ''} ${yyyy})`;

    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = label;
    sel.appendChild(opt);
  });

  if (currentVal && sortedMonths.includes(currentVal)) {
    sel.value = currentVal;
  }
}

function updateMappingPreview() {
  renderMappingMasterReference();

  const invIdx = parseInt(document.getElementById("map-col-inv")?.value || "0");
  const dateIdx = parseInt(document.getElementById("map-col-date")?.value || "1");
  const storeIdx = parseInt(document.getElementById("map-col-store")?.value || "2");
  const prodIdx = parseInt(document.getElementById("map-col-product")?.value || "3");
  const qtyIdx = parseInt(document.getElementById("map-col-qty")?.value || "4");
  const priceIdx = parseInt(document.getElementById("map-col-price")?.value || "-1");

  const datesSample = currentUploadedFileRows.slice(0, 100).map(r => r[dateIdx]).filter(Boolean);
  populateReplaceMonthOptions(datesSample);
  toggleImportModeFields();

  const tbody = document.querySelector("#mapping-preview-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const stores = window.db.getStores() || [];
  const products = window.db.getProducts() || [];

  const previewRows = currentUploadedFileRows.slice(0, 5);

  if (previewRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b;">Tidak ada baris data transaksi pada baris terpilih ini. Silakan atur Baris Judul Kolom.</td></tr>`;
    return;
  }

  previewRows.forEach(row => {
    const invVal = row[invIdx] || "-";
    const dateVal = row[dateIdx] || "-";
    const storeCodeVal = String(row[storeIdx] || "").trim();
    const prodCodeVal = String(row[prodIdx] || "").trim();
    const qtyVal = row[qtyIdx] || "0";
    const priceVal = priceIdx >= 0 ? (row[priceIdx] || "0") : "-";

    const matchedStore = findMatchedStore(storeCodeVal, stores);
    const matchedProd = findMatchedProduct(prodCodeVal, products);

    const isMasterMatch = matchedStore && matchedProd;

    const rawExcludeVal = selectedExcludeColumnIndex >= 0 ? String(row[selectedExcludeColumnIndex] || "").trim() : "";
    const excludeKey = rawExcludeVal === "" ? "(Kosong / Blank)" : rawExcludeVal;
    const isExcluded = selectedExcludeColumnIndex >= 0 && selectedExcludedValues.has(excludeKey);

    let statusBadgeHTML = "";
    if (isExcluded) {
      statusBadgeHTML = '<span class="badge badge-danger" style="background:#dc2626; color:white;"><i class="fa-solid fa-ban"></i> Dikecualikan (Filter Exclude)</span>';
    } else if (isMasterMatch) {
      statusBadgeHTML = '<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> Ikut Hitung Campaign</span>';
    } else {
      statusBadgeHTML = '<span class="badge badge-info"><i class="fa-solid fa-file-import"></i> Tetap Diimpor (Auto Master)</span>';
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${invVal}</code></td>
      <td>${dateVal}</td>
      <td><strong>${storeCodeVal || '-'}</strong></td>
      <td>${matchedStore ? `<span style="color:#15803d; font-weight:600;"><i class="fa-solid fa-check"></i> ${matchedStore.storeName}</span>` : '<span style="color:#0284c7; font-size:0.75rem;">(Auto Tambah Master Toko)</span>'}</td>
      <td><code>${prodCodeVal || '-'}</code></td>
      <td><strong>${qtyVal}</strong></td>
      <td>${priceVal}</td>
      <td>${statusBadgeHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

function parseSalesNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  let s = String(val).trim().replace(/Rp/gi, "").trim();
  if (!s) return 0;
  s = s.replace(/\s+/g, "");

  let isNegative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    isNegative = true;
    s = s.substring(1, s.length - 1).trim();
  } else if (s.startsWith("-")) {
    isNegative = true;
    s = s.substring(1).trim();
  }

  if (s.includes(".") && s.includes(",")) {
    if (s.indexOf(".") < s.indexOf(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, "");
    }
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }

  let num = parseFloat(s);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

function confirmImportSalesWithMapping() {
  const btn = document.getElementById("btn-confirm-import");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sedang Memproses & Mengimpor Data...`;
  }

  showToast("Sedang memproses & mengimpor baris data penjualan...", "info");

  setTimeout(() => {
    try {
      const invIdx = parseInt(document.getElementById("map-col-inv").value);
      const dateIdx = parseInt(document.getElementById("map-col-date").value);
      const storeIdx = parseInt(document.getElementById("map-col-store").value);
      const storeNameIdx = parseInt(document.getElementById("map-col-store-name")?.value || "-1");
        const storeRegionIdx = parseInt(document.getElementById("map-col-store-region")?.value || "-1");
        const storeMarketIdx = parseInt(document.getElementById("map-col-store-market")?.value || "-1");
        const prodIdx = parseInt(document.getElementById("map-col-product").value);
      const qtyIdx = parseInt(document.getElementById("map-col-qty").value);
      const priceIdx = parseInt(document.getElementById("map-col-price").value);

      const stores = window.db.getStores() || [];
      const products = window.db.getProducts() || [];

      const currentUser = window.auth.getCurrentUser();
      const isAdminSalesman = currentUser && (currentUser.role === "ADMIN_SALESMAN" || currentUser.role === "SALESMAN");
      const currentMonthStr = new Date().toISOString().substring(0, 7);

      let salesData = [];
      let skipped = 0;
      let excludedCount = 0;
      let ignoredOtherMonthsCount = 0;

      currentUploadedFileRows.forEach(cols => {
        // Exclude check
        if (selectedExcludeColumnIndex >= 0 && selectedExcludedValues.size > 0) {
          const rawVal = String(cols[selectedExcludeColumnIndex] || "").trim();
          const valKey = rawVal === "" ? "(Kosong / Blank)" : rawVal;
          if (selectedExcludedValues.has(valKey)) {
            excludedCount++;
            return;
          }
        }

        const inv = String(cols[invIdx] || "").trim();
        const date = String(cols[dateIdx] || "").trim();
        const storeCode = String(cols[storeIdx] || "").trim();
        const prodCode = String(cols[prodIdx] || "").trim();
        const qty = parseSalesNumber(cols[qtyIdx]);

        // Strict filter for ADMIN_SALESMAN: only allow current month transactions
        if (isAdminSalesman && date) {
          const normD = normalizeDateForEngine(date);
          if (normD && normD.length >= 7) {
            const rowMonth = normD.substring(0, 7);
            if (rowMonth !== currentMonthStr) {
              ignoredOtherMonthsCount++;
              return; // Ignore row from other month
            }
          }
        }

        // Skip only if the entire row is completely blank
        if (!storeCode && !prodCode && qty === 0 && (priceIdx < 0 || parseSalesNumber(cols[priceIdx]) === 0)) {
          skipped++;
          return;
        }

        let store = findMatchedStore(storeCode, stores);
          if (!store && storeCode) {
            const rawStoreName = storeNameIdx >= 0 ? String(cols[storeNameIdx] || "").trim() : "";
            const rawStoreRegion = storeRegionIdx >= 0 ? String(cols[storeRegionIdx] || "").trim() : "";
              const rawStoreMarket = storeMarketIdx >= 0 ? String(cols[storeMarketIdx] || "").trim() : "";
            store = window.db.addStore({
              storeCode: storeCode,
              storeName: rawStoreName || storeCode,
              region: rawStoreRegion || "-",
                marketCategory: rawStoreMarket,
              userId: "",
              isCampaignEligible: true
            });
          }
          const prod = findMatchedProduct(prodCode, products);

        let totalOmzet = priceIdx >= 0 ? parseSalesNumber(cols[priceIdx]) : 0;
        if (totalOmzet === 0 && qty !== 0 && prod && prod.unitPrice > 0) {
          totalOmzet = qty * prod.unitPrice;
        }

        const price = qty !== 0 ? (totalOmzet / qty) : totalOmzet;

        salesData.push({
          invoiceNo: inv || "-",
          transactionDate: date || "-",
          storeId: store ? store.id : null,
          storeCode: storeCode,
          productId: prod ? prod.id : null,
          productCode: prodCode,
          qty: qty,
          price: price,
          totalOmzet: totalOmzet
        });
      });

      if (salesData.length > 0) {
        // Save column mapping if checked
        const shouldSaveMapping = document.getElementById("chk-save-mapping")?.checked !== false;
        if (shouldSaveMapping) {
          saveMappingConfig(selectedHeaderRowIndex, currentUploadedFileHeaders);
        }

        let importMode = document.querySelector("input[name='sales-import-mode']:checked")?.value || "OVERWRITE_ALL";
        let targetMonth = document.getElementById("select-replace-month")?.value || "";

        if (isAdminSalesman) {
          importMode = "REPLACE_MONTH";
          targetMonth = currentMonthStr;
        }

        const inserted = window.db.addSalesBatch(salesData, importMode, targetMonth);
        localStorage.setItem("lastSalesImportTime", new Date().toISOString());

        let filterNote = excludedCount > 0 ? `, ${excludedCount} baris dikecualikan filter` : "";
        let ignoreNote = ignoredOtherMonthsCount > 0 ? `, ${ignoredOtherMonthsCount} baris bulan lain diabaikan` : "";
        let successMsg = "";

        if (importMode === "REPLACE_MONTH" && targetMonth) {
          const parts = targetMonth.split("-");
          const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
          const mmIdx = parseInt(parts[1], 10) - 1;
          const monthText = `${monthNames[mmIdx] || ''} ${parts[0]}`;
          successMsg = `Berhasil mengganti data penjualan bulan berjalan (${monthText}) dengan ${inserted} baris transaksi Excel!${filterNote}${ignoreNote}`;
        } else if (importMode === "APPEND") {
          successMsg = `Berhasil menambahkan ${inserted} baris transaksi penjualan dari Excel!${filterNote}${ignoreNote}`;
        } else {
          successMsg = `Berhasil mengimpor seluruh ${inserted} baris transaksi penjualan dari file Excel!${filterNote}${ignoreNote}`;
        }

        showToast(successMsg, "success");
        closeModal("modal-mapping");
        renderSalesHistory();
        renderDashboard();

        // New requirement: Automatically calculate & publish for ADMIN_SALESMAN
        if (isAdminSalesman && targetMonth) {
          showToast("Sedang otomatis menghitung ulang cut-off bulan berjalan...", "info");
          setTimeout(async () => {
             try {
               const resCum = window.engine.calculateAllActiveCampaignAchievements(targetMonth, "CUMULATIVE");
               const resMon = window.engine.calculateAllActiveCampaignAchievements(targetMonth, "MONTHLY_ONLY");
               window.db.saveSnapshotForPeriod(targetMonth, "CUMULATIVE", resCum);
               window.db.saveSnapshotForPeriod(targetMonth, "MONTHLY_ONLY", resMon);
               
               let config = window.db.getSupabaseConfig();
               if (!config || !config.url) {
                  const cfgStr = localStorage.getItem("CAMPAIGN_SUPABASE_CONFIG");
                  if (cfgStr) try { config = JSON.parse(cfgStr); } catch(e){}
               }
               if (config && config.url && config.anonKey) {
                  showToast("Sedang mem-publish hasil cut-off ke Supabase...", "info");
                  await publishDashboardSnapshotToSupabase(config);
                  showToast("Sukses: Hasil perhitungan otomatis ter-publish ke Supabase!", "success");
               } else {
                  showToast("Sukses menghitung, namun koneksi Supabase belum disetting.", "warning");
               }
             } catch(err) {
               console.error("Auto calc/publish error:", err);
               showToast("Gagal otomatis publish ke Supabase: " + err.message, "danger");
             }
          }, 500);
        }
      } else {
        const adminNotice = isAdminSalesman ? " File Excel tidak berisi transaksi bulan berjalan (" + currentMonthStr + ")." : "";
        showToast("Tidak ada baris data transaksi yang valid." + adminNotice + " Mohon periksa kembali file Excel dan pilihan kolom.", "danger");
      }
    } catch (err) {
      console.error("Error importing sales mapping:", err);
      showToast("Terjadi kesalahan saat mengimpor data: " + (err.message || err), "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-import"></i> Impor Data Penjualan Sekarang`;
      }
    }
  }, 50);
}

function openSalesMappingModal() {
  if (currentUploadedFileHeaders.length === 0) {
    showToast("Silakan pilih file data penjualan terlebih dahulu.", "warning");
    document.getElementById("sales-file-input").click();
    return;
  }

  const currentUser = window.auth.getCurrentUser();
  const isAdminSalesman = currentUser && (currentUser.role === "ADMIN_SALESMAN" || currentUser.role === "SALESMAN");

  if (isAdminSalesman) {
    const curM = new Date().toISOString().substring(0, 7);
    const replaceRadio = document.querySelector("input[name='sales-import-mode'][value='REPLACE_MONTH']");
    if (replaceRadio) {
      replaceRadio.checked = true;
      toggleImportModeFields();
    }
    const selMonth = document.getElementById("select-replace-month");
    if (selMonth) {
      selMonth.value = curM;
    }
    document.querySelectorAll("input[name='sales-import-mode']").forEach(radio => {
      if (radio.value !== "REPLACE_MONTH") {
        radio.disabled = true;
        if (radio.closest("label")) radio.closest("label").style.opacity = "0.5";
      }
    });
  } else {
    document.querySelectorAll("input[name='sales-import-mode']").forEach(radio => {
      radio.disabled = false;
      if (radio.closest("label")) radio.closest("label").style.opacity = "1";
    });
  }

  openModal("modal-mapping");
}

function runCurrentMonthCalculation() {
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const parts = currentMonthStr.split("-");
  const mmIdx = parseInt(parts[1], 10) - 1;
  const monthText = `${monthNames[mmIdx] || ''} ${parts[0]}`;

  const calcBtns = document.querySelectorAll(".role-salesman-calc, #btn-calc-current-month");
  calcBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.backgroundColor = '#dc2626';
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghitung Cut-off ${monthText}...`;
  });

  setTimeout(() => {
    try {
      const resultsCum = window.engine.calculateAllActiveCampaignAchievements(currentMonthStr, "CUMULATIVE");
      window.db.saveSnapshotForPeriod(currentMonthStr, "CUMULATIVE", resultsCum);

      const resultsMon = window.engine.calculateAllActiveCampaignAchievements(currentMonthStr, "MONTHLY_ONLY");
      window.db.saveSnapshotForPeriod(currentMonthStr, "MONTHLY_ONLY", resultsMon);

      showToast(`Sukses menghitung pencapaian cut-off bulan berjalan (${monthText})!`, "success");

      const dashMonthEl = document.getElementById("dash-month-filter");
      if (dashMonthEl) dashMonthEl.value = currentMonthStr;

      renderDashboard();
      renderAchievements();
    } catch (err) {
      console.error("Error calculating current month:", err);
      showToast("Gagal menghitung pencapaian: " + (err.message || err), "danger");
    } finally {
      calcBtns.forEach(btn => {
        btn.disabled = false;
        btn.style.backgroundColor = '';
        btn.innerHTML = `<i class="fa-solid fa-calculator"></i> Hitung Cut-off Bulan Berjalan`;
      });
    }
  }, 50);
}

function exportAchievementsCSV() {
    let achievements = window.db.getAchievements();
    achievements = achievements.filter(a => {
      const cmp = window.db.getCampaignById(a.campaignId);
      const evalPeriod = cmp ? cmp.evaluationPeriod : a.evaluationPeriod;
      const eDate = cmp ? cmp.endDate : a.endDate;
      const isPure = (evalPeriod === "PURE_MONTHLY");
      const noEndDate = (!eDate || String(eDate).trim() === "" || String(eDate).trim() === "-");
      if (isPure && noEndDate && a.snapshotCalcMode === "CUMULATIVE") return false;
      return true;
    });
    if (achievements.length === 0) {
      showToast("Belum ada data untuk di-export.", "warning");
      return;
    }
    
    // Apply current filters
    let filteredAchs = achievements;
    const mFil = document.getElementById("ach-month-filter")?.value;
    if (mFil && mFil !== "ALL") filteredAchs = filteredAchs.filter(a => a.snapshotMonth === mFil);
    const cFil = document.getElementById("ach-campaign-filter")?.value;
    if (cFil && cFil !== "ALL") filteredAchs = filteredAchs.filter(a => a.campaignId === cFil);

    if (filteredAchs.length === 0) {
      showToast("Tidak ada data dengan filter terpilih.", "warning");
      return;
    }

    const exportData = filteredAchs.map(a => ({
      "Periode Data": a.snapshotMonth || "-",
      "Kode Campaign": a.campaignCode || "-",
      "Nama Campaign": a.campaignName || "-",
      "Kode Toko": a.storeCode || "-",
      "Nama Toko": a.storeName || "-",
      "Total Qty (Unit)": a.totalQty || 0,
      "Total Omzet (Rp/Poin)": a.totalOmzet || 0,
      "Tier Level": a.matchedTierLevel || 0,
      "Nama Tier": a.matchedTierName || "-",
      "Incentive Rate Item (Rp)": a.itemRateRewardsTotal || 0,
      "Hadiah Cash (Rp)": a.fixedCashAmount || 0,
      "Hadiah Voucher (Rp)": a.fixedVoucherAmount || 0,
      "Hadiah Barang": a.goodsDescription || "-",
      "TOTAL VALUE REWARD (Rp)": a.totalRewardValue || 0,
      "Status Payout": a.payoutStatus || "PENDING"
    }));

    if (typeof XLSX !== "undefined") {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pencapaian_Toko");
      XLSX.writeFile(wb, "Laporan_Pencapaian_Toko_" + new Date().toISOString().split("T")[0] + ".xlsx");
      showToast("File Laporan Excel berhasil diunduh!", "success");
    } else {
      showToast("Gagal export: library Excel tidak tersedia.", "danger");
    }
  }

// Helpers
function openModal(id) {
  document.getElementById(id).classList.add("active");
  // Tambahkan state modal ke history URL untuk fitur tombol back fisik HP
  if (window.location.hash !== "#" + id) {
    window.location.hash = id;
  }
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  // Jika sedang berada di hash modal ini, kembalikan ke #app
  if (window.location.hash === "#" + id) {
    window.history.back();
  }
}
function closeAllModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("active"));
}

function populateStoreSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">-- Pilih Toko --</option>';
  window.db.getStores().forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.storeCode} - ${s.storeName}`;
    sel.appendChild(opt);
  });
}

function populateGroupSelect(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">-- Pilih Group --</option>';
  window.db.getProductGroups().forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = `${g.groupCode} - ${g.groupName}`;
    sel.appendChild(opt);
  });
}

function formatGoodsItemString(name, rawQty) {
  const q = parseFloat(rawQty);
  const cleanName = String(name || "").trim();
  if (q === 0) return cleanName;
  const validQ = isNaN(q) ? 1 : q;
  const formattedQty = (validQ % 1 === 0) ? validQ.toString() : parseFloat(validQ.toFixed(4)).toString();
  if (/\b(gram|gr|unit|pcs|set|pack|voucher|lembar|btg|batang|kg)\b/i.test(cleanName)) {
    return `${formattedQty} ${cleanName}`;
  }
  return `${formattedQty} Unit ${cleanName}`;
}

function formatRupiah(num) {
  return "Rp " + (num || 0).toLocaleString("id-ID");
}

function formatPoin(num) {
  const n = parseFloat(num || 0);
  if (isNaN(n)) return "0 Poin";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " Poin";
}

function getPayoutBadge(status) {
  switch (status) {
    case "APPROVED": return '<span class="badge badge-success">APPROVED</span>';
    case "TRANSFERRED": return '<span class="badge badge-info">TRANSFERRED</span>';
    case "CLAIMED": return '<span class="badge badge-success">CLAIMED</span>';
    case "PENDING": return '<span class="badge badge-warning">PENDING</span>';
    default: return '<span class="badge badge-secondary">BELUM LOLOS</span>';
  }
}

function showToast(msg, type = "info", toastId = null) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  if (toastId) {
    let existing = document.getElementById(toastId);
    if (existing) {
      existing.className = `toast toast-${type}`;
      existing.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
      return existing;
    }
  }

  const toast = document.createElement("div");
  if (toastId) toast.id = toastId;
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
  container.appendChild(toast);

  const timeoutMs = toastId ? 15000 : 4000;
  setTimeout(() => {
    if (document.body.contains(toast)) toast.remove();
  }, timeoutMs);

  return toast;
}

// --- MASTER DATA EXCEL UPLOAD & TEMPLATE GENERATOR ---
let currentMasterUploadType = ""; // "STORE", "GROUP", "PRODUCT", "USER"
let parsedMasterDataRows = [];

function openMasterUploadModal(masterType) {
  currentMasterUploadType = masterType;
  parsedMasterDataRows = [];

  const titleEl = document.getElementById("master-upload-title");
  const descEl = document.getElementById("master-upload-desc");

  const titles = {
    STORE: '<i class="fa-solid fa-store"></i> Upload Excel Master Toko',
    GROUP: '<i class="fa-solid fa-layer-group"></i> Upload Excel Master Group Produk',
    PRODUCT: '<i class="fa-solid fa-barcode"></i> Upload Excel Master Produk (SKU)',
    USER: '<i class="fa-solid fa-users-gear"></i> Upload Excel Master User & Hak Akses'
  };

  const descs = {
    STORE: 'Upload file Excel untuk menambah atau memperbarui data Master Toko (Kode Toko, Nama Toko, Wilayah, Kategori/Market).',
    GROUP: 'Upload file Excel untuk menambah atau memperbarui data Master Group/Type Produk (Kode Group, Nama Group).',
    PRODUCT: 'Upload file Excel untuk menambah atau memperbarui data Master Produk SKU (Kode SKU, Nama Produk, Kode Group, Harga Satuan).',
    USER: 'Upload file Excel untuk menambah atau memperbarui User Aplikasi (Username, Password, Nama Lengkap, Role, Kode Toko Terkait).'
  };

  if (titleEl) titleEl.innerHTML = titles[masterType] || "Upload Master Data Excel";
  if (descEl) descEl.textContent = descs[masterType] || "Upload file Excel master data.";

  document.getElementById("master-file-input").value = "";
  document.getElementById("master-preview-container").style.display = "none";
  document.getElementById("btn-confirm-master-import").disabled = true;

  openModal("modal-master-upload");
}

function downloadMasterTemplate() {
  if (typeof XLSX === "undefined") {
    showToast("Pustaka SheetJS belum dimuat", "danger");
    return;
  }

  let sampleData = [];
  let fileName = "";

  if (currentMasterUploadType === "STORE") {
    fileName = "Template_Master_Toko.xlsx";
    sampleData = [
      { "Kode Toko": "TKO-001", "Nama Toko": "Toko Sumber Makmur", "Wilayah": "Jakarta", "Boleh Mengikuti Campaign": "YA" },
      { "Kode Toko": "TKO-002", "Nama Toko": "Toko Jaya Abadi", "Wilayah": "Surabaya", "Boleh Mengikuti Campaign": "YA" }
    ];
  } else if (currentMasterUploadType === "GROUP") {
    fileName = "Template_Master_Group_Produk.xlsx";
    sampleData = [
      { "Kode Group": "TYPE-A", "Nama Group": "Product Type A (Premium Series)" },
      { "Kode Group": "TYPE-B", "Nama Group": "Product Type B (Standard Series)" }
    ];
  } else if (currentMasterUploadType === "PRODUCT") {
    fileName = "Template_Master_Produk_SKU.xlsx";
    sampleData = [
      { "Kode SKU": "SKU-A1", "Nama Produk": "TV LED 50 Inch Premium", "Kode Group": "TYPE-A", "Poin Satuan": 10 },
      { "Kode SKU": "SKU-B1", "Nama Produk": "Mesin Cuci Automatic", "Kode Group": "TYPE-B", "Poin Satuan": 5 }
    ];
  } else if (currentMasterUploadType === "USER") {
    fileName = "Template_Master_User.xlsx";
    sampleData = [
      { "Username": "toko_subur", "Password": "password123", "Nama Lengkap": "Toko Subur Jaya", "Role": "TOKO", "Kode Toko Terkait": "TKO-001" },
      { "Username": "sales_budi", "Password": "password123", "Nama Lengkap": "Budi Salesman", "Role": "SALESMAN", "Kode Toko Terkait": "" }
    ];
  }

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Master Data");
  XLSX.writeFile(wb, fileName);
  showToast(`Template ${fileName} berhasil diunduh!`, "success");
}

function handleMasterFileSelect(file) {
  if (!file) return;

  if (typeof XLSX === "undefined") {
    showToast("Pustaka SheetJS (XLSX) belum dimuat.", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!json || json.length === 0) {
        showToast("File tidak berisi baris data yang valid.", "warning");
        return;
      }

      parsedMasterDataRows = json;
      renderMasterPreviewTable(json);
      document.getElementById("btn-confirm-master-import").disabled = false;
    } catch (err) {
      showToast("Gagal membaca file Excel: " + err.message, "danger");
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderMasterPreviewTable(rows) {
  const container = document.getElementById("master-preview-container");
  const countSpan = document.getElementById("master-preview-count");
  const theadTr = document.getElementById("master-preview-thead");
  const tbody = document.getElementById("master-preview-tbody");

  if (!rows || rows.length === 0) {
    container.style.display = "none";
    return;
  }

  const keys = Object.keys(rows[0]);
  countSpan.textContent = rows.length;

  theadTr.innerHTML = keys.map(k => `<th>${k}</th>`).join("");
  tbody.innerHTML = rows.slice(0, 10).map(row => {
    return `<tr>${keys.map(k => `<td>${row[k]}</td>`).join("")}</tr>`;
  }).join("");

  if (rows.length > 10) {
    tbody.innerHTML += `<tr><td colspan="${keys.length}" style="text-align:center; color:#64748b; font-style:italic;">... dan ${rows.length - 10} baris lainnya ...</td></tr>`;
  }

  container.style.display = "block";
}

function confirmImportMasterData() {
  if (!parsedMasterDataRows || parsedMasterDataRows.length === 0) {
    showToast("Tidak ada data yang diimpor.", "warning");
    return;
  }

  const mode = document.querySelector("input[name='master-import-mode']:checked")?.value || "UPSERT";
  const type = currentMasterUploadType;

  let createdCount = 0;
  let updatedCount = 0;

  if (type === "STORE") {
    if (mode === "OVERWRITE") {
      const db = window.db.getDatabase();
      db.stores = [];
      window.db.saveDatabase(db);
    }

    parsedMasterDataRows.forEach(row => {
      const code = String(findRowVal(row, ["kode toko", "store code", "kode", "code"])).trim();
      const name = String(findRowVal(row, ["nama toko", "store name", "nama", "name"])).trim();
      const region = String(findRowVal(row, ["wilayah", "region", "kota"])).trim() || "Utama";
      const salesman = String(findRowVal(row, ["salesman", "nama salesman", "sales", "sales name", "salesperson"])).trim();
      const eligibleVal = String(findRowVal(row, ["boleh mengikuti campaign", "eligible", "status"])).trim().toLowerCase();
      const isEligible = eligibleVal === "tidak" || eligibleVal === "false" || eligibleVal === "0" ? false : true;

      if (code && name) {
        const existing = window.db.getStores().find(s => s.storeCode.toLowerCase() === code.toLowerCase());
        if (existing) {
          window.db.addStore({ ...existing, storeName: name, region: reg, marketCategory: marketCat, salesmanName: salesman || existing.salesmanName || "", isCampaignEligible: isEligible });
          updatedCount++;
        } else {
          window.db.addStore({ storeCode: code, storeName: name, region: reg, marketCategory: marketCat, salesmanName: salesman, isCampaignEligible: isEligible });
          createdCount++;
        }
      }
    });

    showToast(`Master Toko Sukses! ${createdCount} baru dibuat, ${updatedCount} diperbarui.`, "success");
    renderMasterData();

  } else if (type === "GROUP") {
    if (mode === "OVERWRITE") {
      const db = window.db.getDatabase();
      db.productGroups = [];
      window.db.saveDatabase(db);
    }

    parsedMasterDataRows.forEach(row => {
      const code = String(findRowVal(row, ["kode group", "group code", "type", "kode"])).trim();
      const name = String(findRowVal(row, ["nama group", "group name", "nama"])).trim();

      if (code && name) {
        const existing = window.db.getProductGroups().find(g => g.groupCode.toLowerCase() === code.toLowerCase());
        if (existing) {
          window.db.addProductGroup({ ...existing, groupName: name });
          updatedCount++;
        } else {
          window.db.addProductGroup({ groupCode: code, groupName: name });
          createdCount++;
        }
      }
    });

    showToast(`Master Group Sukses! ${createdCount} baru dibuat, ${updatedCount} diperbarui.`, "success");
    renderMasterData();

  } else if (type === "PRODUCT") {
    if (mode === "OVERWRITE") {
      const db = window.db.getDatabase();
      db.products = [];
      window.db.saveDatabase(db);
    }

    const groups = window.db.getProductGroups();

    parsedMasterDataRows.forEach(row => {
      const code = String(findRowVal(row, ["kode sku", "kode produk", "sku code", "kode"])).trim();
      const name = String(findRowVal(row, ["nama produk", "product name", "nama"])).trim();
      const grpCode = String(findRowVal(row, ["kode group", "group code", "group/type", "group"])).trim();
      const price = parseFloat(findRowVal(row, ["poin satuan", "poin", "nilai poin", "harga satuan", "unit price", "harga", "price"]) || "0");

      if (code && name) {
        let grp = groups.find(g => g.groupCode.toLowerCase() === grpCode.toLowerCase());
        if (!grp && grpCode) {
          grp = window.db.addProductGroup({ groupCode: grpCode, groupName: "Group " + grpCode });
          groups.push(grp);
        }

        const grpId = grp ? grp.id : (groups[0] ? groups[0].id : "grp_type_a");

        const existing = window.db.getProducts().find(p => p.productCode.toLowerCase() === code.toLowerCase());
        if (existing) {
          window.db.addProduct({ ...existing, productName: name, groupId: grpId, unitPrice: price });
          updatedCount++;
        } else {
          window.db.addProduct({ productCode: code, productName: name, groupId: grpId, unitPrice: price });
          createdCount++;
        }
      }
    });

    showToast(`Master Produk (SKU) Sukses! ${createdCount} baru dibuat, ${updatedCount} diperbarui.`, "success");
    renderMasterData();

  } else if (type === "USER") {
    if (mode === "OVERWRITE") {
      const db = window.db.getDatabase();
      db.users = db.users.filter(u => u.username === "admin");
      window.db.saveDatabase(db);
    }

    const stores = window.db.getStores();

    parsedMasterDataRows.forEach(row => {
      const uname = String(findRowVal(row, ["username", "user"])).trim();
      const pass = String(findRowVal(row, ["password", "pass"])).trim() || "123456";
      const fname = String(findRowVal(row, ["nama lengkap", "full name", "nama"])).trim();
      const roleStr = String(findRowVal(row, ["role", "hak akses"])).trim().toUpperCase() || "TOKO";
      const storeCode = String(findRowVal(row, ["kode toko terkait", "kode toko", "store code"])).trim();

      const cleanRoleStr = roleStr.replace(/[\s\-]+/g, "_");
      const validRole = ["TOKO", "SALESMAN", "ADMIN_SALESMAN", "MANAGER", "SUPER_ADMIN"].includes(cleanRoleStr) ? cleanRoleStr : "TOKO";
      const matchedStore = stores.find(s => s.storeCode.toLowerCase() === storeCode.toLowerCase());

      if (uname && fname) {
        const existing = window.db.getUserByUsername(uname);
        if (existing) {
          window.db.updateUser(existing.id, {
            username: uname,
            passwordHash: pass,
            password: pass,
            fullname: fname,
            role: validRole,
            storeId: matchedStore ? matchedStore.id : null
          });
          updatedCount++;
        } else {
          window.db.addUser({
            username: uname,
            password: pass,
            fullname: fname,
            role: validRole,
            storeId: matchedStore ? matchedStore.id : null
          });
          createdCount++;
        }
      }
    });

    showToast(`Master User Sukses! ${createdCount} baru dibuat, ${updatedCount} diperbarui.`, "success");
    renderUsers();
  }

  syncMasterDataToSupabaseCloudSilently();
  closeModal("modal-master-upload");
}

function findRowVal(rowObj, keyCandidates) {
  if (!rowObj || typeof rowObj !== "object") return "";
  const keys = Object.keys(rowObj);
  for (let cand of keyCandidates) {
    const matchKey = keys.find(k => k.toLowerCase().trim().includes(cand));
    if (matchKey && rowObj[matchKey] !== undefined && rowObj[matchKey] !== "") {
      return rowObj[matchKey];
    }
  }
  return "";
}

// --- LOGIN HELPERS ---
function quickFillLogin(username, password) {
  const unameEl = document.getElementById("login-username");
  const passEl = document.getElementById("login-password");
  const errEl = document.getElementById("login-error-msg");

  if (unameEl) unameEl.value = username;
  if (passEl) passEl.value = password;
  if (errEl) {
    errEl.style.display = "none";
    errEl.textContent = "";
  }

  const form = document.getElementById("login-form");
  if (form) {
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
}

function resetDatabaseFromLogin(e) {
  if (e) e.preventDefault();
  if (confirm("Apakah Anda yakin ingin melakukan reset & restore database ke default demo?\nSemua data lokal akan dikembalikan ke data awal demo.")) {
    window.db.resetToSeed();
    showToast("Database & Akun Demo berhasil di-restore!", "success");
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
}

// --- SUPABASE SYNC LOGIC & HELPERS ---
function openSupabaseSyncModal() {
  const savedConfigStr = localStorage.getItem("CAMPAIGN_SUPABASE_CONFIG");
  let config = { url: "", anonKey: "", tableName: "dashboard_snapshots" };
  if (savedConfigStr) {
    try {
      config = JSON.parse(savedConfigStr);
    } catch (e) {
      console.error("Error parsing saved Supabase config", e);
    }
  }

  const urlInput = document.getElementById("supabase-url");
  const keyInput = document.getElementById("supabase-anon-key");
  const tableInput = document.getElementById("supabase-table-name");

  if (urlInput) urlInput.value = config.url || "";
  if (keyInput) keyInput.value = config.anonKey || "";
  if (tableInput) tableInput.value = config.tableName || "dashboard_snapshots";

  const sqlSnippet = document.getElementById("supabase-sql-snippet");
  if (sqlSnippet) {
    sqlSnippet.value = `CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_month TEXT,
  calc_mode TEXT,
  store_code TEXT,
  store_name TEXT,
  region TEXT,
  salesman_name TEXT,
  campaign_code TEXT,
  campaign_name TEXT,
  target_basis TEXT,
  matched_tier_level INT,
  matched_tier_name TEXT,
  progress_percentage INT,
  gap_description TEXT,
  total_qty NUMERIC,
  total_omzet NUMERIC,
  total_reward_value NUMERIC,
  goods_description TEXT,
  sku_breakdown JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE dashboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and admin upsert" ON dashboard_snapshots FOR ALL USING (true) WITH CHECK (true);`;
  }
  // Role check for supabase modal: hide form body for admin-salesman
  const _supaUser = window.auth ? window.auth.getCurrentUser() : null;
  const _supaRole = _supaUser ? String(_supaUser.role || "").toUpperCase().trim().replace(/[\s\-]+/g, "_") : "";
  const _isAdminSales = _supaRole === "ADMIN_SALESMAN" || _supaRole === "ADMINSALESMAN";
  const _supaFormBody = document.getElementById("supabase-form-body");
  if (_supaFormBody) _supaFormBody.style.display = _isAdminSales ? "none" : "";
  openModal("modal-supabase-sync");
}
function copySupabaseSQLScript() {
  const snippet = document.getElementById("supabase-sql-snippet");
  if (!snippet || !snippet.value) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(snippet.value).then(() => {
      showToast("Script SQL berhasil disalin ke clipboard!", "success");
    }).catch(() => {
      snippet.select();
      document.execCommand("copy");
      showToast("Script SQL berhasil disalin!", "success");
    });
  } else {
    snippet.select();
    document.execCommand("copy");
    showToast("Script SQL berhasil disalin!", "success");
  }
}

async function testSupabaseConnection() {
  const url = document.getElementById("supabase-url")?.value.trim().replace(/\/+$/, "");
  const anonKey = document.getElementById("supabase-anon-key")?.value.trim();
  const tableName = document.getElementById("supabase-table-name")?.value.trim() || "dashboard_snapshots";

  if (!url || !anonKey) {
    showToast("Harap isi URL dan Anon API Key Supabase terlebih dahulu", "danger");
    return;
  }

  showToast("Menguji koneksi ke Supabase REST API...", "info");

  try {
    const res = await fetch(`${url}/rest/v1/${tableName}?select=count&limit=1`, {
      method: "GET",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      }
    });

    if (res.ok || res.status === 200 || res.status === 206) {
      showToast("Koneksi ke Supabase Berhasil! Tabel database ditemukan dan siap digunakan.", "success");
      const config = { url, anonKey, tableName };
      if (window.db && typeof window.db.saveSupabaseConfig === "function") {
        window.db.saveSupabaseConfig(config);
      }
    } else {
      const errText = await res.text();
      let msg = res.statusText;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.message || errJson.hint || res.statusText;
      } catch (e) {
        if (errText) msg = errText;
      }
      showToast(`Gagal koneksi Supabase (${res.status}): ${msg}`, "danger");
    }
  } catch (err) {
    showToast("Gagal terhubung ke Supabase: " + (err.message || "Network Error / URL Tidak Valid"), "danger");
  }
}

async function downloadDataFromSupabaseCloud() {
  const url = document.getElementById("supabase-url")?.value.trim().replace(/\/+$/, "");
  const anonKey = document.getElementById("supabase-anon-key")?.value.trim();
  const tableName = document.getElementById("supabase-table-name")?.value.trim() || "dashboard_snapshots";

  if (!url || !anonKey) {
    showToast("Harap masukkan URL dan Anon API Key Supabase terlebih dahulu", "danger");
    return;
  }

  const config = { url, anonKey, tableName };
  if (window.db && typeof window.db.saveSupabaseConfig === "function") {
    window.db.saveSupabaseConfig(config);
  }

  const btn = document.getElementById("btn-download-supabase-data");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengunduh Data Cloud...';
  }

  try {
    showToast("Mengunduh data snapshot & user dari Supabase Cloud...", "info");
    const success = await loadCloudSnapshotsFromSupabase();
    if (success) {
      showToast("Berhasil mengunduh & memulihkan data dari Supabase Cloud!", "success");
      closeModal("modal-supabase-sync");
      if (typeof renderUsers === "function") renderUsers();
      if (typeof renderMasterData === "function") renderMasterData();
      if (typeof renderDashboard === "function") renderDashboard();
    } else {
      showToast("Tidak ada data ditemukan di Supabase Cloud atau koneksi gagal.", "warning");
    }
  } catch(err) {
    showToast("Gagal mengunduh dari Supabase: " + err.message, "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Unduh Data dari Supabase';
    }
  }
}

function downloadLocalDatabaseBackup() {
  try {
    const dbData = window.db.getDatabase();
      const backupObj = {
        _APP_DATABASE: dbData,
        _LOCAL_MAPPING: localStorage.getItem("CAMPAIGN_APP_SAVED_SALES_MAPPING_V1")
      };
      const data = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup_sales_campaign_" + new Date().toISOString().split("T")[0] + ".json";
    a.click();
    showToast("File backup JSON otomatis berhasil diunduh!", "success");
  } catch (err) {
    console.error("Gagal membuat auto-backup", err);
  }
}

async function publishDashboardSnapshotToSupabase(config) {
  const selectedMonth = document.getElementById("dash-month-filter")?.value || new Date().toISOString().substring(0, 7);
  if (selectedMonth) localStorage.setItem('dashLastMonth', selectedMonth);
  const calcMode = document.getElementById("dash-calc-mode")?.value || "CUMULATIVE";

  showToast("Menyiapkan snapshot data pencapaian...", "info");
  await new Promise(r => setTimeout(r, 20));

  const allCampaigns = window.db.getCampaigns() || [];
  if (allCampaigns.length === 0) {
    throw new Error("Tidak ada data Master Program Campaign di database.");
  }

  const monthlySnapshots = window.db.getMonthlySnapshots() || {};
  let allAchievements = [];

  // 1. Collect all saved monthly snapshots (if any)
  const snapshotKeys = Object.keys(monthlySnapshots);
  if (snapshotKeys.length > 0) {
    snapshotKeys.forEach(key => {
      const items = monthlySnapshots[key];
      if (Array.isArray(items)) {
        allAchievements.push(...items);
      }
    });
  }

  // 2. Calculate for selected month in both CUMULATIVE & MONTHLY_ONLY modes
  const resCum = window.engine.calculateAllActiveCampaignAchievements(selectedMonth, "CUMULATIVE");
  if (Array.isArray(resCum)) allAchievements.push(...resCum);
  await new Promise(r => setTimeout(r, 10));

  const resMon = window.engine.calculateAllActiveCampaignAchievements(selectedMonth, "MONTHLY_ONLY");
  if (Array.isArray(resMon)) allAchievements.push(...resMon);
  await new Promise(r => setTimeout(r, 10));

  if (!allAchievements || allAchievements.length === 0) {
    throw new Error("Tidak ada data pencapaian active campaign yang dapat dipublikasikan.");
  }

  const storesList = window.db.getStores() || [];
  const storeMap = new Map();
  storesList.forEach(s => {
    if (s.id) storeMap.set(s.id, s);
    if (s.storeCode) storeMap.set(String(s.storeCode).toLowerCase().trim(), s);
  });

  const campaignMap = new Map();
  allCampaigns.forEach(c => {
    if (c.id) campaignMap.set(c.id, c);
    if (c.id) campaignMap.set(String(c.id), c);
    if (c.campaignCode) campaignMap.set(String(c.campaignCode).toLowerCase().trim(), c);
  });

  const uniqueMap = new Map();
  allAchievements.forEach(item => {
    const m = item.snapshotMonth || item.snapshot_month || selectedMonth || "ALL";
    const mode = item.snapshotCalcMode || item.snapshot_calc_mode || item.calcMode || item.calc_mode || calcMode;
    const rawId = `${m}_${mode}_${item.campaignCode}_${item.storeCode}`;
    const uniqueId = rawId.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    const matchedStore = storeMap.get(item.storeId) || storeMap.get(String(item.storeCode || "").toLowerCase().trim());
    const salesmanName = item.salesmanName || (matchedStore ? matchedStore.salesmanName : "") || "";
    const regionName = item.region || (matchedStore ? matchedStore.region : "") || "";

    const cmp = campaignMap.get(item.campaignId) || campaignMap.get(String(item.campaignCode || "").toLowerCase().trim());

    const rawBreakdown = (item.groupBreakdowns && item.groupBreakdowns.length > 0)
      ? item.groupBreakdowns
      : (item.skuBreakdown || item.sku_breakdown || []);

    const masterGroups = window.db.getProductGroups() || [];
    const rawTiers = cmp ? (cmp.tiers || []) : (item.campaignTiers || []);
    const enrichedTiers = rawTiers.map(t => {
      const enrichedRates = (t.rates || []).map(r => {
        const tId = String(r.groupId || r.groupCode || "").toLowerCase().trim();
        const grp = masterGroups.find(g => String(g.id || "").toLowerCase().trim() === tId || String(g.groupCode || "").toLowerCase().trim() === tId);
        return {
          ...r,
          groupCode: grp ? grp.groupCode : (r.groupCode || r.groupId),
          groupName: grp ? grp.groupName : (r.groupName || r.groupId)
        };
      });
      return {
        ...t,
        rates: enrichedRates
      };
    });

    const richPayload = {
      // Strip raw transactions before sending to cloud to save 99% storage space
      groupBreakdowns: (Array.isArray(rawBreakdown) ? rawBreakdown : (rawBreakdown.groupBreakdowns || [])).map(gb => {
        if (!gb) return gb;
        const { transactions, ...rest } = gb;
        return rest;
      }),
      campaignInfo: {
        startDate: cmp ? cmp.startDate : (item.startDate || ""),
        endDate: cmp ? cmp.endDate : (item.endDate || ""),
        evaluationPeriod: cmp ? cmp.evaluationPeriod : (item.evaluationPeriod || ""),
        tiers: enrichedTiers
      },
      totalPoin: item.totalPoin || 0,
        rewardItemBreakdown: item.rewardItemBreakdown || [],
        itemRateRewardsTotal: item.itemRateRewardsTotal || 0,
        fixedVoucherAmount: item.fixedVoucherAmount || 0,
        fixedCashAmount: item.fixedCashAmount || 0,
        isConsistencyAchieved: item.isConsistencyAchieved || false
    };

    uniqueMap.set(uniqueId, {
      id: uniqueId,
      snapshot_month: m,
      calc_mode: mode,
      store_code: item.storeCode,
      store_name: item.storeName,
      region: regionName,
      salesman_name: salesmanName,
      campaign_code: item.campaignCode,
      campaign_name: item.campaignName,
      target_basis: item.targetBasis,
      matched_tier_level: item.matchedTierLevel,
      matched_tier_name: item.matchedTierName,
      progress_percentage: item.progressPercentage,
      gap_description: item.gapDescription,
      total_qty: item.totalQty,
      total_omzet: item.totalOmzet,
      total_reward_value: item.totalRewardValue,
      goods_description: item.goodsDescription || "",
      sku_breakdown: richPayload,
      updated_at: new Date().toISOString()
    });
  });

  // Attach System Users & Master Products Sync record so all data persists across devices & resets
  const systemUsers = (window.db ? window.db.getUsers() : []).map(u => ({
    id: u.id,
    username: u.username,
    passwordHash: u.passwordHash || u.password || "",
    fullname: u.fullname,
    role: u.role,
    storeId: u.storeId || null,
    storeIds: u.storeIds || [],
    isActive: u.isActive !== false
  }));

  const systemProducts = window.db ? (typeof window.db.getProducts === "function" ? window.db.getProducts() : []) : [];

  uniqueMap.set("_users_config_row", {
    id: "_users_config_row",
    snapshot_month: "ALL",
    calc_mode: "CUMULATIVE",
    store_code: "_USERS_CONFIG",
    store_name: "System Users Configuration",
    region: "ALL",
    salesman_name: "SYSTEM",
    campaign_code: "_SYSTEM_",
    campaign_name: "System Configuration",
    target_basis: "SYSTEM",
    matched_tier_level: 0,
    matched_tier_name: "SYSTEM",
    progress_percentage: 100,
    gap_description: "SYSTEM",
    total_qty: 0,
    total_omzet: 0,
    total_reward_value: 0,
    goods_description: "",
    sku_breakdown: {
      users: systemUsers,
      products: systemProducts,
      stores: (window.db.getStores() || []),
      campaigns: (window.db.getCampaigns() || []),
      productGroups: (window.db.getProductGroups() || []),
      deletedMasterIds: (window.db.getDatabase().deletedMasterIds || [])
    },
    updated_at: new Date().toISOString()
  });

  const snapshotsPayload = Array.from(uniqueMap.values());
  const BATCH_SIZE = 50;
  const totalRecords = snapshotsPayload.length;
  const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);

  showToast(`Menyiapkan publikasi ${totalRecords} record ke Supabase Cloud (${totalBatches} batch)...`, "info", "toast-supabase-batch-upload");
  await new Promise(r => setTimeout(r, 20));

  const cleanUrl = config.url.replace(/\/+$/, "");

    showToast("Membersihkan tabel Supabase dari data yang tidak terpakai...", "info", "toast-supabase-batch-upload");
    try {
      await fetch(`${cleanUrl}/rest/v1/${config.tableName || 'dashboard_snapshots'}?id=not.is.null`, {
        method: "DELETE",
        headers: {
          "apikey": config.anonKey,
          "Authorization": `Bearer ${config.anonKey}`
        }
      });
    } catch (e) {
      console.warn("Supabase wipe failed (maybe RLS?). Proceeding with upsert...", e);
    }

    for (let i = 0; i < totalBatches; i++) {
    const chunk = snapshotsPayload.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    showToast(`Mengunggah ke Supabase: Batch ${i + 1} dari ${totalBatches} (${chunk.length} record)...`, "info", "toast-supabase-batch-upload");

    const res = await fetch(`${cleanUrl}/rest/v1/${config.tableName}`, {
      method: "POST",
      headers: {
        "apikey": config.anonKey,
        "Authorization": `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(chunk)
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = res.statusText;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.message || errJson.hint || res.statusText;
      } catch (e) {
        if (errText) msg = errText;
      }
      throw new Error(`[Batch ${i + 1}/${totalBatches} Gagal] ${msg}`);
    }

    await new Promise(r => setTimeout(r, 10));
  }

  if (window.db && typeof window.db.saveSupabaseConfig === "function") {
    window.db.saveSupabaseConfig(config);
  } else {
    localStorage.setItem("CAMPAIGN_SUPABASE_CONFIG", JSON.stringify(config));
  }
  showToast(`Sukses mempublikasikan seluruh ${totalRecords} record snapshot data pencapaian ke Supabase!`, "success", "toast-supabase-batch-upload");
}




















































































// Toggle dash filters
function toggleDashFilters() {
  const container = document.getElementById("dash-filters-container");
  const btn = document.getElementById("btn-toggle-dash-filters");
  if (!container) return;
  if (container.style.display === "none") {
    container.style.display = "flex";
    if (btn) btn.innerHTML = `<i class="fa-solid fa-xmark"></i> Tutup Filter`;
  } else {
    container.style.display = "none";
    if (btn) btn.innerHTML = `<i class="fa-solid fa-filter"></i> Buka Filter`;
  }
}








// Populate achievements month filter based on snapshots
function populateAchMonthFilter() {
  const sel = document.getElementById("ach-month-filter");
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="ALL">Semua Bulan</option>';
  const snaps = window.db.getMonthlySnapshots() || {};
  const monthSet = new Set();
  Object.keys(snaps).forEach(k => {
    const parts = k.split("_");
    if (parts[0]) monthSet.add(parts[0]);
  });
  const sorted = Array.from(monthSet).sort().reverse();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
  sorted.forEach(m => {
    const p = m.split("-");
    const mName = p.length === 2 ? monthNames[parseInt(p[1],10)-1] : "";
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = p.length === 2 ? mName + " " + p[0] : m;
    sel.appendChild(opt);
  });
  if (currentVal && monthSet.has(currentVal)) {
    sel.value = currentVal;
  }
    
    // Populate Campaign Filter
    const selC = document.getElementById("ach-campaign-filter");
    if (selC) {
      const cVal = selC.value;
      selC.innerHTML = '<option value="ALL">Semua Campaign</option>';
      const cSet = new Map();
      const allAchs = window.db.getAchievements();
      allAchs.forEach(a => {
        if (a.campaignId && a.campaignName) {
          cSet.set(a.campaignId, a.campaignName);
        }
      });
      cSet.forEach((name, id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        selC.appendChild(opt);
      });
      if (cVal && cSet.has(cVal)) {
        selC.value = cVal;
      }
    }
  }






// --- PAYOUT MODAL LOGIC ---
let currentPayoutAchId = null;
let currentPayoutSelect = null;
let transferRows = [];
let claimedRows = [];

function changePayoutStatus(achId, newStatus, selectEl) {
  currentPayoutSelect = selectEl;
  if (newStatus === 'TRANSFERRED') {
    currentPayoutAchId = achId;
    transferRows = [ { amount: '', proofNo: '', date: new Date().toISOString().split('T')[0] } ];
    renderTransferRows();
    openModal('modal-payout-transfer');
  } else if (newStatus === 'CLAIMED') {
    currentPayoutAchId = achId;
    claimedRows = [ { itemName: '', qty: 1, proofNo: '', date: new Date().toISOString().split('T')[0] } ];
    renderClaimedRows();
    openModal('modal-payout-claimed');
  } else {
    window.db.updatePayoutStatus(achId, newStatus);
    showToast("Status payout berhasil diperbarui!", "success");
    renderAchievements();
  }
}

function cancelPayoutAction() {
  if (currentPayoutSelect) {
    const achs = window.db.getAchievements();
    const ach = achs.find(a => a.id === currentPayoutAchId);
    if (ach) currentPayoutSelect.value = ach.payoutStatus || 'PENDING';
  }
  closeModal('modal-payout-transfer');
  closeModal('modal-payout-claimed');
}

// Transfer Logic
function renderTransferRows() {
  const container = document.getElementById("transfer-rows-container");
  if(!container) return;
  container.innerHTML = transferRows.map((r, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
      <input type="number" class="form-control btn-sm" placeholder="Nominal Rp" value="${r.amount}" onchange="transferRows[${i}].amount=this.value" style="flex:1;">
      <input type="text" class="form-control btn-sm" placeholder="No Bukti Trf" value="${r.proofNo}" onchange="transferRows[${i}].proofNo=this.value" style="flex:1;">
      <input type="date" class="form-control btn-sm" value="${r.date}" onchange="transferRows[${i}].date=this.value" style="flex:1;">
      <button class="btn btn-danger btn-sm" onclick="removeTransferRow(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join("");
}
function addTransferRow() { transferRows.push({ amount: '', proofNo: '', date: new Date().toISOString().split('T')[0] }); renderTransferRows(); }
function removeTransferRow(i) { transferRows.splice(i, 1); renderTransferRows(); }
function savePayoutTransfer() {
  const ev = transferRows.filter(r => r.amount || r.proofNo);
  window.db.updatePayoutStatus(currentPayoutAchId, 'TRANSFERRED', { type: 'TRANSFERRED', rows: ev });
  showToast("Bukti Transfer disimpan & status diubah!", "success");
  closeModal('modal-payout-transfer');
  renderAchievements();
}

// Claim Logic
function renderClaimedRows() {
  const container = document.getElementById("claimed-rows-container");
  if(!container) return;
  container.innerHTML = claimedRows.map((r, i) => `
    <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
      <input type="text" class="form-control btn-sm" placeholder="Nama Barang" value="${r.itemName}" onchange="claimedRows[${i}].itemName=this.value" style="flex:2;">
      <input type="number" class="form-control btn-sm" placeholder="Qty" value="${r.qty}" onchange="claimedRows[${i}].qty=this.value" style="flex:1;">
      <input type="text" class="form-control btn-sm" placeholder="No Bukti" value="${r.proofNo}" onchange="claimedRows[${i}].proofNo=this.value" style="flex:1.5;">
      <input type="date" class="form-control btn-sm" value="${r.date}" onchange="claimedRows[${i}].date=this.value" style="flex:1.5;">
      <button class="btn btn-danger btn-sm" onclick="removeClaimedRow(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join("");
}
function addClaimedRow() { claimedRows.push({ itemName: '', qty: 1, proofNo: '', date: new Date().toISOString().split('T')[0] }); renderClaimedRows(); }
function removeClaimedRow(i) { claimedRows.splice(i, 1); renderClaimedRows(); }
function savePayoutClaimed() {
  const ev = claimedRows.filter(r => r.itemName || r.proofNo);
  window.db.updatePayoutStatus(currentPayoutAchId, 'CLAIMED', { type: 'CLAIMED', rows: ev });
  showToast("Bukti Claim disimpan & status diubah!", "success");
  closeModal('modal-payout-claimed');
  renderAchievements();
}










































function showCampaignSkus(campaignId) {
  const c = window.db.getCampaignById(campaignId);
  if (!c) return;

  const prods = window.db.getProducts();
  const groups = window.db.getProductGroups();

  let html = `<div style="margin-bottom: 15px; font-size: 0.9rem; color: #475569;">
    Berikut adalah daftar produk yang penjualannya <strong>dihitung</strong> untuk mencapai target pada program <strong>${c.campaignName}</strong>:
  </div>`;

  if (c.productFilterScope === "BY_SKU") {
    if (!c.eligibleProductIds || c.eligibleProductIds.length === 0) {
      html += `<div class="badge badge-info" style="font-size: 0.9rem; padding: 10px; display: block; white-space: normal;">
        <i class="fa-solid fa-check-double"></i> Berlaku untuk <strong>SELURUH SKU PRODUK</strong> yang ada.
      </div>`;
    } else {
      const selectedSkus = prods.filter(p => c.eligibleProductIds.includes(p.id)).sort((a, b) => String(a.productCode||"").localeCompare(String(b.productCode||"")));
      html += `
        <table class="table" style="font-size: 0.85rem;">
          <thead style="background: #f8fafc;">
            <tr>
              <th>Kode SKU</th>
              <th>Nama Produk</th>
              <th>Poin/Unit</th>
            </tr>
          </thead>
          <tbody>
            ${selectedSkus.map(p => `
              <tr>
                <td><strong>${p.productCode}</strong></td>
                <td>${p.productName}</td>
                <td>${p.unitPrice}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }
  } else {
    // BY_GROUP
    if (!c.eligibleGroupIds || c.eligibleGroupIds.length === 0) {
      html += `<div class="badge badge-info" style="font-size: 0.9rem; padding: 10px; display: block; white-space: normal;">
        <i class="fa-solid fa-check-double"></i> Berlaku untuk <strong>SELURUH SKU PRODUK</strong> (Semua Group).
      </div>`;
    } else {
      const selectedGroups = groups.filter(g => c.eligibleGroupIds.includes(g.id));
      const groupCodes = selectedGroups.map(g => g.groupCode);
      const eligibleSkus = prods.filter(p => { const pGrp = groups.find(g => g.id === p.groupId); return pGrp && groupCodes.includes(pGrp.groupCode); }).sort((a, b) => String(a.productCode||"").localeCompare(String(b.productCode||"")));
      
      html += `
        <div style="margin-bottom: 10px; font-size: 0.85rem; color: #0369a1; font-weight: 600;">
          <i class="fa-solid fa-layer-group"></i> Group Produk Terpilih: ${selectedGroups.map(g => g.groupCode).join(", ")}
        </div>
        <table class="table" style="font-size: 0.85rem;">
          <thead style="background: #f0f9ff;">
            <tr>
              <th>Kode SKU</th>
              <th>Nama Produk</th>
              <th>Group</th><th>Poin/Unit</th>
            </tr>
          </thead>
          <tbody>
            ${eligibleSkus.map(p => {
              const pGrp = groups.find(g => g.id === p.groupId);
              return `
              <tr>
                <td><strong>${p.productCode}</strong></td>
                <td>${p.productName}</td>
                <td>${pGrp ? pGrp.groupCode : '-'}</td><td>${p.unitPrice || 0}</td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      `;
    }
  }

  document.getElementById("breakdown-title").innerHTML = `<i class="fa-solid fa-box-open"></i> Daftar Produk Campaign`;
  document.getElementById("breakdown-body").innerHTML = html;
  
  closeModal('modal-quick-tier');
  openModal('modal-breakdown');
}





























