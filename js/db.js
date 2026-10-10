window.DEFAULT_SUPABASE_CONFIG = {
  url: 'https://goibonkgiljnnakjvkxo.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvaWJvbmtnaWxqbm5ha2p2a3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMDM0NzYsImV4cCI6MjEwNjc3OTQ3Nn0.d1m2PxIPnDzLOcksYqhzeDrB3NbPb-eK9V0V6GlZ0Wc',
  tableName: 'dashboard_snapshots'
};

/**
 * db.js - Database Manager & Storage Engine
 * Uses LocalStorage for zero-dependency persistence
 */

const DB_KEY = "CAMPAIGN_SALES_APP_DB_V1";

// Default Initial Seed Data
const DEFAULT_SEED_DATA = {
  users: [
    {
      id: "usr_admin",
      username: "admin",
      passwordHash: "admin123", // Simple hash/string for local demo
      fullname: "Super Administrator",
      role: "SUPER_ADMIN", // Roles: SUPER_ADMIN, MANAGER, TOKO
      storeId: null,
      isActive: true,
      createdAt: "2026-10-01T08:00:00Z"
    },
    {
      id: "usr_manager",
      username: "manager",
      passwordHash: "manager123",
      fullname: "Sales Manager",
      role: "MANAGER",
      storeId: null,
      isActive: true,
      createdAt: "2026-10-01T08:30:00Z"
    },
    {
      id: "usr_toko1",
      username: "toko_makmur",
      passwordHash: "toko123",
      fullname: "Toko Sumber Makmur",
      role: "TOKO",
      storeId: "str_001",
      isActive: true,
      createdAt: "2026-10-01T09:00:00Z"
    },
    {
      id: "usr_toko2",
      username: "toko_jaya",
      passwordHash: "toko123",
      fullname: "Toko Jaya Abadi",
      role: "TOKO",
      storeId: "str_002",
      isActive: true,
      createdAt: "2026-10-01T09:15:00Z"
    },
    {
      id: "usr_sales1",
      username: "sales_budi",
      passwordHash: "sales123",
      fullname: "Budi (Salesman Jkt & Bdg)",
      role: "SALESMAN",
      storeIds: ["str_001", "str_003"],
      isActive: true,
      createdAt: "2026-10-01T09:30:00Z"
    }
  ],

  productGroups: [
    { id: "grp_type_a", groupCode: "TYPE-A", groupName: "Product Type A (Premium Series)" },
    { id: "grp_type_b", groupCode: "TYPE-B", groupName: "Product Type B (Standard Series)" },
    { id: "grp_type_c", groupCode: "TYPE-C", groupName: "Product Type C (Economy Series)" }
  ],

  products: [
    { id: "prd_a1", productCode: "SKU-A1", productName: "TV LED 50 Inch Premium", groupId: "grp_type_a", unitPrice: 10 },
    { id: "prd_a2", productCode: "SKU-A2", productName: "Kulkas 2 Pintu Inverter", groupId: "grp_type_a", unitPrice: 8 },
    { id: "prd_b1", productCode: "SKU-B1", productName: "Mesin Cuci Automatic", groupId: "grp_type_b", unitPrice: 5 },
    { id: "prd_b2", productCode: "SKU-B2", productName: "AC 1 PK Standard", groupId: "grp_type_b", unitPrice: 6 },
    { id: "prd_c1", productCode: "SKU-C1", productName: "Kipas Angin Berdiri", groupId: "grp_type_c", unitPrice: 2 },
    { id: "prd_c2", productCode: "SKU-C2", productName: "Rice Cooker 1.8L", groupId: "grp_type_c", unitPrice: 3 }
  ],

  stores: [
    { id: "str_001", storeCode: "TKO-001", storeName: "Toko Sumber Makmur", region: "Jakarta", salesmanName: "Budi (Salesman Jkt & Bdg)", isActive: true, isCampaignEligible: true },
    { id: "str_002", storeCode: "TKO-002", storeName: "Toko Jaya Abadi", region: "Surabaya", salesmanName: "Doni", isActive: true, isCampaignEligible: true },
    { id: "str_003", storeCode: "TKO-003", storeName: "Toko Sinar Sentosa", region: "Bandung", salesmanName: "Budi (Salesman Jkt & Bdg)", isActive: true, isCampaignEligible: true },
    { id: "str_004", storeCode: "TKO-004", storeName: "Toko Subur Gemilang", region: "Medan", salesmanName: "Eko", isActive: true, isCampaignEligible: false } // Default Blacklisted/Excluded Store
  ],

  campaigns: [
    {
      id: "cmp_q4_2026",
      campaignCode: "CMP-2026-Q4",
      campaignName: "Program Promo Insentif Toko Q4 2026",
      description: "Program pencapaian target penjualan 3 bulan (Okt - Des 2026) dengan reward bertingkat per type item.",
      startDate: "2026-09-01",
      endDate: "2026-12-31",
      targetBasis: "QTY", // QTY, OMZET, BOTH
      targetScope: "ALL_STORES", // ALL_STORES, SELECTED_STORES
      eligibleGroupIds: ["grp_type_a", "grp_type_b"], // Products counted
      eligibleStoreIds: [], // Empty means all stores if ALL_STORES
      status: "ACTIVE",
      tiers: [
        {
          id: "tier_1",
          level: 1,
          tierName: "Tier 1 (Target min. 30 Unit)",
          minQty: 30,
          minOmzet: 0,
          fixedRewardType: "NONE", // NONE, CASH, VOUCHER, GOODS
          fixedCashAmount: 0,
          fixedVoucherAmount: 0,
          goodsDescription: "",
          rates: [
            { groupId: "grp_type_a", calculationType: "PER_UNIT_AMOUNT", rateValue: 10000 },
            { groupId: "grp_type_b", calculationType: "PER_UNIT_AMOUNT", rateValue: 5000 }
          ]
        },
        {
          id: "tier_2",
          level: 2,
          tierName: "Tier 2 (Target min. 50 Unit + Bonus)",
          minQty: 50,
          minOmzet: 0,
          fixedRewardType: "VOUCHER",
          fixedCashAmount: 0,
          fixedVoucherAmount: 1000000,
          goodsDescription: "1 Unit Kipas Angin Premium",
          rates: [
            { groupId: "grp_type_a", calculationType: "PER_UNIT_AMOUNT", rateValue: 15000 },
            { groupId: "grp_type_b", calculationType: "PER_UNIT_AMOUNT", rateValue: 7500 }
          ]
        },
        {
          id: "tier_3",
          level: 3,
          tierName: "Tier 3 (Target min. 75 Unit + Mega Reward)",
          minQty: 75,
          minOmzet: 0,
          fixedRewardType: "GOODS",
          fixedCashAmount: 2000000,
          fixedVoucherAmount: 1500000,
          goodsDescription: "1 Unit Smartphone 5G + 1 Unit Smart TV 43 Inch",
          rates: [
            { groupId: "grp_type_a", calculationType: "PER_UNIT_AMOUNT", rateValue: 17500 },
            { groupId: "grp_type_b", calculationType: "PER_UNIT_AMOUNT", rateValue: 10000 }
          ]
        }
      ]
    }
  ],

  salesTransactions: [
    {
      id: "trx_1",
      invoiceNo: "INV/2026/10/001",
      transactionDate: "2026-10-05",
      storeId: "str_001",
      productId: "prd_a1",
      qty: 20,
      price: 10,
      totalOmzet: 200,
      batchId: "batch_initial"
    },
    {
      id: "trx_2",
      invoiceNo: "INV/2026/10/002",
      transactionDate: "2026-10-10",
      storeId: "str_001",
      productId: "prd_b1",
      qty: 35,
      price: 5,
      totalOmzet: 175,
      batchId: "batch_initial"
    },
    {
      id: "trx_3",
      invoiceNo: "INV/2026/10/003",
      transactionDate: "2026-10-12",
      storeId: "str_002",
      productId: "prd_a2",
      qty: 15,
      price: 8,
      totalOmzet: 120,
      batchId: "batch_initial"
    },
    {
      id: "trx_4",
      invoiceNo: "INV/2026/10/004",
      transactionDate: "2026-10-15",
      storeId: "str_002",
      productId: "prd_b2",
      qty: 20,
      price: 6,
      totalOmzet: 120,
      batchId: "batch_initial"
    }
  ],

  achievements: [] // Auto-generated by calculation engine
};

