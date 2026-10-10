function getCampaignActiveMonths(startDateStr, endDateStr) {
  if (!startDateStr) return [];
  const start = normalizeDateForEngine(startDateStr).substring(0, 7);
  if (!start) return [];

  let end = "";
  if (endDateStr && String(endDateStr).trim() !== "") {
    end = normalizeDateForEngine(endDateStr).substring(0, 7);
  } else {
    let latestTrxMonth = "";
    if (window.db && typeof window.db.getSales === "function") {
      const sales = window.db.getSales() || [];
      sales.forEach(s => {
        if (s.transactionDate) {
          const m = normalizeDateForEngine(s.transactionDate).substring(0, 7);
          if (m && m > latestTrxMonth) latestTrxMonth = m;
        }
      });
    }
    const currentMonth = new Date().toISOString().substring(0, 7);
    end = (latestTrxMonth && latestTrxMonth > currentMonth) ? latestTrxMonth : currentMonth;
  }

  if (!end || start > end) {
    end = start;
  }

  const months = [];
  let cur = new Date(start + "-01");
  const endDateObj = new Date(end + "-01");

  while (cur <= endDateObj) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function isCampaignRunningInMonth(campaign, targetMonth) {
  if (!campaign || campaign.status !== "ACTIVE") return false;
  if (!targetMonth || targetMonth === "ALL") return true;

  if (campaign.startDate) {
    const startM = normalizeDateForEngine(campaign.startDate).substring(0, 7);
    if (startM && startM > targetMonth) {
      return false; // Campaign hasn't started yet in targetMonth
    }
  }

  if (campaign.endDate && String(campaign.endDate).trim() !== "") {
    const endM = normalizeDateForEngine(campaign.endDate).substring(0, 7);
    if (endM && endM < targetMonth) {
      return false; // Campaign already ended before targetMonth
    }
  }

  return true;
}

function formatEngineGoodsItem(name, rawQty, factor = 1) {
  const baseQ = parseFloat(rawQty || 1);
  const totalQ = baseQ * factor;
  const formattedQty = (isNaN(totalQ) || totalQ === 0) ? "1" : ((totalQ % 1 === 0) ? totalQ.toString() : parseFloat(totalQ.toFixed(4)).toString());
  const cleanName = String(name || "").trim();

  if (/\b(gram|gr|unit|pcs|set|pack|voucher|lembar|btg|batang|kg)\b/i.test(cleanName)) {
    return `${formattedQty} ${cleanName}`;
  }
  return `${formattedQty} Unit ${cleanName}`;
}

function getActualQtyForEngineCode(sData, code) {
  if (!sData || !code) return 0;
  const rawClean = String(code).trim().toLowerCase();
  const cleanAlnum = rawClean.replace(/[^a-z0-9]/g, "");

  if (!cleanAlnum) return 0;

  let totalFound = 0;

  // Search in skuQtyMap
  for (const [k, v] of Object.entries(sData.skuQtyMap || {})) {
    const kClean = String(k).trim().toLowerCase();
    const kAlnum = kClean.replace(/[^a-z0-9]/g, "");
    if (kClean === rawClean || kAlnum === cleanAlnum) {
      totalFound += v;
    }
  }

  if (totalFound > 0) return totalFound;

  // Search in groupQtyMap
  for (const [k, v] of Object.entries(sData.groupQtyMap || {})) {
    const kClean = String(k).trim().toLowerCase();
    const kAlnum = kClean.replace(/[^a-z0-9]/g, "");
    if (kClean === rawClean || kAlnum === cleanAlnum) {
      totalFound += v;
    }
  }

  return totalFound;
}

function getEffectiveTargetBasis(campaign, tier = null) {
  if (campaign && campaign.targetBasis === "POIN") return "POIN";
  if (campaign && campaign.targetBasis === "OMZET") return "OMZET";
  if (campaign && campaign.targetBasis === "BOTH") return "BOTH";
  if (tier) {
    if (tier.minOmzet > 0 && (!tier.minQty || tier.minQty === 0)) return (campaign && campaign.targetBasis === "POIN") ? "POIN" : "OMZET";
    if (tier.minQty > 0 && (!tier.minOmzet || tier.minOmzet === 0)) return "QTY";
  }
  if (campaign && campaign.targetBasis === "QTY") return "QTY";
  return "QTY";
}

function isProductEligibleForCampaign(prod, campaign) {
  if (!prod || !campaign) return false;
  if (campaign.productFilterScope === "BY_SKU") {
    if (campaign.eligibleProductIds && Array.isArray(campaign.eligibleProductIds) && campaign.eligibleProductIds.length > 0) {
      const ids = new Set(campaign.eligibleProductIds.map(id => String(id).toLowerCase().trim()));
      const pId = String(prod.id || "").toLowerCase().trim();
      const pCode = String(prod.productCode || "").toLowerCase().trim();
      return ids.has(pId) || ids.has(pCode);
    }
    return true;
  } else {
    if (campaign.eligibleGroupIds && Array.isArray(campaign.eligibleGroupIds) && campaign.eligibleGroupIds.length > 0) {
      const productGroups = (window.db && typeof window.db.getProductGroups === "function") ? (window.db.getProductGroups() || []) : [];
      
      const prodGrp = productGroups.find(g => 
        String(g.id).toLowerCase().trim() === String(prod.groupId || "").toLowerCase().trim() || 
        String(g.groupCode).toLowerCase().trim() === String(prod.groupId || "").toLowerCase().trim() ||
        String(g.groupName).toLowerCase().trim() === String(prod.groupId || "").toLowerCase().trim()
      );
      
      const eligibleSet = new Set();
      campaign.eligibleGroupIds.forEach(egId => {
        const egStr = String(egId).toLowerCase().trim();
        eligibleSet.add(egStr);
        const matchedGrp = productGroups.find(g => String(g.id).toLowerCase().trim() === egStr || String(g.groupCode).toLowerCase().trim() === egStr);
        if (matchedGrp) {
          eligibleSet.add(String(matchedGrp.id).toLowerCase().trim());
          if (matchedGrp.groupCode) eligibleSet.add(String(matchedGrp.groupCode).toLowerCase().trim());
        }
      });

      const pGrpId = String(prod.groupId || "").toLowerCase().trim();
      if (eligibleSet.has(pGrpId)) return true;
      if (prodGrp) {
        if (eligibleSet.has(String(prodGrp.id).toLowerCase().trim())) return true;
        if (prodGrp.groupCode && eligibleSet.has(String(prodGrp.groupCode).toLowerCase().trim())) return true;
      }
      return false;
    }
    return true;
  }
}

function getGroupMetricFromMap(map, grp) {
  if (!map || typeof map !== "object") return 0;
  if (grp.id && map[grp.id] !== undefined) return parseFloat(map[grp.id] || 0);
  if (grp.groupCode && map[grp.groupCode] !== undefined) return parseFloat(map[grp.groupCode] || 0);

  const targetId = String(grp.id || "").toLowerCase().trim();
  const targetIdClean = targetId.replace(/^grp_/, "");
  const targetCode = String(grp.groupCode || "").toLowerCase().trim();
  const targetCodeClean = targetCode.replace(/[^a-z0-9]/g, "");

  for (const [k, v] of Object.entries(map)) {
    const kStr = String(k).toLowerCase().trim();
    const kClean = kStr.replace(/^grp_/, "").replace(/[^a-z0-9]/g, "");

    if (kStr === targetId || kStr === targetCode) return parseFloat(v || 0);
    if (kClean && (kClean === targetIdClean || kClean === targetCodeClean)) return parseFloat(v || 0);
  }
  return 0;
}

function getSkuMetricFromMap(map, prod) {
  if (!map || typeof map !== "object") return 0;
  if (prod.productCode && map[prod.productCode] !== undefined) return parseFloat(map[prod.productCode] || 0);
  if (prod.id && map[prod.id] !== undefined) return parseFloat(map[prod.id] || 0);

  const pCode = String(prod.productCode || "").toLowerCase().trim();
  const pCodeClean = pCode.replace(/[^a-z0-9]/g, "");
  const pId = String(prod.id || "").toLowerCase().trim();

  for (const [k, v] of Object.entries(map)) {
    const kStr = String(k).toLowerCase().trim();
    const kClean = kStr.replace(/[^a-z0-9]/g, "");

    if (kStr === pCode || kStr === pId) return parseFloat(v || 0);
    if (kClean && pCodeClean && kClean === pCodeClean) return parseFloat(v || 0);
  }
  return 0;
}

/**
 * engine.js - Sales Incentive & Tier Calculation Engine
 */

function normalizeDateForEngine(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (!s) return "";

  // Standardize dots and slashes to hyphens
  let clean = s.replace(/\./g, "-").replace(/\//g, "-").trim();

  // 1. ISO format: YYYY-MM-DD
  const yyyymmdd = clean.match(/^(\d{4})[\-](\d{1,2})[\-](\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = yyyymmdd[1];
    const mm = yyyymmdd[2].padStart(2, "0");
    const dd = yyyymmdd[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. DD-MM-YYYY (4-digit year)
  const ddmmyyyy = clean.match(/^(\d{1,2})[\-](\d{1,2})[\-](\d{4})/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1].padStart(2, "0");
    const mm = ddmmyyyy[2].padStart(2, "0");
    const yyyy = ddmmyyyy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // 3. DD-MM-YY (2-digit year)
  const ddmmyy = clean.match(/^(\d{1,2})[\-](\d{1,2})[\-](\d{2})$/);
  if (ddmmyy) {
    const dd = ddmmyy[1].padStart(2, "0");
    const mm = ddmmyy[2].padStart(2, "0");
    const yyyy = parseInt(ddmmyy[3], 10) < 50 ? `20${ddmmyy[3]}` : `19${ddmmyy[3]}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  // 4. DD-MMM-YYYY or DD-MMM-YY (e.g. 15-Sep-2026 or 15 Sep 2026 or 15-Sept-2026)
  const monthNamesMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", may: "05", jun: "06",
    jul: "07", ags: "08", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", des: "12", dec: "12"
  };
  const ddMonthName = clean.match(/^(\d{1,2})[\s\-]+([a-zA-Z]{3,4})[\s\-]+(\d{2,4})/);
  if (ddMonthName) {
    const dd = ddMonthName[1].padStart(2, "0");
    const monthKey = ddMonthName[2].substring(0, 3).toLowerCase();
    const mm = monthNamesMap[monthKey] || "01";
    let yyyy = ddMonthName[3];
    if (yyyy.length === 2) {
      yyyy = parseInt(yyyy, 10) < 50 ? `20${yyyy}` : `19${yyyy}`;
    }
    return `${yyyy}-${mm}-${dd}`;
  }

  // 5. Excel Serial Date Number (e.g. 46280)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    if (!isNaN(date_info.getTime())) {
      const yyyy = date_info.getFullYear();
      const mm = String(date_info.getMonth() + 1).padStart(2, "0");
      const dd = String(date_info.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // 6. Try standard JS Date parsing fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (yyyy >= 2000 && yyyy <= 2100) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return s.substring(0, 10);
}

function buildStoreEngineIndex(stores) {
  if (!stores || !Array.isArray(stores)) return null;

  const rawCodeMap = new Map();
  const cleanCodeMap = new Map();
  const rawNameMap = new Map();
  const cleanNameMap = new Map();
  const idMap = new Map();

  const sortedByCode = [...stores]
    .filter(s => s && s.storeCode)
    .map(s => ({
      store: s,
      codeClean: String(s.storeCode).toLowerCase().replace(/[^a-z0-9]/g, "")
    }))
    .filter(item => item.codeClean.length >= 2)
    .sort((a, b) => b.codeClean.length - a.codeClean.length);

  const sortedByName = [...stores]
    .filter(s => s && s.storeName)
    .map(s => ({
      store: s,
      nameClean: String(s.storeName).toLowerCase().replace(/[^a-z0-9]/g, "")
    }))
    .filter(item => item.nameClean.length >= 5)
    .sort((a, b) => b.nameClean.length - a.nameClean.length);

  stores.forEach(s => {
    if (!s) return;
    if (s.id) {
      idMap.set(s.id, s);
      idMap.set(String(s.id), s);
    }

    if (s.storeCode) {
      const rawC = String(s.storeCode).trim().toLowerCase();
      const cleanC = rawC.replace(/[^a-z0-9]/g, "");
      if (rawC && !rawCodeMap.has(rawC)) rawCodeMap.set(rawC, s);
      if (cleanC && !cleanCodeMap.has(cleanC)) cleanCodeMap.set(cleanC, s);
    }

    if (s.storeName) {
      const rawN = String(s.storeName).trim().toLowerCase();
      const cleanN = rawN.replace(/[^a-z0-9]/g, "");
      if (rawN && !rawNameMap.has(rawN)) rawNameMap.set(rawN, s);
      if (cleanN && !cleanNameMap.has(cleanN)) cleanNameMap.set(cleanN, s);
    }
  });

  return {
    rawCodeMap,
    cleanCodeMap,
    rawNameMap,
    cleanNameMap,
    idMap,
    sortedByCode,
    sortedByName,
    memo: new Map()
  };
}

function findStoreForEngine(trx, stores, index = null) {
  if (!trx || !stores || !Array.isArray(stores)) return null;

  const searchVal = trx.storeCode || trx.storeName || "";
  if (!searchVal && !trx.storeId) return null;

  if (index && index.memo) {
    const cacheKey = (trx.id || "") + "_" + (searchVal || "") + "_" + (trx.storeId || "");
    if (index.memo.has(cacheKey)) return index.memo.get(cacheKey);
  }

  const raw = String(searchVal || "").trim().toLowerCase();
  const cleanVal = raw.replace(/[^a-z0-9]/g, "");

  let match = null;

  if (index) {
    if (raw && index.rawCodeMap.has(raw)) match = index.rawCodeMap.get(raw);
    else if (cleanVal && index.cleanCodeMap.has(cleanVal)) match = index.cleanCodeMap.get(cleanVal);
    else if (cleanVal) {
      const prefixCodeItem = index.sortedByCode.find(item => cleanVal.startsWith(item.codeClean));
      if (prefixCodeItem) match = prefixCodeItem.store;
    }

    if (!match && raw && index.rawNameMap.has(raw)) match = index.rawNameMap.get(raw);
    else if (!match && cleanVal && index.cleanNameMap.has(cleanVal)) match = index.cleanNameMap.get(cleanVal);
    else if (!match && cleanVal) {
      const prefixNameItem = index.sortedByName.find(item => cleanVal.startsWith(item.nameClean));
      if (prefixNameItem) match = prefixNameItem.store;
    }

    if (!match && trx.storeId && index.idMap.has(trx.storeId)) {
      match = index.idMap.get(trx.storeId);
    }
  } else {
    if (raw) match = stores.find(s => s && s.storeCode && String(s.storeCode).trim().toLowerCase() === raw);
    if (!match && cleanVal) match = stores.find(s => s && s.storeCode && String(s.storeCode).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
    if (!match && raw) match = stores.find(s => s && s.storeName && String(s.storeName).trim().toLowerCase() === raw);
    if (!match && cleanVal) match = stores.find(s => s && s.storeName && String(s.storeName).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
    if (!match && trx.storeId) match = stores.find(s => s && s.id === trx.storeId);
  }

  if (index && index.memo && (trx.id || searchVal)) {
    const cacheKey = (trx.id || "") + "_" + (searchVal || "") + "_" + (trx.storeId || "");
    index.memo.set(cacheKey, match);
  }

  return match;
}

function buildProductEngineIndex(products) {
  if (!products || !Array.isArray(products)) return null;

  const rawCodeMap = new Map();
  const cleanCodeMap = new Map();
  const rawNameMap = new Map();
  const cleanNameMap = new Map();
  const idMap = new Map();

  const sortedByCode = [...products]
    .filter(p => p && p.productCode)
    .map(p => ({
      product: p,
      codeClean: String(p.productCode).toLowerCase().replace(/[^a-z0-9]/g, "")
    }))
    .filter(item => item.codeClean.length >= 2)
    .sort((a, b) => b.codeClean.length - a.codeClean.length);

  const sortedByName = [...products]
    .filter(p => p && p.productName)
    .map(p => ({
      product: p,
      nameClean: String(p.productName).toLowerCase().replace(/[^a-z0-9]/g, "")
    }))
    .filter(item => item.nameClean.length >= 5)
    .sort((a, b) => b.nameClean.length - a.nameClean.length);

  products.forEach(p => {
    if (!p) return;
    if (p.id) {
      idMap.set(p.id, p);
      idMap.set(String(p.id), p);
    }

    if (p.productCode) {
      const rawC = String(p.productCode).trim().toLowerCase();
      const cleanC = rawC.replace(/[^a-z0-9]/g, "");
      if (rawC && !rawCodeMap.has(rawC)) rawCodeMap.set(rawC, p);
      if (cleanC && !cleanCodeMap.has(cleanC)) cleanCodeMap.set(cleanC, p);
    }

    if (p.productName) {
      const rawN = String(p.productName).trim().toLowerCase();
      const cleanN = rawN.replace(/[^a-z0-9]/g, "");
      if (rawN && !rawNameMap.has(rawN)) rawNameMap.set(rawN, p);
      if (cleanN && !cleanNameMap.has(cleanN)) cleanNameMap.set(cleanN, p);
    }
  });

  return {
    rawCodeMap,
    cleanCodeMap,
    rawNameMap,
    cleanNameMap,
    idMap,
    sortedByCode,
    sortedByName,
    memo: new Map()
  };
}

function findProductForEngine(trx, products, productMapOrIndex = null) {
  if (!trx || !products || !Array.isArray(products)) return null;

  const rawCode = String(trx.productCode || trx.type || "").trim();
  const rawLower = rawCode.toLowerCase();
  const cleanVal = rawLower.replace(/[^a-z0-9]/g, "");

  const isIndex = productMapOrIndex && productMapOrIndex.rawCodeMap;

  if (isIndex && productMapOrIndex.memo) {
    const cacheKey = (trx.id || "") + "_" + rawLower + "_" + (trx.productId || "");
    if (productMapOrIndex.memo.has(cacheKey)) return productMapOrIndex.memo.get(cacheKey);
  }

  let match = null;

  if (isIndex) {
    if (rawLower && productMapOrIndex.rawCodeMap.has(rawLower)) match = productMapOrIndex.rawCodeMap.get(rawLower);
    else if (cleanVal && productMapOrIndex.cleanCodeMap.has(cleanVal)) match = productMapOrIndex.cleanCodeMap.get(cleanVal);
    else if (cleanVal) {
      const prefixCodeItem = productMapOrIndex.sortedByCode.find(item => cleanVal.startsWith(item.codeClean));
      if (prefixCodeItem) match = prefixCodeItem.product;
    }

    if (!match && rawLower && productMapOrIndex.rawNameMap.has(rawLower)) match = productMapOrIndex.rawNameMap.get(rawLower);
    else if (!match && cleanVal && productMapOrIndex.cleanNameMap.has(cleanVal)) match = productMapOrIndex.cleanNameMap.get(cleanVal);
    else if (!match && cleanVal) {
      const prefixNameItem = productMapOrIndex.sortedByName.find(item => cleanVal.startsWith(item.nameClean));
      if (prefixNameItem) match = prefixNameItem.product;
    }

    if (!match && trx.productId && productMapOrIndex.idMap.has(trx.productId)) {
      match = productMapOrIndex.idMap.get(trx.productId);
    }

    if (productMapOrIndex.memo) {
      const cacheKey = (trx.id || "") + "_" + rawLower + "_" + (trx.productId || "");
      productMapOrIndex.memo.set(cacheKey, match);
    }

    return match;
  }

  const productMap = (productMapOrIndex instanceof Map) ? productMapOrIndex : null;
  if (rawLower) match = products.find(p => p && p.productCode && String(p.productCode).trim().toLowerCase() === rawLower);
  if (!match && cleanVal) match = products.find(p => p && p.productCode && String(p.productCode).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (!match && rawLower) match = products.find(p => p && p.productName && String(p.productName).trim().toLowerCase() === rawLower);
  if (!match && cleanVal) match = products.find(p => p && p.productName && String(p.productName).toLowerCase().replace(/[^a-z0-9]/g, "") === cleanVal);
  if (!match && trx.productId && productMap) match = productMap.get(trx.productId);

  return match;
}

class CalculationEngine {
  calculateTierRewardsWithMultiplier(sortedTiersDesc, totalQty, totalOmzet, totalPoin, campaign, sData) {
    const productGroups = (window.db && typeof window.db.getProductGroups === "function") ? window.db.getProductGroups() : [];

    let remQty = totalQty;
    let remOmzet = totalOmzet;
    let remPoin = totalPoin;

    let itemRateRewardsTotal = 0;
    let fixedCashAmount = 0;
    let fixedVoucherAmount = 0;
    let rewardItemBreakdown = [];
    let topMatchedTier = null;
    const goodsItemMap = new Map();

    for (const tier of sortedTiersDesc) {
      const targetPoinVal = tier.minOmzet > 0 ? tier.minOmzet : tier.minQty;
      const isOmzetBasis = campaign.targetBasis === "OMZET" || (tier.minOmzet > 0 && (!tier.minQty || tier.minQty === 0));

      let qtyMet = tier.minQty > 0 ? remQty >= tier.minQty : true;
      let omzetMet = tier.minOmzet > 0 ? (campaign.targetBasis === "POIN" ? remPoin >= tier.minOmzet : remOmzet >= tier.minOmzet) : true;

      let isMet = false;
      if (campaign.targetBasis === "QTY") isMet = tier.minQty > 0 && remQty >= tier.minQty;
      else if (campaign.targetBasis === "OMZET") isMet = tier.minOmzet > 0 && remOmzet >= tier.minOmzet;
      else if (campaign.targetBasis === "POIN") { const targetVal = tier.minOmzet > 0 ? tier.minOmzet : tier.minQty; isMet = targetVal > 0 && remPoin >= targetVal; }
      else if (campaign.targetBasis === "BOTH") isMet = qtyMet && omzetMet && (tier.minQty > 0 || tier.minOmzet > 0);

      if (isMet) {
        if (!topMatchedTier) topMatchedTier = tier;

        let factor = 1;
          if (campaign.isMultiplier && targetPoinVal > 0) {
            if (campaign.targetBasis === "POIN") {
              factor = Math.floor(remPoin / targetPoinVal);
            } else if (isOmzetBasis) {
              factor = Math.floor(remOmzet / targetPoinVal);
            } else {
              factor = Math.floor(remQty / targetPoinVal);
            }
            factor = Math.max(1, factor);
          }

        // 1. Rates calculation
        if (tier.rates && tier.rates.length > 0) {
          tier.rates.forEach(r => {
            const isAll = r.groupId === "ALL_GROUPS";
              const grpQty = isAll ? totalQty : (sData && sData.groupQtyMap ? (sData.groupQtyMap[r.groupId] || 0) : 0);
            const grpOmzet = isAll ? totalOmzet : (sData && sData.groupOmzetMap ? (sData.groupOmzetMap[r.groupId] || 0) : 0);
            let earned = 0;
            if (r.calculationType === "PER_UNIT_AMOUNT") {
              earned = Math.floor(grpQty * r.rateValue);
            } else if (r.calculationType === "PERCENTAGE_OF_OMZET") {
              earned = Math.floor(grpOmzet * (r.rateValue / 100));
            }
            if (earned > 0) {
              itemRateRewardsTotal += earned;
              rewardItemBreakdown.push({
                groupId: r.groupId,
                groupCode: isAll ? "Semua Group Produk" : (productGroups.find(g => g.id === r.groupId)?.groupCode || r.groupId),
                qtyAchieved: grpQty,
                rateValue: r.rateValue,
                calcType: r.calculationType,
                rewardEarned: earned
              });
            }
          });
        }

        // 2. Cash & Voucher
        fixedCashAmount += (tier.fixedCashAmount || 0) * factor;
        fixedVoucherAmount += (tier.fixedVoucherAmount || 0) * factor;

        // 3. Goods Items collection for smart consolidation
        if (tier.goodsItems && Array.isArray(tier.goodsItems) && tier.goodsItems.length > 0) {
          tier.goodsItems.filter(g => g && g.name && g.name.trim() !== "").forEach(g => {
            const nameKey = String(g.name).trim();
            const addQ = parseFloat(g.qty || 1) * factor;
            goodsItemMap.set(nameKey, (goodsItemMap.get(nameKey) || 0) + addQ);
          });
        } else if (tier.goodsName || tier.goodsDescription) {
          const nameKey = String(tier.goodsName || tier.goodsDescription).trim();
          const addQ = parseFloat(tier.goodsQty || 1) * factor;
          goodsItemMap.set(nameKey, (goodsItemMap.get(nameKey) || 0) + addQ);
        }

        // Deduct volume if multiplier is active
        // Deduct volume (if multiplier is true, it cascades down)
          if (campaign.isMultiplier) {
            if (campaign.targetBasis === "POIN" && (tier.minOmzet > 0 || tier.minQty > 0)) {
              remPoin -= factor * (tier.minOmzet > 0 ? tier.minOmzet : tier.minQty);
            } else if (isOmzetBasis && tier.minOmzet > 0) {
              remOmzet -= factor * tier.minOmzet;
            } else if (tier.minQty > 0) {
              remQty -= factor * tier.minQty;
            }
          } else {
            break; // Stop after highest matched tier if not multiplier
          }
      }
    }

    const goodsParts = [];
    goodsItemMap.forEach((qtyVal, nameKey) => {
      goodsParts.push(formatEngineGoodsItem(nameKey, qtyVal, 1));
    });

    return {
      matchedTier: topMatchedTier,
      itemRateRewardsTotal: itemRateRewardsTotal,
      fixedCashAmount: fixedCashAmount,
      fixedVoucherAmount: fixedVoucherAmount,
      goodsDescription: goodsParts.join(" + "),
      rewardItemBreakdown: rewardItemBreakdown
    };
  }

  calculateCampaignAchievements(campaignId, targetMonth = "", calcMode = "CUMULATIVE", autoSave = true) {
    const campaign = window.db.getCampaignById(campaignId);
    if (!campaign) {
      console.error("Campaign not found:", campaignId);
      return [];
    }

    const stores = window.db.getStores();
    const products = window.db.getProducts();
    const productGroups = window.db.getProductGroups();
    const sales = window.db.getSales();

    // Map helpers
    const productMap = new Map(products.map(p => [p.id, p]));
    const storeMap = new Map(stores.map(s => [s.id, s]));

    // Filter Eligible Stores (must NOT be blacklisted at Store Master level)
    let targetStores = stores.filter(s => s.isCampaignEligible !== false);
    if (campaign.targetScope === "SELECTED_STORES" && campaign.eligibleStoreIds?.length > 0) {
      targetStores = targetStores.filter(s => campaign.eligibleStoreIds.includes(s.id));
    } else if (campaign.targetScope === "EXCLUDED_STORES" && campaign.eligibleStoreIds?.length > 0) {
      targetStores = targetStores.filter(s => !campaign.eligibleStoreIds.includes(s.id));
    } else if (campaign.targetScope === "BY_MARKET" && campaign.eligibleMarket) {
        const targetMarkets = String(campaign.eligibleMarket).split(",").map(m => m.trim().toLowerCase()).filter(m => m !== "");
        targetStores = targetStores.filter(s => s.marketCategory && targetMarkets.includes(String(s.marketCategory).trim().toLowerCase()));
      }

    // Filter Eligible Sales Transactions within campaign date range & eligible product groups
    const normStartDate = campaign.startDate ? normalizeDateForEngine(campaign.startDate) : "";
    const normEndDate = campaign.endDate ? normalizeDateForEngine(campaign.endDate) : "";

    const storeIndex = buildStoreEngineIndex(targetStores);
    const productIndex = buildProductEngineIndex(products);
      const eligibleProducts = products.filter(p => isProductEligibleForCampaign(p, campaign));
      const scopedProductIndex = buildProductEngineIndex(eligibleProducts);

    const campaignSales = sales.filter(trx => {
      // Date filter
      if (trx.transactionDate) {
        const normTrxDate = normalizeDateForEngine(trx.transactionDate);

        // ALWAYS verify start date bound first if defined
        if (normStartDate && normTrxDate < normStartDate) return false;

        // TARGET MONTH & CALC MODE FILTER
        if (targetMonth && targetMonth !== "ALL") {
          if (calcMode === "MONTHLY_ONLY") {
            if (!normTrxDate.startsWith(targetMonth)) return false;
          } else {
            if (normTrxDate.substring(0, 7) > targetMonth) return false;
          }
        } else if (normEndDate) {
          if (normTrxDate > normEndDate) return false;
        }
      }

      // Product Group / SKU filter
      const prod = findProductForEngine(trx, eligibleProducts, scopedProductIndex);
      if (!prod) return false;

      // Ensure store is valid for target stores
      const storeMatch = findStoreForEngine(trx, targetStores, storeIndex);
      if (!storeMatch) return false;

      return true;
    });

    // Group Sales by Store ID
    const storeSalesMap = new Map();
    targetStores.forEach(s => {
      storeSalesMap.set(s.id, {
        store: s,
        totalQty: 0,
        totalOmzet: 0,
        groupQtyMap: {},  // { groupId: qty }
        groupOmzetMap: {},// { groupId: omzet }
        skuQtyMap: {},    // { skuCode: qty }
        skuOmzetMap: {},  // { skuCode: omzet }
        transactions: [],
        monthlyMap: {}    // { "YYYY-MM": { qty, omzet, groupQtyMap, groupOmzetMap, transactions } }
      });
    });

    campaignSales.forEach(trx => {
      const storeMatch = findStoreForEngine(trx, targetStores, storeIndex);
      if (!storeMatch || !storeSalesMap.has(storeMatch.id)) return;

      const storeData = storeSalesMap.get(storeMatch.id);
      const prod = findProductForEngine(trx, eligibleProducts, scopedProductIndex);
      if (!prod) return;

      const prodGrp = productGroups.find(g => 
        String(g.id).toLowerCase().trim() === String(prod.groupId || "").toLowerCase().trim() || 
        String(g.groupCode).toLowerCase().trim() === String(prod.groupId || "").toLowerCase().trim()
      );
      const canonicalGroupId = prodGrp ? prodGrp.id : prod.groupId;

      const monthStr = normalizeDateForEngine(trx.transactionDate).substring(0, 7) || "TOTAL";

      const trxQty = parseFloat(trx.qty || 0);
        const itemPoinSatuan = (prod && prod.unitPrice > 0) ? prod.unitPrice : 1;
        const trxPoin = trxQty * itemPoinSatuan;
        const trxRealOmzet = parseFloat(trx.totalOmzet || 0);

        storeData.totalQty += trxQty;
        storeData.totalPoin = (storeData.totalPoin || 0) + trxPoin;
        storeData.totalOmzet += trxRealOmzet;

      // Group breakdown
      storeData.groupQtyMap[canonicalGroupId] = (storeData.groupQtyMap[canonicalGroupId] || 0) + trxQty;
      storeData.groupOmzetMap[canonicalGroupId] = (storeData.groupOmzetMap[canonicalGroupId] || 0) + trxRealOmzet;
      if (prodGrp && prodGrp.groupCode) {
        storeData.groupQtyMap[prodGrp.groupCode] = (storeData.groupQtyMap[prodGrp.groupCode] || 0) + trxQty;
        storeData.groupOmzetMap[prodGrp.groupCode] = (storeData.groupOmzetMap[prodGrp.groupCode] || 0) + trxRealOmzet;
      }

      // REAL SKU CODE from sales data
      const rawSkuCode = String(trx.productCode || (prod ? prod.productCode : "SKU_UNKNOWN")).trim();
      const pCode = rawSkuCode;
      storeData.skuQtyMap[pCode] = (storeData.skuQtyMap[pCode] || 0) + trxQty;
      if (prod.productCode) storeData.skuQtyMap[prod.productCode] = (storeData.skuQtyMap[prod.productCode] || 0) + trxQty;
      if (prod.id) storeData.skuQtyMap[prod.id] = (storeData.skuQtyMap[prod.id] || 0) + trxQty;

      storeData.skuOmzetMap[pCode] = (storeData.skuOmzetMap[pCode] || 0) + trxRealOmzet;
      if (prod.productCode) storeData.skuOmzetMap[prod.productCode] = (storeData.skuOmzetMap[prod.productCode] || 0) + trxRealOmzet;
      if (prod.id) storeData.skuOmzetMap[prod.id] = (storeData.skuOmzetMap[prod.id] || 0) + trxRealOmzet;

      const enrichedTrx = {
        invoiceNo: trx.invoiceNo || "-",
        transactionDate: trx.transactionDate || "-",
        realProductCode: rawSkuCode,
        productCode: rawSkuCode, // REAL SKU CODE FROM DATA SALES!
        masterProductCode: prod ? prod.productCode : rawSkuCode,
        masterProductName: prod ? prod.productName : rawSkuCode,
        unitPrice: itemPoinSatuan,
        qty: trxQty,
        totalOmzet: trxPoin,
        groupId: canonicalGroupId
      };
      storeData.transactions.push(enrichedTrx);

      // Monthly breakdown
      if (!storeData.monthlyMap[monthStr]) {
        storeData.monthlyMap[monthStr] = { qty: 0, poin: 0, omzet: 0, groupQtyMap: {}, groupPoinMap: {}, groupOmzetMap: {}, skuQtyMap: {}, skuPoinMap: {}, skuOmzetMap: {}, transactions: [] };
      }
      storeData.monthlyMap[monthStr].qty += trxQty;
      storeData.monthlyMap[monthStr].poin += trxPoin;
      storeData.monthlyMap[monthStr].omzet += trxRealOmzet;
      if (!storeData.monthlyMap[monthStr].groupQtyMap) storeData.monthlyMap[monthStr].groupQtyMap = {};
      if (!storeData.monthlyMap[monthStr].groupPoinMap) storeData.monthlyMap[monthStr].groupPoinMap = {};
      if (!storeData.monthlyMap[monthStr].groupOmzetMap) storeData.monthlyMap[monthStr].groupOmzetMap = {};
      if (!storeData.monthlyMap[monthStr].skuQtyMap) storeData.monthlyMap[monthStr].skuQtyMap = {};
      if (!storeData.monthlyMap[monthStr].skuPoinMap) storeData.monthlyMap[monthStr].skuPoinMap = {};
      if (!storeData.monthlyMap[monthStr].skuOmzetMap) storeData.monthlyMap[monthStr].skuOmzetMap = {};
      if (!storeData.monthlyMap[monthStr].transactions) storeData.monthlyMap[monthStr].transactions = [];

      storeData.monthlyMap[monthStr].groupQtyMap[canonicalGroupId] = (storeData.monthlyMap[monthStr].groupQtyMap[canonicalGroupId] || 0) + trxQty;
      storeData.monthlyMap[monthStr].groupPoinMap[canonicalGroupId] = (storeData.monthlyMap[monthStr].groupPoinMap[canonicalGroupId] || 0) + trxPoin;
      storeData.monthlyMap[monthStr].groupOmzetMap[canonicalGroupId] = (storeData.monthlyMap[monthStr].groupOmzetMap[canonicalGroupId] || 0) + trxRealOmzet;
      if (prodGrp && prodGrp.groupCode) {
        storeData.monthlyMap[monthStr].groupQtyMap[prodGrp.groupCode] = (storeData.monthlyMap[monthStr].groupQtyMap[prodGrp.groupCode] || 0) + trxQty;
        storeData.monthlyMap[monthStr].groupPoinMap[prodGrp.groupCode] = (storeData.monthlyMap[monthStr].groupPoinMap[prodGrp.groupCode] || 0) + trxPoin;
        storeData.monthlyMap[monthStr].groupOmzetMap[prodGrp.groupCode] = (storeData.monthlyMap[monthStr].groupOmzetMap[prodGrp.groupCode] || 0) + trxRealOmzet;
      }

      storeData.monthlyMap[monthStr].skuQtyMap[rawSkuCode] = (storeData.monthlyMap[monthStr].skuQtyMap[rawSkuCode] || 0) + trxQty;
      if (prod.productCode) storeData.monthlyMap[monthStr].skuQtyMap[prod.productCode] = (storeData.monthlyMap[monthStr].skuQtyMap[prod.productCode] || 0) + trxQty;
      if (prod.id) storeData.monthlyMap[monthStr].skuQtyMap[prod.id] = (storeData.monthlyMap[monthStr].skuQtyMap[prod.id] || 0) + trxQty;

      storeData.monthlyMap[monthStr].skuPoinMap[rawSkuCode] = (storeData.monthlyMap[monthStr].skuPoinMap[rawSkuCode] || 0) + trxPoin;
      if (prod.productCode) storeData.monthlyMap[monthStr].skuPoinMap[prod.productCode] = (storeData.monthlyMap[monthStr].skuPoinMap[prod.productCode] || 0) + trxPoin;
      if (prod.id) storeData.monthlyMap[monthStr].skuPoinMap[prod.id] = (storeData.monthlyMap[monthStr].skuPoinMap[prod.id] || 0) + trxPoin;

      storeData.monthlyMap[monthStr].skuOmzetMap[rawSkuCode] = (storeData.monthlyMap[monthStr].skuOmzetMap[rawSkuCode] || 0) + trxRealOmzet;
      if (prod.productCode) storeData.monthlyMap[monthStr].skuOmzetMap[prod.productCode] = (storeData.monthlyMap[monthStr].skuOmzetMap[prod.productCode] || 0) + trxRealOmzet;
      if (prod.id) storeData.monthlyMap[monthStr].skuOmzetMap[prod.id] = (storeData.monthlyMap[monthStr].skuOmzetMap[prod.id] || 0) + trxRealOmzet;

      storeData.monthlyMap[monthStr].transactions.push(enrichedTrx);
    });

    // Sort Campaign Tiers automatically by target value (lowest to highest target)
    const ascTiers = [...(campaign.tiers || [])].sort((a, b) => {
      const valA = (campaign.targetBasis === "OMZET" || (a.minOmzet > 0 && (!a.minQty || a.minQty === 0))) ? (a.minOmzet || 0) : (a.minQty || 0);
        const valB = (campaign.targetBasis === "OMZET" || (b.minOmzet > 0 && (!b.minQty || b.minQty === 0))) ? (b.minOmzet || 0) : (b.minQty || 0);
      if (valA !== valB) return valA - valB;
      return a.level - b.level;
    });
    const sortedTiers = [...ascTiers].reverse();

    // Evaluate Achievement per Store
    const achievementResults = [];

    storeSalesMap.forEach((sData, storeId) => {
      const isPureMonthly = campaign.evaluationPeriod === "PURE_MONTHLY";
      const hasEndDate = !isPureMonthly && (campaign.endDate && String(campaign.endDate).trim() !== "");

      if (calcMode === "MONTHLY_ONLY" || (isPureMonthly && !hasEndDate)) {
        // Ongoing PURE_MONTHLY campaign or MONTHLY_ONLY evaluation mode:
        // Evaluate targetMonth as a standalone independent month
        const primaryMonth = (targetMonth && targetMonth !== "ALL")
          ? targetMonth
          : (Object.keys(sData.monthlyMap).sort().pop() || new Date().toISOString().substring(0, 7));

        const mData = sData.monthlyMap[primaryMonth] || { qty: 0, poin: 0, omzet: 0, groupQtyMap: {}, groupPoinMap: {}, groupOmzetMap: {}, skuQtyMap: {}, skuPoinMap: {}, skuOmzetMap: {}, transactions: [] };
        sData.totalQty = mData.qty;
        sData.totalPoin = mData.poin || 0;
        sData.totalOmzet = mData.omzet;
        sData.groupQtyMap = mData.groupQtyMap || {};
        sData.groupPoinMap = mData.groupPoinMap || {};
        sData.groupOmzetMap = mData.groupOmzetMap || {};
        sData.skuQtyMap = mData.skuQtyMap || {};
        sData.skuPoinMap = mData.skuPoinMap || {};
        sData.skuOmzetMap = mData.skuOmzetMap || {};
        sData.transactions = mData.transactions || [];
      }

      let totalQty = sData.totalQty || 0;
      let totalPoin = sData.totalPoin || 0;
      let totalOmzet = sData.totalOmzet || 0;

      // Find highest tier achieved
      let matchedTier = null;
      for (const tier of sortedTiers) {
        let qtyMet = tier.minQty > 0 ? totalQty >= tier.minQty : true;
        let omzetMet = tier.minOmzet > 0 ? totalOmzet >= tier.minOmzet : true;

        if (campaign.targetBasis === "QTY" && qtyMet && tier.minQty > 0) {
          matchedTier = tier;
          break;
        } else if (campaign.targetBasis === "OMZET" && omzetMet && tier.minOmzet > 0) {
          matchedTier = tier;
          break;
        } else if (campaign.targetBasis === "BOTH" && qtyMet && omzetMet && (tier.minQty > 0 || tier.minOmzet > 0)) {
          matchedTier = tier;
          break;
        }
      }

      // Find next tier target
      let nextTier = null;
      if (!matchedTier) {
        nextTier = ascTiers[0] || null;
      } else {
        nextTier = ascTiers.find(t => t.level > matchedTier.level) || null;
      }


      let gapQty = 0;
      let gapOmzet = 0;
      let progressPercentage = 0;
      let gapDescription = "";

      if (nextTier) {
        let effMinQty = nextTier.minQty || 0;
        let effMinOmzet = nextTier.minOmzet > 0 ? nextTier.minOmzet : 0;
        let targetPoin = nextTier.minOmzet > 0 ? nextTier.minOmzet : nextTier.minQty;
        
        let isSoftMonthlyMode = false;
        if (calcMode === "MONTHLY_ONLY" && campaign.evaluationPeriod !== "PURE_MONTHLY" && nextTier.hasConsistencyBonus) {
          if ((nextTier.consistencyMinQty > 0 || nextTier.consistencyMinOmzet > 0)) {
            isSoftMonthlyMode = true;
            effMinQty = nextTier.consistencyMinQty || 0;
            if (campaign.targetBasis === "POIN" || campaign.targetBasis === "OMZET" || nextTier.minOmzet > 0) {
              effMinOmzet = nextTier.consistencyMinOmzet || 0;
              targetPoin = effMinOmzet;
            } else {
              targetPoin = effMinQty;
            }
          }
        }

        gapQty = Math.max(0, effMinQty - totalQty);
        gapOmzet = Math.max(0, targetPoin - totalOmzet);
        const gapPoin = Math.max(0, targetPoin - totalPoin);

        let progVal = campaign.targetBasis === "POIN" ? totalPoin : (campaign.targetBasis === "OMZET" ? totalOmzet : totalQty);
        progressPercentage = Math.min(100, Math.round((progVal / (targetPoin || 1)) * 100));

        const achievedPrefix = matchedTier ? "Capai " + (matchedTier.tierName || 'Level ' + matchedTier.level) + "! " : "";
        let nextTierName = nextTier.tierName || ('Tier ' + nextTier.level);
        
        if (isSoftMonthlyMode) {
           nextTierName = "Target Bulanan (" + nextTierName + ")";
        }

        const nextEff = getEffectiveTargetBasis(campaign, nextTier);
        if (isSoftMonthlyMode && gapQty === 0 && gapOmzet === 0 && gapPoin === 0) {
          gapDescription = "✅ Target Bulanan Tercapai! (" + targetPoin.toLocaleString("id-ID") + ")";
        } else if (totalOmzet === 0 && totalQty === 0) {
          if (nextEff === "POIN") gapDescription = "\uD83D\uDEAB Belum ada pengambilan (Target min: " + targetPoin.toLocaleString("id-ID") + " Poin ke " + nextTierName + ")";
          else if (nextEff === "OMZET") gapDescription = "\uD83D\uDEAB Belum ada pengambilan (Target min: Rp " + targetPoin.toLocaleString("id-ID") + " ke " + nextTierName + ")";
          else if (nextEff === "BOTH") gapDescription = "\uD83D\uDEAB Belum ada pengambilan (Target min: " + effMinQty + " Unit & Rp " + targetPoin.toLocaleString("id-ID") + " ke " + nextTierName + ")";
          else gapDescription = "\uD83D\uDEAB Belum ada pengambilan (Target min: " + effMinQty + " Unit ke " + nextTierName + ")";
        } else {
          if (nextEff === "POIN") gapDescription = "\uD83D\uDCC8 " + achievedPrefix + "Kurang " + gapPoin.toLocaleString("id-ID") + " Poin lagi ke " + nextTierName + " (Target min: " + targetPoin.toLocaleString("id-ID") + " Poin)";
          else if (nextEff === "OMZET") gapDescription = "\uD83D\uDCC8 " + achievedPrefix + "Kurang Rp " + gapOmzet.toLocaleString("id-ID") + " lagi ke " + nextTierName + " (Target min: Rp " + effMinOmzet.toLocaleString("id-ID") + ")";
          else if (nextEff === "BOTH") gapDescription = "\uD83D\uDCC8 " + achievedPrefix + "Kurang " + gapQty + " Unit & Rp " + gapOmzet.toLocaleString("id-ID") + " lagi ke " + nextTierName + " (Target min: " + effMinQty + " Unit & Rp " + effMinOmzet.toLocaleString("id-ID") + ")";
          else gapDescription = "\uD83D\uDCC8 " + achievedPrefix + "Kurang " + gapQty.toLocaleString("id-ID") + " Unit lagi ke " + nextTierName + " (Target min: " + effMinQty + " Unit)";
        }
} else {
        progressPercentage = 100;
        gapDescription = `🏆 Capai Target Maksimum (${matchedTier ? matchedTier.tierName : 'Lulus'})`;
      }

      // Calculate Reward Amounts if Tier Matched or if MONTHLY Evaluation Mode
      let totalRewardValue = 0;
      let itemRateRewardsTotal = 0;
      let rewardItemBreakdown = [];
      let fixedCashAmount = 0;
      let fixedVoucherAmount = 0;
      let goodsDescription = "";

      if (campaign.evaluationPeriod === "MONTHLY" || campaign.evaluationPeriod === "PURE_MONTHLY") {
        const fullCampaignMonths = getCampaignActiveMonths(campaign.startDate, campaign.endDate);
        const totalProgramMonths = fullCampaignMonths.length;
        let activeMonths = [...fullCampaignMonths];
        if (targetMonth && targetMonth !== "ALL") {
          if (calcMode === "MONTHLY_ONLY") {
            activeMonths = activeMonths.filter(mKey => mKey === targetMonth);
          } else {
            activeMonths = activeMonths.filter(mKey => mKey <= targetMonth);
          }
        }

        if (hasEndDate) {
          // --- TYPE A: FIXED PROGRAM (Has End Date) ---
          // Sum up monthly rewards & sales across active months up to targetMonth
          let sumMonthlyReward = 0;
          let sumItemRates = 0;
          let sumCash = 0;
          let sumVoucher = 0;
          let sumQty = 0;
          let sumPoin = 0;
          let sumOmzet = 0;
          let goodsParts = [];
          let topTierLevel = 0;
          let topTierName = "Belum Mencapai Target";
          let monthSummaries = [];

          const minTargetTier = ascTiers[0] || null;

          activeMonths.forEach(mKey => {
            const mData = sData.monthlyMap[mKey] || { qty: 0, poin: 0, omzet: 0, groupQtyMap: {}, groupPoinMap: {}, groupOmzetMap: {} };
            const mQty = mData.qty || 0;
            const mPoin = mData.poin || 0;
            const mOmzet = mData.omzet || 0;
            sumQty += mQty;
            sumPoin += mPoin;
            sumOmzet += mOmzet;

            let actualStr = campaign.targetBasis === "POIN" ? `${mPoin.toLocaleString("id-ID")} Poin` : (campaign.targetBasis === "OMZET" ? `Rp ${mOmzet.toLocaleString("id-ID")}` : `${mQty.toLocaleString("id-ID")} Unit`);

            const sDataForMonth = {
              ...sData,
              totalQty: mQty,
              totalOmzet: mOmzet,
              groupQtyMap: mData.groupQtyMap || {},
              groupOmzetMap: mData.groupOmzetMap || {}
            };

            const mRewardCalc = this.calculateTierRewardsWithMultiplier(sortedTiers, mQty, mOmzet, mPoin, campaign, sDataForMonth);
            const mTier = mRewardCalc.matchedTier;

            if (mTier) {
              if (mTier.level > topTierLevel) {
                topTierLevel = mTier.level;
                topTierName = mTier.tierName;
              }

              const mRates = mRewardCalc.itemRateRewardsTotal;
              const mCashVal = mRewardCalc.fixedCashAmount;
              const mVoucherVal = mRewardCalc.fixedVoucherAmount;
              if (mRewardCalc.goodsDescription) {
                goodsParts.push(`${mRewardCalc.goodsDescription} [Bulan ${mKey}]`);
              }

              const mTotalReward = mRates + mCashVal + mVoucherVal;
              sumItemRates += mRates;
              sumCash += mCashVal;
              sumVoucher += mVoucherVal;
              sumMonthlyReward += mTotalReward;

              let targetVal = mTier.minOmzet > 0 ? mTier.minOmzet : mTier.minQty;
              let mTargetStr = `${targetVal.toLocaleString("id-ID")} Poin`;

              monthSummaries.push(`${mKey}: ${mTier.tierName} (${actualStr} / Target min: ${mTargetStr})`);
            } else {
              let minTargetStr = "";
              if (minTargetTier) {
                let minTargetVal = minTargetTier.minOmzet > 0 ? minTargetTier.minOmzet : minTargetTier.minQty;
                minTargetStr = `${minTargetVal.toLocaleString("id-ID")} Poin`;
              }

              if (minTargetStr) {
                monthSummaries.push(`${mKey}: ${actualStr} (Belum Target min: ${minTargetStr})`);
              } else {
                monthSummaries.push(`${mKey}: ${actualStr} (Belum Target)`);
              }
            }
          });

          totalQty = sumQty;
          totalPoin = sumPoin;
          totalOmzet = sumOmzet;
          sData.totalQty = sumQty;
          sData.totalPoin = sumPoin;
          sData.totalOmzet = sumOmzet;
          matchedTier = topTierLevel > 0 ? { level: topTierLevel, tierName: topTierName + " (Evaluasi Per Bulan)" } : null;
          totalRewardValue = sumMonthlyReward;
          itemRateRewardsTotal = sumItemRates;
          fixedCashAmount = sumCash;
          fixedVoucherAmount = sumVoucher;
          goodsDescription = goodsParts.join(" + ");
          const cutoffSuffix = (targetMonth && targetMonth !== "ALL" && activeMonths.length < totalProgramMonths)
            ? ` (${totalProgramMonths} Bln Program, s/d Cut-off Bln Ke-${activeMonths.length})`
            : ` (${totalProgramMonths} Bln Program)`;
          gapDescription = `📋 Evaluasi Per Bulan${cutoffSuffix}: ` + monthSummaries.join(" | ");

        } else {
          // --- TYPE B: ONGOING MONTHLY PROGRAM (No End Date) ---
          // Evaluate targetMonth as an independent standalone month
          const primaryMonth = (targetMonth && targetMonth !== "ALL" && activeMonths.includes(targetMonth))
            ? targetMonth
            : (activeMonths.length > 0 ? activeMonths[activeMonths.length - 1] : "");

          const mData = sData.monthlyMap[primaryMonth] || { qty: 0, poin: 0, omzet: 0, groupQtyMap: {}, groupPoinMap: {}, groupOmzetMap: {} };
          const mQty = mData.qty || 0;
          const mPoin = mData.poin || 0;
          const mOmzet = mData.omzet || 0;

          totalQty = mQty;
          totalPoin = mPoin;
          totalOmzet = mOmzet;
          sData.totalQty = mQty;
          sData.totalPoin = mPoin;
          sData.totalOmzet = mOmzet;

          const sDataForMonth = {
            ...sData,
            totalQty: mQty,
            totalOmzet: mOmzet,
            groupQtyMap: mData.groupQtyMap || {},
            groupOmzetMap: mData.groupOmzetMap || {}
          };

          const rewardCalc = this.calculateTierRewardsWithMultiplier(sortedTiers, mQty, mOmzet, mPoin, campaign, sDataForMonth);
          matchedTier = rewardCalc.matchedTier;

          if (matchedTier) {
            itemRateRewardsTotal = rewardCalc.itemRateRewardsTotal;
            fixedCashAmount = rewardCalc.fixedCashAmount;
            fixedVoucherAmount = rewardCalc.fixedVoucherAmount;
            goodsDescription = rewardCalc.goodsDescription;
            rewardItemBreakdown = rewardCalc.rewardItemBreakdown;
            totalRewardValue = itemRateRewardsTotal + fixedCashAmount + fixedVoucherAmount;
          }

          let nextTier = null;
          if (!matchedTier) {
            nextTier = ascTiers[0] || null;
          } else {
            nextTier = ascTiers.find(t => t.level > matchedTier.level) || null;
          }

          if (nextTier) {
            if (nextTier.minQty > 0) gapQty = Math.max(0, nextTier.minQty - mQty);
            if (nextTier.minOmzet > 0) gapOmzet = Math.max(0, nextTier.minOmzet - mOmzet);
            let gapPoinMonth = nextTier.minOmzet > 0 ? Math.max(0, nextTier.minOmzet - mPoin) : 0;

            const nextEffBasis = getEffectiveTargetBasis(campaign, nextTier);

            if (nextEffBasis === "QTY" && nextTier.minQty > 0) {
              progressPercentage = Math.min(100, Math.round((mQty / nextTier.minQty) * 100));
            } else if (nextEffBasis === "OMZET" && nextTier.minOmzet > 0) {
              progressPercentage = Math.min(100, Math.round((mOmzet / nextTier.minOmzet) * 100));
            } else {
              progressPercentage = Math.min(100, Math.round((mQty / (nextTier.minQty || 1)) * 100));
            }

            const achievedPrefix = matchedTier ? `Capai ${matchedTier.tierName}! ` : "";
            const nextTierName = nextTier.tierName || ('Tier ' + nextTier.level);

            if (mQty === 0 && mOmzet === 0) {
              if (nextEffBasis === "POIN") gapDescription = `\uD83D\uDEAB Belum ada pengambilan di bulan ini (Target min: ${nextTier.minOmzet.toLocaleString("id-ID")} Poin ke ${nextTierName})`;
              else if (nextEffBasis === "OMZET") gapDescription = `\uD83D\uDEAB Belum ada pengambilan di bulan ini (Target min: Rp ${nextTier.minOmzet.toLocaleString("id-ID")} ke ${nextTierName})`;
              else if (nextEffBasis === "BOTH") gapDescription = `\uD83D\uDEAB Belum ada pengambilan di bulan ini (Target min: ${nextTier.minQty} Unit & Rp ${nextTier.minOmzet.toLocaleString("id-ID")} ke ${nextTierName})`;
              else gapDescription = `\uD83D\uDEAB Belum ada pengambilan di bulan ini (Target min: ${nextTier.minQty} Unit ke ${nextTierName})`;
            } else {
              if (nextEffBasis === "POIN") gapDescription = `\uD83D\uDCC8 ${achievedPrefix}Kurang ${gapPoinMonth.toLocaleString("id-ID")} Poin lagi ke ${nextTierName} (Target min: ${(nextTier.minOmzet > 0 ? nextTier.minOmzet : (nextTier.minQty || 0)).toLocaleString("id-ID")} Poin)`;
              else if (nextEffBasis === "OMZET") gapDescription = `\uD83D\uDCC8 ${achievedPrefix}Kurang Rp ${gapOmzet.toLocaleString("id-ID")} lagi ke ${nextTierName} (Target min: Rp ${nextTier.minOmzet.toLocaleString("id-ID")})`;
              else if (nextEffBasis === "BOTH") gapDescription = `\uD83D\uDCC8 ${achievedPrefix}Kurang ${gapQty} Unit & Rp ${gapOmzet.toLocaleString("id-ID")} lagi ke ${nextTierName} (Target min: ${nextTier.minQty} Unit & Rp ${nextTier.minOmzet.toLocaleString("id-ID")})`;
              else gapDescription = `\uD83D\uDCC8 ${achievedPrefix}Kurang ${gapQty.toLocaleString("id-ID")} Unit lagi ke ${nextTierName} (Target min: ${nextTier.minQty} Unit)`;
            }
          } else {
            progressPercentage = 100;
            gapDescription = `🏆 Capai Target Maksimum (${matchedTier ? matchedTier.tierName : 'Lulus'})`;
          }
        }

      } else if (matchedTier) {
        const rewardCalc = this.calculateTierRewardsWithMultiplier(sortedTiers, totalQty, totalOmzet, totalPoin, campaign, sData);
        itemRateRewardsTotal = rewardCalc.itemRateRewardsTotal;
        fixedCashAmount = rewardCalc.fixedCashAmount;
        fixedVoucherAmount = rewardCalc.fixedVoucherAmount;
        goodsDescription = rewardCalc.goodsDescription;
        rewardItemBreakdown = rewardCalc.rewardItemBreakdown;

        // 3. Consistency Bonus Check (Per Active Month in Campaign)
        let isConsistencyAchieved = false;
        let consistencyVoucherEarned = 0;
        let consistencyGoodsDescription = "";
        let monthlyConsistencyMap = {};

        const activeMonths = getCampaignActiveMonths(campaign.startDate, campaign.endDate);

        if (matchedTier.hasConsistencyBonus) {
          const bonusType = matchedTier.bonusType || "MONTHLY_CONSISTENCY";

          if (bonusType === "PERIOD_TOTAL") {
            const reqTotalQty = matchedTier.consistencyMinQty > 0 ? matchedTier.consistencyMinQty : 0;
            const reqTotalOmzet = matchedTier.consistencyMinOmzet > 0 ? matchedTier.consistencyMinOmzet : 0;

            let met = true;
            if (campaign.targetBasis === "QTY" && reqTotalQty > 0) {
              met = totalQty >= reqTotalQty;
            } else if (campaign.targetBasis === "OMZET" && reqTotalOmzet > 0) {
              met = totalOmzet >= reqTotalOmzet;
            } else if (campaign.targetBasis === "BOTH") {
              let qtyMet = reqTotalQty > 0 ? totalQty >= reqTotalQty : true;
              let omzetMet = reqTotalOmzet > 0 ? totalOmzet >= reqTotalOmzet : true;
              met = qtyMet && omzetMet;
            }

            if (met) {
              isConsistencyAchieved = true;
            }
          } else if (activeMonths.length > 0) {
            let isConsistentInAllMonths = true;

            const reqQtyPerMonth = matchedTier.consistencyMinQty > 0
              ? matchedTier.consistencyMinQty
              : (matchedTier.minQty > 0 ? Math.ceil(matchedTier.minQty / activeMonths.length) : 0);

            const reqOmzetPerMonth = matchedTier.consistencyMinOmzet > 0
              ? matchedTier.consistencyMinOmzet
              : (matchedTier.minOmzet > 0 ? Math.ceil(matchedTier.minOmzet / activeMonths.length) : 0);

            activeMonths.forEach(mKey => {
              const mData = sData.monthlyMap[mKey] || { qty: 0, omzet: 0 };
              let met = true;

              if (campaign.targetBasis === "QTY" && reqQtyPerMonth > 0) {
                met = mData.qty >= reqQtyPerMonth;
              } else if (campaign.targetBasis === "OMZET" && reqOmzetPerMonth > 0) {
                  met = mData.omzet >= reqOmzetPerMonth;
                } else if (campaign.targetBasis === "POIN" && reqOmzetPerMonth > 0) {
                  met = (mData.poin || 0) >= reqOmzetPerMonth;
              } else if (campaign.targetBasis === "BOTH") {
                let qtyMet = reqQtyPerMonth > 0 ? mData.qty >= reqQtyPerMonth : true;
                let omzetMet = reqOmzetPerMonth > 0 ? mData.omzet >= reqOmzetPerMonth : true;
                met = qtyMet && omzetMet;
              }

              if (!met) isConsistentInAllMonths = false;

              monthlyConsistencyMap[mKey] = {
                qty: mData.qty,
                omzet: mData.omzet,
                targetQty: reqQtyPerMonth,
                targetOmzet: reqOmzetPerMonth,
                met: met
              };
            });

            if (isConsistentInAllMonths) {
              isConsistencyAchieved = true;
            }
          }

          // Aturan: reward konsistensi hanya muncul saat periode akhir campaign berjalan (atau setelahnya)
          if (isConsistencyAchieved) {
            const currentRealMonth = new Date().toISOString().substring(0, 7);
            const finalCampaignMonth = activeMonths.length > 0 ? activeMonths[activeMonths.length - 1] : currentRealMonth;
            
            if (currentRealMonth < finalCampaignMonth) {
              isConsistencyAchieved = false;
            }
          }

          if (isConsistencyAchieved) {
            const cFactor = matchedTier.isConsistencyMultiplier === true ? multiplierFactor : 1;

            consistencyVoucherEarned = (matchedTier.consistencyVoucherAmount || 0) * cFactor;
            fixedVoucherAmount += consistencyVoucherEarned;

            if (matchedTier.consistencyGoodsItems && Array.isArray(matchedTier.consistencyGoodsItems) && matchedTier.consistencyGoodsItems.length > 0) {
              const cParts = matchedTier.consistencyGoodsItems
                .filter(g => g && g.name && g.name.trim() !== "")
                .map(g => formatEngineGoodsItem(g.name, g.qty, cFactor));
              consistencyGoodsDescription = cParts.join(" + ");
              if (cFactor > 1 && cParts.length > 0) {
                consistencyGoodsDescription += ` (${cFactor}x Kelipatan Bonus)`;
              }
            }

            const labelBonus = bonusType === "PERIOD_TOTAL" ? "Hadiah Bonus Total Periode" : "Hadiah Bonus Konsistensi Bulanan";
            if (consistencyGoodsDescription) {
              goodsDescription += (goodsDescription ? " + " : "") + `[${labelBonus}: ${consistencyGoodsDescription}]`;
            }
          }
        }

        totalRewardValue = itemRateRewardsTotal + fixedCashAmount + fixedVoucherAmount;
      }

      // Check existing payout status if already recorded
      const existingAch = window.db.getAchievements().find(a => a.campaignId === campaignId && a.storeId === storeId);
      const payoutStatus = existingAch ? existingAch.payoutStatus : (matchedTier ? "PENDING" : "NOT_QUALIFIED");

      const effectiveTargetBasis = getEffectiveTargetBasis(campaign, ascTiers[0]);

      // Determine eligible product groups for this campaign
      let eligibleGroups = [];
      if (campaign.productFilterScope === "BY_SKU") {
        if (!campaign.eligibleProductIds || campaign.eligibleProductIds.length === 0) {
          eligibleGroups = productGroups;
        } else {
          const epSet = new Set(campaign.eligibleProductIds.map(id => String(id).toLowerCase().trim()));
          const eligibleProds = products.filter(p => epSet.has(String(p.id).toLowerCase().trim()) || epSet.has(String(p.productCode).toLowerCase().trim()));
          const grpIds = new Set(eligibleProds.map(p => String(p.groupId).toLowerCase().trim()));
          eligibleGroups = productGroups.filter(g => grpIds.has(String(g.id).toLowerCase().trim()) || grpIds.has(String(g.groupCode).toLowerCase().trim()));
        }
      } else {
        if (!campaign.eligibleGroupIds || campaign.eligibleGroupIds.length === 0) {
          eligibleGroups = productGroups;
        } else {
          const egIds = new Set((campaign.eligibleGroupIds || []).map(id => String(id).toLowerCase().trim()));
          eligibleGroups = productGroups.filter(g => egIds.has(String(g.id).toLowerCase().trim()) || egIds.has(String(g.groupCode).toLowerCase().trim()));
        }
      }

      const groupBreakdowns = eligibleGroups.map(grp => {
        const gId = String(grp.id || "").toLowerCase().trim();
        const gCode = String(grp.groupCode || "").toLowerCase().trim();

        // Get actual transactions for this store & group in the target period
        const grpTransactions = (sData.transactions || []).filter(t => {
          const tGrp = String(t.groupId || "").toLowerCase().trim();
          return tGrp === gId || tGrp === gCode || tGrp.replace(/^grp_/, "") === gId.replace(/^grp_/, "");
        });

        let gQty = 0;
        let gOmzet = 0;

        if (grpTransactions.length > 0) {
          grpTransactions.forEach(t => {
            gQty += parseFloat(t.qty || 0);
            gOmzet += parseFloat(t.totalOmzet || 0);
          });
        } else {
          gQty = getGroupMetricFromMap(sData.groupQtyMap, grp);
          gOmzet = getGroupMetricFromMap(sData.groupOmzetMap, grp);
        }

        // Fallback: If store has totalQty > 0 and only 1 group in campaign, attribute totalQty to this group
        if (gQty === 0 && totalQty > 0 && eligibleGroups.length === 1) {
          gQty = totalQty;
          gOmzet = totalOmzet;
        }

        const isPurchased = gQty > 0;

        // Build skuSummaryList directly from raw transactions (if available)
        let skuSummaryList = [];
        if (grpTransactions.length > 0) {
          const skuSummaryMap = {};
          grpTransactions.forEach(t => {
            const pCode = t.realProductCode || t.productCode || t.masterProductCode || "-";
            if (!skuSummaryMap[pCode]) {
              skuSummaryMap[pCode] = {
                productCode: pCode, // REAL SKU CODE FROM DATA SALES! (e.g. PRB17-SATIN-RED)
                productName: t.masterProductName || t.masterProductCode || pCode,
                masterCode: t.masterProductCode || "-",
                masterProductName: t.masterProductName || "-",
                unitPrice: t.unitPrice || 1,
                totalQty: 0,
                totalOmzet: 0,
                count: 0
              };
            }
            skuSummaryMap[pCode].totalQty += t.qty;
            skuSummaryMap[pCode].totalOmzet += t.totalOmzet;
            skuSummaryMap[pCode].count++;
          });
          skuSummaryList = Object.values(skuSummaryMap);
        }

        let groupProducts = products.filter(p => {
          const pGrpId = String(p.groupId || "").toLowerCase().trim();
          return pGrpId === gId || pGrpId === gCode || pGrpId.replace(/^grp_/, "") === gId.replace(/^grp_/, "");
        });
        if (campaign.productFilterScope === "BY_SKU" && campaign.eligibleProductIds?.length > 0) {
          const epIds = new Set(campaign.eligibleProductIds.map(id => String(id).toLowerCase().trim()));
          groupProducts = groupProducts.filter(p => epIds.has(String(p.id).toLowerCase().trim()) || epIds.has(String(p.productCode).toLowerCase().trim()));
        }

        const enrichedProducts = groupProducts.map(p => {
          const sQty = getSkuMetricFromMap(sData.skuQtyMap, p);
          const sOmzet = getSkuMetricFromMap(sData.skuOmzetMap, p) || (sQty * (p.unitPrice || 1));
          return {
            productId: p.id,
            productCode: p.productCode || "",
            productName: p.productName || "",
            unitPrice: p.unitPrice || 0,
            qtyTaken: sQty,
            qty: sQty,
            omzet: sOmzet
          };
        });

        if (skuSummaryList.length === 0 && isPurchased) {
          if (enrichedProducts.length > 0) {
            skuSummaryList = enrichedProducts.map(p => ({
              productCode: p.productCode,
              productName: p.productName,
              masterCode: p.productCode,
              masterProductName: p.productName,
              unitPrice: p.unitPrice,
              totalQty: p.qtyTaken > 0 ? p.qtyTaken : gQty,
              totalOmzet: p.omzet > 0 ? p.omzet : gOmzet
            }));
          } else {
            skuSummaryList = [{
              productCode: grp.groupCode || grp.id,
              productName: grp.groupName || grp.groupCode,
              masterCode: grp.groupCode || grp.id,
              masterProductName: grp.groupName || grp.groupCode,
              unitPrice: 1,
              totalQty: gQty,
              totalOmzet: gOmzet
            }];
          }
        }

        return {
          groupId: grp.id,
          groupCode: grp.groupCode,
          groupName: grp.groupName,
          qty: gQty,
          omzet: gOmzet,
          totalQty: gQty,
          totalOmzet: gOmzet,
          isPurchased: isPurchased,
          is_purchased: isPurchased,
          products: enrichedProducts,
          transactions: grpTransactions,
          skuSummaryList: skuSummaryList,
          sku_summary_list: skuSummaryList
        };
      });

      const skuBreakdown = Object.keys(sData.skuQtyMap || {}).map(skuKey => ({
        skuCode: skuKey,
        qty: sData.skuQtyMap[skuKey] || 0
      }));

      achievementResults.push({
        id: existingAch ? existingAch.id : "ach_" + campaignId + "_" + storeId,
        snapshotMonth: targetMonth || "ALL",
        snapshotCalcMode: calcMode || "CUMULATIVE",
        campaignId: campaignId,
        campaignCode: campaign.campaignCode,
        campaignName: campaign.campaignName,
        targetBasis: campaign.targetBasis,
        effectiveTargetBasis: effectiveTargetBasis,
        storeId: storeId,
        storeCode: sData.store.storeCode,
        storeName: sData.store.storeName,
        salesmanName: sData.store.salesmanName || "",
        region: sData.store.region || "",
        totalQty: totalQty,
        totalPoin: totalPoin,
        totalOmzet: totalOmzet,
        matchedTierLevel: matchedTier ? matchedTier.level : 0,
        matchedTierName: matchedTier ? matchedTier.tierName : "Belum Mencapai Target",
        nextTierLevel: nextTier ? nextTier.level : null,
        nextTierName: nextTier ? nextTier.tierName : null,
        gapQty: gapQty,
        gapOmzet: gapOmzet,
        progressPercentage: progressPercentage,
        gapDescription: gapDescription,
        groupBreakdowns: groupBreakdowns,
        skuBreakdown: skuBreakdown,
        itemRateRewardsTotal: itemRateRewardsTotal,
        rewardItemBreakdown: rewardItemBreakdown,
        fixedCashAmount: fixedCashAmount,
        fixedVoucherAmount: fixedVoucherAmount,
        goodsDescription: goodsDescription,
        isConsistencyAchieved: matchedTier ? (matchedTier.hasConsistencyBonus && fixedVoucherAmount > 0) : false,
        totalRewardValue: totalRewardValue,
        payoutStatus: payoutStatus,
        calculatedAt: new Date().toISOString()
      });
    });

    // Save calculation to DB if autoSave is true
    if (autoSave) {
      const otherAchievements = window.db.getAchievements().filter(a => a.campaignId !== campaignId);
      const merged = [...otherAchievements, ...achievementResults];
      window.db.saveAchievements(merged);
    }
    return achievementResults;
  }

  calculateAllActiveCampaignAchievements(targetMonth = "", calcMode = "CUMULATIVE") {
    const targetCampaigns = window.db.getCampaigns().filter(c => isCampaignRunningInMonth(c, targetMonth));

    let allResults = [];
    targetCampaigns.forEach(c => {
      const res = this.calculateCampaignAchievements(c.id, targetMonth, calcMode, false);
      allResults.push(...res);
    });
    window.db.saveSnapshotForPeriod(targetMonth, calcMode, allResults);
    return allResults;
  }

  getStoreCampaignBreakdown(campaignId, storeId, targetMonth = "", calcMode = "CUMULATIVE") {
    const campaigns = window.db.getCampaigns() || [];
    const stores = window.db.getStores() || [];

    const campaign = campaigns.find(c => c.id === campaignId || (c.campaignCode && campaignId && String(c.campaignCode).toLowerCase().trim() === String(campaignId).toLowerCase().trim()));
    const store = stores.find(s => s.id === storeId || (s.storeCode && storeId && String(s.storeCode).toLowerCase().trim() === String(storeId).toLowerCase().trim()));
    if (!campaign || !store) return null;

    const products = window.db.getProducts();
    const productGroups = window.db.getProductGroups();
    const sales = window.db.getSales();

    const productMap = new Map(products.map(p => [p.id, p]));

    // Determine eligible product groups for this campaign
    let eligibleGroups = [];
    if (campaign.productFilterScope === "BY_SKU") {
      if (!campaign.eligibleProductIds || campaign.eligibleProductIds.length === 0) {
        eligibleGroups = productGroups;
      } else {
        const eligibleProds = products.filter(p => campaign.eligibleProductIds.includes(p.id));
        const grpIds = new Set(eligibleProds.map(p => p.groupId));
        eligibleGroups = productGroups.filter(g => grpIds.has(g.id));
      }
    } else {
      if (!campaign.eligibleGroupIds || campaign.eligibleGroupIds.length === 0) {
        eligibleGroups = productGroups;
      } else {
        eligibleGroups = productGroups.filter(g => campaign.eligibleGroupIds.includes(g.id));
      }
    }

    // Filter sales for this store & campaign date range & eligible product groups / SKUs
    const normStart = campaign.startDate ? normalizeDateForEngine(campaign.startDate) : "";
    const normEnd = campaign.endDate ? normalizeDateForEngine(campaign.endDate) : "";

    const storeSales = sales.filter(trx => {
      const storeMatch = findStoreForEngine(trx, [store]);
      if (!storeMatch || storeMatch.id !== store.id) return false;

      if (trx.transactionDate) {
        const normTrxDate = normalizeDateForEngine(trx.transactionDate);
        if (normStart && normTrxDate && normTrxDate < normStart) return false;

        if (targetMonth && targetMonth !== "ALL") {
          if (calcMode === "MONTHLY_ONLY") {
            if (!normTrxDate.startsWith(targetMonth)) return false;
          } else {
            if (normTrxDate.substring(0, 7) > targetMonth) return false;
          }
        } else if (normEnd && normTrxDate && normTrxDate > normEnd) {
          return false;
        }
      }

      const prod = findProductForEngine(trx, products, productMap);
      if (!prod) return false;
      if (!isProductEligibleForCampaign(prod, campaign)) return false;
      return true;
    });

    // Group sales breakdown by Group ID
    const groupDataMap = new Map();
    eligibleGroups.forEach(g => {
      let groupProducts = products.filter(p => p.groupId === g.id);
      if (campaign.productFilterScope === "BY_SKU" && campaign.eligibleProductIds?.length > 0) {
        groupProducts = groupProducts.filter(p => campaign.eligibleProductIds.includes(p.id));
      }

      groupDataMap.set(g.id, {
        groupId: g.id,
        groupCode: g.groupCode,
        groupName: g.groupName,
        products: groupProducts,
        totalQty: 0,
        totalOmzet: 0,
        transactionsCount: 0,
        transactions: [],
        skuSummaryMap: {}
      });
    });

    storeSales.forEach(trx => {
      const prod = findProductForEngine(trx, products, productMap);
      if (prod && groupDataMap.has(prod.groupId)) {
        const itemData = groupDataMap.get(prod.groupId);
        const trxQty = parseFloat(trx.qty || 0);
        const itemPoinSatuan = (prod && prod.unitPrice > 0) ? prod.unitPrice : 1;
        const trxPoin = trxQty * itemPoinSatuan;

        itemData.totalQty += trxQty;
          itemData.totalPoin = (itemData.totalPoin || 0) + trxPoin;
          itemData.totalOmzet += parseFloat(trx.totalOmzet || 0);
        itemData.transactionsCount++;

        itemData.transactions.push({
          invoiceNo: trx.invoiceNo || "-",
          transactionDate: normalizeDateForEngine(trx.transactionDate || ""),
          realProductCode: trx.productCode || prod.productCode || "-",
          masterProductCode: prod.productCode || "-",
          masterProductName: prod.productName || "-",
          unitPrice: itemPoinSatuan,
          qty: trxQty,
          totalOmzet: trxPoin
        });

        const pRealCode = trx.productCode || prod.productCode || "OTHER";
        if (!itemData.skuSummaryMap[pRealCode]) {
          itemData.skuSummaryMap[pRealCode] = {
            productCode: pRealCode,
            productName: prod.productName || prod.productCode || pRealCode,
            masterCode: prod.productCode || "-",
            unitPrice: itemPoinSatuan,
            totalQty: 0,
            totalOmzet: 0,
            count: 0
          };
        }
        itemData.skuSummaryMap[pRealCode].totalQty += trxQty;
        itemData.skuSummaryMap[pRealCode].totalOmzet += trxPoin;
        itemData.skuSummaryMap[pRealCode].count++;
      }
    });

    const achievements = this.calculateCampaignAchievements(campaign.id, targetMonth, calcMode, false);
    const storeAch = achievements.find(a => a.storeId === store.id || (a.storeCode && store.storeCode && String(a.storeCode).toLowerCase().trim() === String(store.storeCode).toLowerCase().trim()));

    const groupBreakdowns = Array.from(groupDataMap.values()).map(gData => {
      const isPurchased = gData.totalQty > 0;
      const safeOmzet = typeof gData.totalOmzet === "number" && !isNaN(gData.totalOmzet) ? gData.totalOmzet : 0;
      const skuSummaryList = Object.values(gData.skuSummaryMap || {});

      const skuQtyMap = {};
      const skuOmzetMap = {};
      skuSummaryList.forEach(s => {
        if (s.masterCode && s.masterCode !== "-") {
          skuQtyMap[s.masterCode] = (skuQtyMap[s.masterCode] || 0) + (s.totalQty || 0);
          skuOmzetMap[s.masterCode] = (skuOmzetMap[s.masterCode] || 0) + (s.totalOmzet || 0);
        }
        if (s.productCode) {
          skuQtyMap[s.productCode] = (skuQtyMap[s.productCode] || 0) + (s.totalQty || 0);
          skuOmzetMap[s.productCode] = (skuOmzetMap[s.productCode] || 0) + (s.totalOmzet || 0);
        }
      });

      const enrichedProducts = (gData.products || []).map(p => {
        const sQty = skuQtyMap[p.productCode] || skuQtyMap[p.id] || 0;
        const sOmzet = skuOmzetMap[p.productCode] || skuOmzetMap[p.id] || 0;
        return {
          productId: p.id,
          productCode: p.productCode || "",
          productName: p.productName || "",
          unitPrice: p.unitPrice || 0,
          qtyTaken: sQty,
          qty: sQty,
          omzet: sOmzet
        };
      });

      return {
        ...gData,
        products: enrichedProducts,
        totalOmzet: safeOmzet,
        isPurchased: isPurchased,
        skuSummaryList: skuSummaryList,
        statusText: isPurchased 
          ? `✅ Ada Pengambilan (${gData.totalQty} Unit / Rp ${safeOmzet.toLocaleString("id-ID")})`
          : `⛔ BELUM ADA PENGAMBILAN (0 Unit) - Perlu Didorong Salesman!`
      };
    });

    return {
      campaignCode: campaign.campaignCode,
      campaignName: campaign.campaignName,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      evaluationPeriod: campaign.evaluationPeriod,
      targetBasis: campaign.targetBasis,
      storeName: store.storeName,
      storeCode: store.storeCode,
      region: store.region,
      totalQtyAll: storeAch ? storeAch.totalQty : 0,
      totalOmzetAll: storeAch ? storeAch.totalOmzet : 0,
      matchedTierLevel: storeAch ? storeAch.matchedTierLevel : 0,
      matchedTierName: storeAch ? storeAch.matchedTierName : "Belum Lolos Tier",
      gapDescription: storeAch ? storeAch.gapDescription : "-",
      totalRewardValue: storeAch ? storeAch.totalRewardValue : 0,
      fixedCashAmount: storeAch ? storeAch.fixedCashAmount : 0,
      fixedVoucherAmount: storeAch ? storeAch.fixedVoucherAmount : 0,
      goodsDescription: storeAch ? storeAch.goodsDescription : "",
      itemRateRewardsTotal: storeAch ? storeAch.itemRateRewardsTotal : 0,
      rewardItemBreakdown: storeAch ? (storeAch.rewardItemBreakdown || []) : [],
      payoutStatus: storeAch ? storeAch.payoutStatus : "NOT_QUALIFIED",
      isConsistencyAchieved: storeAch ? storeAch.isConsistencyAchieved : false,
      groupBreakdowns: groupBreakdowns
    };
  }
}

window.engine = new CalculationEngine();











