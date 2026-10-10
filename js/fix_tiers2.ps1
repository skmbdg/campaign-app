$txt = Get-Content "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js" -Raw

$oldBlock2 = '(?s)const unitNote = isPeriodBonus \? "Poin" : "Poin/bulan";.*?<span style="font-size: 0\.85rem; color: #475569;">Target Min Total: \$\{c\.targetBasis === .OMZET. \? `Omzet &ge; Rp \$\{t\.minOmzet\.toLocaleString\("id-ID"\)\}` : `Qty &ge; \$\{t\.minQty\} Poin`\}<\/span><br>.*?<i class="fa-solid fa-circle-dot"><\/i> Syarat: \$\{c\.targetBasis === .OMZET. \? `Omzet &ge; Rp \$\{t\.consistencyMinOmzet\?\.toLocaleString\("id-ID"\) \|\| 0\}\$\{omzetNote\} \$\{periodNote\}` : `Qty &ge; \$\{t\.consistencyMinQty \|\| 0\} \$\{unitNote\} \$\{periodNote\}`\}<br>'

$newBlock2 = 'const unitNote = isPeriodBonus ? "Unit" : "Unit/bulan";
    const poinNote = isPeriodBonus ? "Poin" : "Poin/bulan";
    const omzetNote = isPeriodBonus ? "" : "/bulan";

    let targetText = "";
    if (c.targetBasis === "OMZET") targetText = `Omzet &ge; Rp ${t.minOmzet.toLocaleString("id-ID")}`;
    else if (c.targetBasis === "POIN") targetText = `Total Poin &ge; ${(t.minOmzet || 0).toLocaleString("id-ID")} Poin`;
    else if (c.targetBasis === "BOTH") targetText = `Qty &ge; ${t.minQty} Unit DAN Omzet &ge; Rp ${t.minOmzet.toLocaleString("id-ID")}`;
    else targetText = `Qty &ge; ${t.minQty} Unit`;

    let cTargetText = "";
    if (c.targetBasis === "OMZET") cTargetText = `Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
    else if (c.targetBasis === "POIN") cTargetText = `Total Poin &ge; ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")} ${poinNote} ${periodNote}`;
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
        ` : ''}
        ${goodsText ? `<div style="font-size:0.85rem; color:#16a34a; margin-top:3px;"><strong>Bonus Hadiah Barang:</strong> ${goodsText}</div>` : ''}
        ${t.fixedVoucherAmount > 0 ? `<div style="font-size:0.85rem; color:#b45309;"><strong>Bonus Voucher:</strong> Rp ${t.fixedVoucherAmount.toLocaleString("id-ID")}</div>` : ''}
        ${t.hasConsistencyBonus ? `
          <div style="margin-top: 6px; font-size: 0.83rem; background: #f0fdf4; border: 1px solid #86efac; padding: 6px 10px; border-radius: 6px; color: #15803d;">
            <strong><i class="fa-solid fa-calendar-check"></i> ${bonusTitle}:</strong><br>
            <i class="fa-solid fa-circle-dot"></i> Syarat: ${cTargetText}<br>'

$txt = [regex]::Replace($txt, $oldBlock2, $newBlock2)
$txt | Out-File "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js" -Encoding UTF8