class DatabaseManager {
  constructor() {
    this.dbName = "CampaignSalesIDB_V1";
    this.storeName = "salesTransactions";
    this.idb = null;
    this.cachedSales = null;
    this.memoryDb = null;
    this.isIdbLoaded = false;
    this.cachedSalesMonths = null;

    this.initIDB();
    this.initDatabase();
  }

  initIDB() {
    if (typeof indexedDB === "undefined") { this.isIdbLoaded = true; return; }
    try {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => {
        this.idb = e.target.result;
        this.loadSalesFromIDB();
      };
      request.onerror = (e) => {
        console.warn("IndexedDB init warning:", e);
        this.isIdbLoaded = true;
      };
    } catch (err) {
      console.warn("IndexedDB not supported or blocked:", err);
      this.isIdbLoaded = true;
    }
  }

  loadSalesFromIDB() {
    if (!this.idb) { this.isIdbLoaded = true; return; }
    try {
      const tx = this.idb.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onerror = () => { this.isIdbLoaded = true; };
      req.onsuccess = () => {
        this.isIdbLoaded = true;
        if (req.result && req.result.length > 0) {
          let sales = [];
          let loadedSnaps = null;
          let loadedAchs = null;
          
          req.result.forEach(item => {
             if (item.id === '__SYSTEM_SNAPSHOTS__') loadedSnaps = item.data;
             else if (item.id === '__SYSTEM_ACHIEVEMENTS__') loadedAchs = item.data;
             else sales.push(item);
          });
          
          if (sales.length > 0) this.cachedSales = sales;
          
          if (this.memoryDb !== null) {
            if (sales.length > 0) this.memoryDb.salesTransactions = sales;
            if (loadedSnaps) this.memoryDb.monthlySnapshots = loadedSnaps;
            if (loadedAchs) this.memoryDb.achievements = loadedAchs;
          }
          
          console.log('IndexedDB: Loaded ' + sales.length + ' sales records and snapshots into RAM cache');
          if (typeof renderDashboard === 'function') {
            try { renderDashboard(); } catch(e){}
          }
          if (typeof renderAchievements === 'function') {
            try { renderAchievements(); } catch(e){}
          }
        }
      };
    } catch (err) {
      this.isIdbLoaded = true;
      console.warn('Failed loading from IDB:', err);
    }
  }
  saveHeavyDataToIDB(dbData) {
    if (!this.idb || !dbData) return;
    try {
      const tx = this.idb.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      
      if (Array.isArray(dbData.salesTransactions)) {
        dbData.salesTransactions.forEach(item => {
          if (!item.id) item.id = this.generateUniqueId('trx');
          store.put(item);
        });
      }
      
      store.put({ id: '__SYSTEM_SNAPSHOTS__', data: dbData.monthlySnapshots || {} });
      store.put({ id: '__SYSTEM_ACHIEVEMENTS__', data: dbData.achievements || [] });
      
    } catch (err) {
      console.warn('Failed saving to IDB:', err);
    }
  }

