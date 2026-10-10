$txt = Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Raw

# 1. Update export function
$oldExp = '(?s)function exportAchievementsCSV\(\) \{.*?showToast\("File Laporan CSV berhasil diunduh!", "success"\);\s*\}'
$newExp = 'function exportAchievementsCSV() {
    const achievements = window.db.getAchievements();
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
  }'
$txt = [regex]::Replace($txt, $oldExp, $newExp)

# 2. Add campaign filter to renderAchievements
$oldRend = '(?s)(if \(mFil && mFil !== "ALL"\) achievements = achievements\.filter\(a => a\.snapshotMonth === mFil\);)\s*(// Role filter)'
$newRend = '$1
    const cFil = document.getElementById("ach-campaign-filter")?.value;
    if (cFil && cFil !== "ALL") achievements = achievements.filter(a => a.campaignId === cFil);

    $2'
$txt = [regex]::Replace($txt, $oldRend, $newRend)

# 3. Add populateAchCampaignFilter inside populateAchMonthFilter
$oldPop = '(?s)(if \(currentVal && monthSet\.has\(currentVal\)\) \{\s*sel\.value = currentVal;\s*\})\s*\}'
$newPop = '$1
    
    // Populate Campaign Filter
    const selC = document.getElementById("ach-campaign-filter");
    if (selC) {
      const cVal = selC.value;
      selC.innerHTML = ''<option value="ALL">Semua Campaign</option>'';
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
  }'
$txt = [regex]::Replace($txt, $oldPop, $newPop)

$txt | Out-File 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding utf8