  initDatabase() {
    const existing = localStorage.getItem(DB_KEY);
    if (!existing) {
      this.saveDatabase(DEFAULT_SEED_DATA);
    } else {
      try {
        const parsed = JSON.parse(existing);
        if (parsed.salesTransactions) {
          this.cachedSales = parsed.salesTransactions;
        } else {
          this.cachedSales = [];
        }
      } catch (e) {
        console.error("Failed to parse DB for initDatabase", e);
      }
    }
  }

  generateUniqueId(prefix = "id") {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
  }

  ensureUniqueIds(dbObj) {
    if (!dbObj) return dbObj;
    let modified = false;

    if (Array.isArray(dbObj.stores)) {
      const seenCodes = new Set();
      const uniqueStores = [];
      dbObj.stores.forEach(s => {
        if (!s || !s.storeCode) {
           uniqueStores.push(s);
           return;
        }
        const cleanCode = String(s.storeCode).toLowerCase().trim();
        if (!seenCodes.has(cleanCode)) {
           seenCodes.add(cleanCode);
           uniqueStores.push(s);
        } else {
           modified = true;
        }
      });
      dbObj.stores = uniqueStores;
    }

    // 1. Repair Stores with duplicate IDs
    if (Array.isArray(dbObj.stores)) {
      const seenIds = new Set();
      dbObj.stores.forEach((store, idx) => {
        if (!store.id || seenIds.has(store.id)) {
          store.id = "str_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).substring(2, 7);
          modified = true;
        }
        seenIds.add(store.id);
      });
    }

    // 2. Repair Products with duplicate IDs & normalize legacy prices to points
    if (Array.isArray(dbObj.products)) {
      const seenIds = new Set();
      dbObj.products.forEach((prod, idx) => {
        if (!prod.id || seenIds.has(prod.id)) {
          prod.id = "prd_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).substring(2, 7);
          modified = true;
        }
        if (prod.unitPrice && prod.unitPrice >= 10000) {
          prod.unitPrice = Math.max(1, Math.round(prod.unitPrice / 500000)) || 10;
          modified = true;
        }
        seenIds.add(prod.id);
      });
    }

    // 3. Repair Product Groups with duplicate IDs
    if (Array.isArray(dbObj.productGroups)) {
      const seenIds = new Set();
      dbObj.productGroups.forEach((grp, idx) => {
        if (!grp.id || seenIds.has(grp.id)) {
          grp.id = "grp_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).substring(2, 7);
          modified = true;
        }
        seenIds.add(grp.id);
      });
    }

    // 4. Repair Users with duplicate IDs
    if (Array.isArray(dbObj.users)) {
      const seenIds = new Set();
      dbObj.users.forEach((usr, idx) => {
        if (!usr.id || seenIds.has(usr.id)) {
          usr.id = "usr_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).substring(2, 7);
          modified = true;
        }
        seenIds.add(usr.id);
      });
    }

    if (modified) {
      this.saveDatabase(dbObj);
    }
    return dbObj;
  }

  getDatabase() {
    if (this.memoryDb !== null) {
      if (this.cachedSales !== null && Array.isArray(this.cachedSales) && this.cachedSales.length > 0) {
        this.memoryDb.salesTransactions = this.cachedSales;
      }
      return this.memoryDb;
    }
    try {
      const data = localStorage.getItem(DB_KEY);
      const dbObj = data ? JSON.parse(data) : DEFAULT_SEED_DATA;
      if (this.cachedSales !== null && Array.isArray(this.cachedSales) && this.cachedSales.length > 0) {
        dbObj.salesTransactions = this.cachedSales;
      }
      this.memoryDb = this.ensureUniqueIds(dbObj);
      return this.memoryDb;
    } catch (e) {
      console.error("Error reading DB from LocalStorage", e);
      return DEFAULT_SEED_DATA;
    }
  }

  saveDatabase(data) {
    this.memoryDb = data;
    this.cachedSalesMonths = null;

    if (Array.isArray(data.salesTransactions) && data.salesTransactions.length > 0) {
      this.cachedSales = data.salesTransactions;
    } else if (this.cachedSales !== null && Array.isArray(this.cachedSales) && this.cachedSales.length > 0) {
      this.memoryDb.salesTransactions = this.cachedSales;
    }

    this.saveHeavyDataToIDB(this.memoryDb);

    const storePayload = { 
      ...data, 
      salesTransactions: [],
      monthlySnapshots: {},
      achievements: []
    };
    const payload = JSON.stringify(storePayload);

    try {
      localStorage.setItem(DB_KEY, payload);
    } catch (err) {
      console.warn('LocalStorage QuotaExceededError despite stripping.', err);
    }
  }

  getAvailableSalesMonths() {
    if (this.cachedSalesMonths !== null) {
      return this.cachedSalesMonths;
    }
    const monthSet = new Set();
    const sales = this.getSales();
    sales.forEach(s => {
      if (s.transactionDate) {
        const m = String(s.transactionDate).trim().substring(0, 7);
        if (m && /^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
      }
    });
    this.cachedSalesMonths = Array.from(monthSet);
    return this.cachedSalesMonths;
  }

  resetToSeed() {
    this.cachedSales = null;
    if (this.idb) {
      try {
        const tx = this.idb.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).clear();
      } catch (e) {}
    }
    this.saveDatabase(DEFAULT_SEED_DATA);
    return true;
  }

  // --- Users Operations ---
  getUsers() {
    const db = this.getDatabase();
    let users = db.users || [];
    
    // Auto-repair check: Ensure default admin account exists and is active
    const hasAdmin = users.some(u => u && u.username && String(u.username).trim().toLowerCase() === "admin" && u.isActive !== false);
    if (!hasAdmin) {
      console.warn("Auto-repairing users table: re-seeding default admin account...");
      if (!Array.isArray(db.users)) db.users = [];
      
      const adminSeed = DEFAULT_SEED_DATA.users.find(u => u.username === "admin");
      if (adminSeed) {
        const idx = db.users.findIndex(u => u && u.username && String(u.username).trim().toLowerCase() === "admin");
        if (idx !== -1) {
          db.users[idx] = { ...adminSeed, ...db.users[idx], isActive: true };
        } else {
          db.users.push({ ...adminSeed });
        }
      }
      
      this.saveDatabase(db);
      users = db.users;
    }
    
    return users;
  }

  getUserByUsername(username) {
    if (!username) return null;
    const cleanName = String(username).trim().toLowerCase();
    return this.getUsers().find(u => u && u.username && String(u.username).trim().toLowerCase() === cleanName);
  }

  addUser(userData) {
    const db = this.getDatabase();
    const newUser = {
      id: this.generateUniqueId("usr"),
      username: userData.username,
      passwordHash: userData.password,
      fullname: userData.fullname,
      role: userData.role || "TOKO",
      storeId: userData.storeId || null,
      isActive: true,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: userData.updatedAt || new Date().toISOString()
    };
    db.users.push(newUser);
    this.saveDatabase(db);
    return newUser;
  }

  updateUser(id, updateData) {
    const db = this.getDatabase();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      db.users[idx] = { 
        ...db.users[idx], 
        ...updateData,
        updatedAt: updateData.updatedAt || new Date().toISOString() 
      };
      this.saveDatabase(db);
      return true;
    }
    return false;
  }

  deleteUser(id) {
    const db = this.getDatabase();
    if(!db.deletedMasterIds) db.deletedMasterIds = [];
    if(!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
    db.users = db.users.filter(u => u.id !== id);
    this.saveDatabase(db);
    return true;
  }

  // --- Master Data Operations ---
  getStores() {
    const arr = this.getDatabase().stores || [];
    return arr.sort((a,b) => String(a.storeName||"").localeCompare(String(b.storeName||""), "id", { sensitivity: "base" }));
  }

  addStore(storeData) {
    const db = this.getDatabase();
    if (storeData.id) {
      const idx = db.stores.findIndex(s => s.id === storeData.id);
      if (idx !== -1) {
        db.stores[idx] = { ...db.stores[idx], ...storeData };
        this.saveDatabase(db);
        return db.stores[idx];
      }
    }
    if (storeData.storeCode) {
      const idxByCode = db.stores.findIndex(s => s.storeCode && s.storeCode.toLowerCase().trim() === String(storeData.storeCode).toLowerCase().trim());
      if (idxByCode !== -1) {
        db.stores[idxByCode] = { ...db.stores[idxByCode], ...storeData };
        this.saveDatabase(db);
        return db.stores[idxByCode];
      }
    }
    const newStore = {
      id: this.generateUniqueId("str"),
      storeCode: storeData.storeCode,
      storeName: storeData.storeName,
      region: storeData.region || "Utama",
      isActive: true,
      isCampaignEligible: storeData.isCampaignEligible !== false
    };
    db.stores.push(newStore);
    this.saveDatabase(db);
    return newStore;
  }

  deleteStore(id) {
    const db = this.getDatabase();
    if(!db.deletedMasterIds) db.deletedMasterIds = [];
    if(!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
    db.stores = db.stores.filter(s => s.id !== id);
    this.saveDatabase(db);
    return true;
  }

  getProductGroups() {
    const arr = this.getDatabase().productGroups || [];
    return arr.sort((a,b) => String(a.groupCode||"").localeCompare(String(b.groupCode||""), "id", { sensitivity: "base" }));
  }

  addProductGroup(groupData) {
    const db = this.getDatabase();
    if (groupData.id) {
      const idx = db.productGroups.findIndex(g => g.id === groupData.id);
      if (idx !== -1) {
        db.productGroups[idx] = { ...db.productGroups[idx], ...groupData };
        this.saveDatabase(db);
        return db.productGroups[idx];
      }
    }
    if (groupData.groupCode) {
      const idxByCode = db.productGroups.findIndex(g => g.groupCode && g.groupCode.toLowerCase().trim() === String(groupData.groupCode).toLowerCase().trim());
      if (idxByCode !== -1) {
        db.productGroups[idxByCode] = { ...db.productGroups[idxByCode], ...groupData };
        this.saveDatabase(db);
        return db.productGroups[idxByCode];
      }
    }
    const newGroup = {
      id: this.generateUniqueId("grp"),
      groupCode: groupData.groupCode,
      groupName: groupData.groupName
    };
    db.productGroups.push(newGroup);
    this.saveDatabase(db);
    return newGroup;
  }

  deleteProductGroup(id) {
    const db = this.getDatabase();
    if(!db.deletedMasterIds) db.deletedMasterIds = [];
    if(!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
    db.productGroups = db.productGroups.filter(g => g.id !== id);
    this.saveDatabase(db);
    return true;
  }

  getProducts() {
    const arr = this.getDatabase().products || [];
    return arr.sort((a,b) => String(a.productName||"").localeCompare(String(b.productName||""), "id", { sensitivity: "base" }));
  }

  addProduct(productData) {
    const db = this.getDatabase();
    if (productData.id) {
      const idx = db.products.findIndex(p => p.id === productData.id);
      if (idx !== -1) {
        db.products[idx] = { ...db.products[idx], ...productData, unitPrice: parseFloat(productData.unitPrice || 0) };
        this.saveDatabase(db);
        return db.products[idx];
      }
    }
    if (productData.productCode) {
      const idxByCode = db.products.findIndex(p => p.productCode && p.productCode.toLowerCase().trim() === String(productData.productCode).toLowerCase().trim());
      if (idxByCode !== -1) {
        db.products[idxByCode] = { ...db.products[idxByCode], ...productData, unitPrice: parseFloat(productData.unitPrice || 0) };
        this.saveDatabase(db);
        return db.products[idxByCode];
      }
    }
    const newProd = {
      id: this.generateUniqueId("prd"),
      productCode: productData.productCode,
      productName: productData.productName,
      groupId: productData.groupId,
      unitPrice: parseFloat(productData.unitPrice || 0)
    };
    db.products.push(newProd);
    this.saveDatabase(db);
    return newProd;
  }

  deleteProduct(id) {
    const db = this.getDatabase();
    if(!db.deletedMasterIds) db.deletedMasterIds = [];
    if(!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
    db.products = db.products.filter(p => p.id !== id);
    this.saveDatabase(db);
    return true;
  }

  // --- Campaigns Operations ---
  getCampaigns() {
    const arr = this.getDatabase().campaigns || [];
    return arr.sort((a,b) => String(a.campaignName||"").localeCompare(String(b.campaignName||""), "id", { sensitivity: "base" }));
  }

  getCampaignById(id) {
    if (!id) return null;
    const strId = String(id).trim();
    return this.getCampaigns().find(c => String(c.id).trim() === strId || (c.campaignCode && String(c.campaignCode).trim().toLowerCase() === strId.toLowerCase()));
  }

  saveCampaign(campaignData) {
    const db = this.getDatabase();
    if (campaignData.id) {
      const idx = db.campaigns.findIndex(c => c.id === campaignData.id);
      if (idx !== -1) {
        db.campaigns[idx] = campaignData;
      } else {
        db.campaigns.push(campaignData);
      }
    } else {
      campaignData.id = this.generateUniqueId("cmp");
      db.campaigns.push(campaignData);
    }
    this.saveDatabase(db);
    return campaignData;
  }

  deleteCampaign(id) {
    const db = this.getDatabase();
    if(!db.deletedMasterIds) db.deletedMasterIds = [];
    if(!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
    db.campaigns = (db.campaigns || []).filter(c => c.id !== id);
    db.achievements = (db.achievements || []).filter(a => a.campaignId !== id);
    this.saveDatabase(db);
    return true;
  }

  // --- Sales Operations ---
  getSales() {
    if (this.cachedSales !== null && Array.isArray(this.cachedSales) && this.cachedSales.length > 0) {
      return this.cachedSales;
    }
    const db = this.getDatabase();
    const sales = (db && Array.isArray(db.salesTransactions)) ? db.salesTransactions : [];
    if (sales.length > 0) {
      this.cachedSales = sales;
    }
    return sales;
  }

  getSalesTransactions() {
    return this.getSales();
  }

  addSalesBatch(salesArray, importMode = "OVERWRITE_ALL", targetMonth = "") {
    const batchId = "batch_" + Date.now();
    const formatted = salesArray.map((s, idx) => ({
      id: "trx_" + Date.now() + "_" + idx,
      invoiceNo: s.invoiceNo || "INV-" + (idx + 1),
      transactionDate: s.transactionDate || new Date().toISOString().split("T")[0],
      storeId: s.storeId || null,
      storeCode: s.storeCode || "",
      productId: s.productId || null,
      productCode: s.productCode || "",
      qty: parseFloat(s.qty || 0),
      price: parseFloat(s.price || 0),
      totalOmzet: parseFloat(s.totalOmzet || (parseFloat(s.qty || 0) * parseFloat(s.price || 0))),
      batchId: batchId
    }));

    const currentSales = this.getSales();
    // Filter out initial seed dummy data (trx_1..trx_4 or batch_initial)
    const cleanCurrentSales = currentSales.filter(s => s.batchId !== "batch_initial" && !["trx_1", "trx_2", "trx_3", "trx_4"].includes(s.id));
    
    let updatedSales = [];

    if (importMode === "OVERWRITE_ALL" || importMode === true) {
      updatedSales = formatted;
    } else if (importMode === "REPLACE_MONTH" && targetMonth) {
      const cleanTargetMonth = String(targetMonth).trim();
      const remainingSales = cleanCurrentSales.filter(s => {
        if (!s.transactionDate) return true;
        const normDate = (typeof normalizeDateForEngine === "function") 
          ? normalizeDateForEngine(s.transactionDate) 
          : s.transactionDate;
        return !normDate.startsWith(cleanTargetMonth);
      });
      updatedSales = remainingSales.concat(formatted);
    } else {
      // APPEND / MERGE
      updatedSales = cleanCurrentSales.concat(formatted);
    }

    const db = this.getDatabase();
    db.salesTransactions = updatedSales;
    this.saveDatabase(db);
    return formatted.length;
  }

  clearSales() {
    this.cachedSales = [];
    if (this.idb) {
      try {
        const tx = this.idb.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).clear();
      } catch (e) {}
    }
    const db = this.getDatabase();
    db.salesTransactions = [];
    db.achievements = [];
    this.saveDatabase(db);
  }

  // --- Achievements & Monthly Snapshots Operations ---
  getAchievements() {
      const db = this.getDatabase();
      let allAchs = [];
      if (db.monthlySnapshots) {
        Object.values(db.monthlySnapshots).forEach(snapArr => {
          if (Array.isArray(snapArr)) {
            allAchs = allAchs.concat(snapArr);
          }
        });
      }
      return allAchs.length > 0 ? allAchs : (db.achievements || []);
    }

  saveAchievements(achievements) {
    const db = this.getDatabase();
    db.achievements = achievements;
    this.saveDatabase(db);
  }

  getMonthlySnapshots() {
    return this.getDatabase().monthlySnapshots || {};
  }

  getSnapshotForPeriod(targetMonth, calcMode = "CUMULATIVE") {
    const snapshots = this.getMonthlySnapshots();
    const key = `${targetMonth}_${calcMode}`;
    if (snapshots[key] && Array.isArray(snapshots[key]) && snapshots[key].length > 0) {
      return snapshots[key];
    }
    // Fallback: return default db.achievements if targetMonth matches or no snapshot exists yet
    const achs = this.getAchievements();
    if (achs.length > 0 && (!targetMonth || targetMonth === "ALL")) {
      return achs;
    }
    return achs.filter(a => !a.snapshotMonth || a.snapshotMonth === targetMonth);
  }

  saveSnapshotForPeriod(targetMonth, calcMode, achievementResults) {
    const db = this.getDatabase();
    if (!db.monthlySnapshots) {
      db.monthlySnapshots = {};
    }
    const key = `${targetMonth}_${calcMode}`;
    const tagged = achievementResults.map(a => ({
      ...a,
      snapshotMonth: targetMonth,
      snapshotCalcMode: calcMode
    }));
    db.monthlySnapshots[key] = tagged.map(item => { item._local_ts = Date.now(); return item; });
    db.achievements = tagged;
    this.saveDatabase(db);
  }



  getSupabaseConfig() {
    const db = this.getDatabase();
    if (db.supabaseConfig && db.supabaseConfig.url) {
      window.DEFAULT_SUPABASE_CONFIG = db.supabaseConfig;
      return db.supabaseConfig;
    }
    const saved = localStorage.getItem("CAMPAIGN_SUPABASE_CONFIG");
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed && parsed.url) {
          window.DEFAULT_SUPABASE_CONFIG = parsed;
          return parsed;
        }
      } catch(e){}
    }
    if (window.DEFAULT_SUPABASE_CONFIG && window.DEFAULT_SUPABASE_CONFIG.url) {
      return window.DEFAULT_SUPABASE_CONFIG;
    }
    return null;
  }

  saveSupabaseConfig(config) {
    if (!config) return;
    window.DEFAULT_SUPABASE_CONFIG = config;
    const db = this.getDatabase();
    db.supabaseConfig = config;
    this.saveDatabase(db);
    try {
      localStorage.setItem("CAMPAIGN_SUPABASE_CONFIG", JSON.stringify(config));
    } catch(e){}
  }

  saveCloudSnapshotsToLocal(cloudRows) {
    if (!Array.isArray(cloudRows) || cloudRows.length === 0) return;
    const db = this.getDatabase();
    if (!db.monthlySnapshots) db.monthlySnapshots = {};
    if (!db.stores) db.stores = [];
    if (!db.campaigns) db.campaigns = [];
    if (!db.productGroups) db.productGroups = [];
    if (!db.users) db.users = [];
    if (!db.products) db.products = [];
    if (!db.deletedMasterIds) db.deletedMasterIds = [];

    const userConfigRows = cloudRows.filter(r => r && r.store_code === "_USERS_CONFIG");
    const normalRows = cloudRows.filter(r => !r || r.store_code !== "_USERS_CONFIG");
    
    if (userConfigRows.length > 0) {
      userConfigRows.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
      cloudRows = [].concat(normalRows, userConfigRows);
    }

    cloudRows.forEach(r => {
      if (!r) return;
      const month = r.snapshot_month || "ALL";
      const mode = r.calc_mode || "CUMULATIVE";
      const key = month + "_" + mode;
      if (!db.monthlySnapshots[key]) db.monthlySnapshots[key] = [];

      let groupBd = [];
      let campaignInfo = null;
      let usersList = [];
      let productsList = [];
      let storesList = [];
      let groupsList = [];
      let campaignsList = [];
      let deletedMasterIdsList = [];
      let totalPoin = 0;
      let rewardItemBreakdown = [];
      let itemRateRewardsTotal = 0;
      let fixedVoucherAmount = 0;
      let fixedCashAmount = 0;
      let isConsistencyAchieved = false;

      if (r.sku_breakdown) {
        if (typeof r.sku_breakdown === "string") {
          try {
            const parsed = JSON.parse(r.sku_breakdown);
            groupBd = parsed.groupBreakdowns || (Array.isArray(parsed) ? parsed : []);
            campaignInfo = parsed.campaignInfo || null;
            usersList = parsed.users || (parsed.campaignInfo ? parsed.campaignInfo.users : []);
            productsList = parsed.products || (parsed.campaignInfo ? parsed.campaignInfo.products : []);
            storesList = parsed.stores || [];
            groupsList = parsed.productGroups || [];
            campaignsList = parsed.campaigns || [];
            deletedMasterIdsList = parsed.deletedMasterIds || [];
            totalPoin = parsed.totalPoin || 0;
            rewardItemBreakdown = parsed.rewardItemBreakdown || [];
            itemRateRewardsTotal = parsed.itemRateRewardsTotal || 0;
            fixedVoucherAmount = parsed.fixedVoucherAmount || 0;
            fixedCashAmount = parsed.fixedCashAmount || 0;
            isConsistencyAchieved = parsed.isConsistencyAchieved || false;
          } catch(e){}
        } else if (typeof r.sku_breakdown === "object") {
          groupBd = r.sku_breakdown.groupBreakdowns || (Array.isArray(r.sku_breakdown) ? r.sku_breakdown : []);
          campaignInfo = r.sku_breakdown.campaignInfo || null;
          usersList = r.sku_breakdown.users || (r.sku_breakdown.campaignInfo ? r.sku_breakdown.campaignInfo.users : []);
          productsList = r.sku_breakdown.products || (r.sku_breakdown.campaignInfo ? r.sku_breakdown.campaignInfo.products : []);
          storesList = r.sku_breakdown.stores || [];
          groupsList = r.sku_breakdown.productGroups || [];
          campaignsList = r.sku_breakdown.campaigns || [];
          deletedMasterIdsList = r.sku_breakdown.deletedMasterIds || [];
          totalPoin = r.sku_breakdown.totalPoin || 0;
          rewardItemBreakdown = r.sku_breakdown.rewardItemBreakdown || [];
          itemRateRewardsTotal = r.sku_breakdown.itemRateRewardsTotal || 0;
          fixedVoucherAmount = r.sku_breakdown.fixedVoucherAmount || 0;
          fixedCashAmount = r.sku_breakdown.fixedCashAmount || 0;
          isConsistencyAchieved = r.sku_breakdown.isConsistencyAchieved || false;
        }
      }

      if (r.store_code === "_USERS_CONFIG") {
        if (Array.isArray(deletedMasterIdsList)) {
          deletedMasterIdsList.forEach(id => {
            if (!db.deletedMasterIds.includes(id)) db.deletedMasterIds.push(id);
          });
        }
        
        // Auto-cleanup local entities if they are marked as deleted in cloud or locally
        db.users = db.users.filter(u => !db.deletedMasterIds.includes(u.id));
        db.stores = db.stores.filter(s => !db.deletedMasterIds.includes(s.id));
        db.products = db.products.filter(p => !db.deletedMasterIds.includes(p.id));
        db.campaigns = db.campaigns.filter(c => !db.deletedMasterIds.includes(c.id));
        db.productGroups = db.productGroups.filter(g => !db.deletedMasterIds.includes(g.id));
        if (Array.isArray(usersList)) {
          usersList.forEach(u => {
            if (u.id && db.deletedMasterIds.includes(u.id)) return;
            const idx = db.users.findIndex(x => String(x.username).toLowerCase().trim() === String(u.username).toLowerCase().trim());
            if (idx >= 0) db.users[idx] = { ...db.users[idx], ...u };
            else db.users.push(u);
          });
        }
        if (Array.isArray(productsList)) {
          productsList.forEach(p => {
            if (p.id && db.deletedMasterIds.includes(p.id)) return;
            const idx = db.products.findIndex(x => x.productCode === p.productCode);
            if (idx >= 0) db.products[idx] = { ...db.products[idx], ...p };
            else db.products.push(p);
          });
        }
        if (Array.isArray(storesList)) {
          storesList.forEach(s => {
            if (s.id && db.deletedMasterIds.includes(s.id)) return;
            const idx = db.stores.findIndex(x => x.id === s.id);
            if (idx >= 0) db.stores[idx] = { ...db.stores[idx], ...s };
            else db.stores.push(s);
          });
        }
        if (Array.isArray(campaignsList)) {
          campaignsList.forEach(c => {
            if (c.id && db.deletedMasterIds.includes(c.id)) return;
            const idx = db.campaigns.findIndex(x => x.id === c.id);
            if (idx >= 0) db.campaigns[idx] = { ...db.campaigns[idx], ...c };
            else db.campaigns.push(c);
          });
        }
        if (Array.isArray(groupsList)) {
          groupsList.forEach(g => {
            if (g.id && db.deletedMasterIds.includes(g.id)) return;
            const idx = db.productGroups.findIndex(x => x.id === g.id);
            if (idx >= 0) db.productGroups[idx] = { ...db.productGroups[idx], ...g };
            else db.productGroups.push(g);
          });
        }
      } else {
        let computedStoreId = r.store_code;
        if (r.store_code) {
          const cleanCode = String(r.store_code).trim().toLowerCase();
          computedStoreId = "str_" + cleanCode.replace(/[^a-z0-9]/g, "");
          if (!db.deletedMasterIds.includes(computedStoreId)) {
            const existingStore = db.stores.find(s => s.storeCode && String(s.storeCode).trim().toLowerCase() === cleanCode);
            if (!existingStore) {
              db.stores.push({
                id: computedStoreId,
                storeCode: r.store_code,
                storeName: r.store_name || r.store_code,
                region: r.region || "Utama",
                salesmanName: r.salesman_name || "",
                isActive: true,
                isCampaignEligible: true
              });
            }
          }
        }

        let computedCmpId = r.campaign_code;
        if (r.campaign_code && r.campaign_code !== "_SYSTEM_") {
          const cleanCmpCode = String(r.campaign_code).trim().toLowerCase();
          computedCmpId = "cmp_" + cleanCmpCode.replace(/[^a-z0-9]/g, "");
          if (!db.deletedMasterIds.includes(computedCmpId)) {
            const existingCmp = db.campaigns.find(c => c.campaignCode && String(c.campaignCode).trim().toLowerCase() === cleanCmpCode);
            if (!existingCmp) {
              db.campaigns.push({
                id: computedCmpId,
                campaignCode: r.campaign_code,
                campaignName: r.campaign_name || r.campaign_code,
                targetBasis: r.target_basis || "QTY",
                targetScope: "ALL_STORES",
                status: "ACTIVE",
                startDate: campaignInfo ? campaignInfo.startDate : "2026-01-01",
                endDate: campaignInfo ? campaignInfo.endDate : "2026-12-31",
                evaluationPeriod: campaignInfo ? campaignInfo.evaluationPeriod : "MONTHLY",
                tiers: campaignInfo ? campaignInfo.tiers : []
              });
            }
          }
        }

        const achObj = {
            id: r.id,
            calculatedAt: r.updated_at,
          campaignId: computedCmpId,
          campaignCode: r.campaign_code,
          campaignName: r.campaign_name,
          storeId: computedStoreId,
          storeCode: r.store_code,
          storeName: r.store_name,
          region: r.region,
          salesmanName: r.salesman_name,
          targetBasis: r.target_basis,
          matchedTierLevel: r.matched_tier_level,
          matchedTierName: r.matched_tier_name,
          progressPercentage: r.progress_percentage,
          gapDescription: r.gap_description,
          totalQty: r.total_qty,
          totalOmzet: r.total_omzet,
          totalPoin: totalPoin,
          rewardItemBreakdown: rewardItemBreakdown,
          itemRateRewardsTotal: itemRateRewardsTotal,
          fixedVoucherAmount: fixedVoucherAmount,
          fixedCashAmount: fixedCashAmount,
          isConsistencyAchieved: isConsistencyAchieved,
          totalRewardValue: r.total_reward_value,
          goodsDescription: r.goods_description,
          groupBreakdowns: groupBd,
          campaignTiers: campaignInfo ? campaignInfo.tiers : [],
          payoutStatus: "PENDING",
          snapshotMonth: month,
          snapshotCalcMode: mode,
          _cloud_ts: r.updated_at ? new Date(r.updated_at).getTime() : 0
        };

        const existingIdx = db.monthlySnapshots[key].findIndex(a => a.id === r.id || (a.campaignCode === r.campaign_code && a.storeCode === r.store_code));
        if (existingIdx >= 0) {
          const localAch = db.monthlySnapshots[key][existingIdx];
          const localTs = localAch._local_ts || 0;
          const cloudTs = achObj._cloud_ts || 0;
          if (cloudTs >= localTs) {
            db.monthlySnapshots[key][existingIdx] = achObj;
          }
        } else {
          db.monthlySnapshots[key].push(achObj);
        }
      }
    });

    // Final sweep to remove any restored items that are in deletedMasterIds
    if (db.deletedMasterIds && db.deletedMasterIds.length > 0) {
      db.users = db.users.filter(u => !db.deletedMasterIds.includes(u.id));
      db.products = db.products.filter(p => !db.deletedMasterIds.includes(p.id));
      db.stores = db.stores.filter(s => !db.deletedMasterIds.includes(s.id));
      db.campaigns = db.campaigns.filter(c => !db.deletedMasterIds.includes(c.id));
      db.productGroups = db.productGroups.filter(g => !db.deletedMasterIds.includes(g.id));
    }

    const hasAdmin = db.users.some(u => u && u.username && String(u.username).trim().toLowerCase() === "admin");
    if (!hasAdmin) {
      db.users.push({
        id: "usr_admin",
        username: "admin",
        passwordHash: "admin123",
        fullname: "Super Administrator",
        role: "SUPER_ADMIN",
        isActive: true
      });
    }

    this.saveDatabase(db);
  }


    updatePayoutStatus(achievementId, newStatus) {
    const db = this.getDatabase();
    let updated = false;

    if (Array.isArray(db.achievements)) {
      const idx = db.achievements.findIndex(a => a.id === achievementId);
      if (idx !== -1) {
        db.achievements[idx].payoutStatus = newStatus;
        updated = true;
      }
    }

    if (db.monthlySnapshots && typeof db.monthlySnapshots === "object") {
      Object.keys(db.monthlySnapshots).forEach(key => {
        const arr = db.monthlySnapshots[key];
        if (Array.isArray(arr)) {
          const idx = arr.findIndex(a => a.id === achievementId);
          if (idx !== -1) {
            arr[idx].payoutStatus = newStatus;
            updated = true;
          }
        }
      });
    }

    if (updated) {
      this.saveDatabase(db);
    }
    return updated;
  }
}

// Global instance
window.db = new DatabaseManager();













