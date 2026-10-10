$txt = Get-Content "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js" -Raw

# Replace block 1 (around line 823-850)
$oldBlock1 = '(?s)const unitNote = isPeriodBonus \? "Poin" : "Poin/bulan";.*?<span style="font-size: 0\.82rem; color: #475569; font-weight: 600;">Syarat Target: \$\{cmp\.targetBasis === .OMZET. \? `Omzet &ge; Rp \$\{t\.minOmzet\.toLocaleString\("id-ID"\)\}` : `Qty &ge; \$\{t\.minQty\} Poin`\}<\/span>.*?<i class="fa-solid fa-circle-dot"><\/i> Syarat: \$\{cmp\.targetBasis === .OMZET. \? `Omzet &ge; Rp \$\{t\.consistencyMinOmzet\?\.toLocaleString\("id-ID"\) \|\| 0\}\$\{omzetNote\} \$\{periodNote\}` : `Qty &ge; \$\{t\.consistencyMinQty \|\| 0\} \$\{unitNote\} \$\{periodNote\}`\}<br>'

$newBlock1 = 'const unitNote = isPeriodBonus ? "Unit" : "Unit/bulan";
        const poinNote = isPeriodBonus ? "Poin" : "Poin/bulan";
        const omzetNote = isPeriodBonus ? "" : "/bulan";

        let targetText = "";
        if (cmp.targetBasis === "OMZET") targetText = `Omzet &ge; Rp ${t.minOmzet.toLocaleString("id-ID")}`;
        else if (cmp.targetBasis === "POIN") targetText = `Total Poin &ge; ${(t.minOmzet || 0).toLocaleString("id-ID")}`;
        else if (cmp.targetBasis === "BOTH") targetText = `Qty &ge; ${t.minQty} Unit DAN Omzet &ge; Rp ${t.minOmzet.toLocaleString("id-ID")}`;
        else targetText = `Qty &ge; ${t.minQty} Unit`;

        let cTargetText = "";
        if (cmp.targetBasis === "OMZET") cTargetText = `Omzet &ge; Rp ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")}${omzetNote} ${periodNote}`;
        else if (cmp.targetBasis === "POIN") cTargetText = `Total Poin &ge; ${(t.consistencyMinOmzet || 0).toLocaleString("id-ID")} ${poinNote} ${periodNote}`;
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
          <div style="background: ${isCurrentMatchedTier ? ''#f0fdf4'' : ''#ffffff''}; border: 1px solid ${isCurrentMatchedTier ? ''#86efac'' : ''#cbd5e1''}; padding: 10px 12px; border-radius: 6px; position: relative;">
            ${isCurrentMatchedTier ? `<span class="badge badge-success" style="position: absolute; top: 8px; right: 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-check"></i> Tier Toko Saat Ini</span>` : ''}
            <strong style="color: #0f172a; font-size: 0.88rem;">Tier Level ${t.level}: ${t.tierName}</strong><br>
            <span style="font-size: 0.82rem; color: #475569; font-weight: 600;">Syarat Target: ${targetText}</span>
            ${bundlingText}
            
            <div style="margin-top: 6px; font-size: 0.81rem; line-height: 1.45; color: #334155;">
              ${activeRates.length > 0 ? `<div style="color: #0284c7;"><strong>Rates Insentif per Item:</strong><br>${rateText}</div>` : ''}
              ${goodsText ? `<div style="color: #16a34a; margin-top:2px;"><strong>Bonus Hadiah Barang:</strong> ${goodsText}</div>` : ''}
              ${t.fixedVoucherAmount > 0 ? `<div style="color: #b45309; margin-top:2px;"><strong>Bonus Cash / Voucher:</strong> Rp ${t.fixedVoucherAmount.toLocaleString("id-ID")}</div>` : ''}
              ${t.hasConsistencyBonus ? `
                <div style="margin-top: 4px; background: #f0fdf4; border: 1px dashed #86efac; padding: 4px 8px; border-radius: 4px; color: #15803d; font-size: 0.78rem;">
                  <strong><i class="fa-solid fa-calendar-check"></i> ${bonusTitle}:</strong><br>
                  <i class="fa-solid fa-circle-dot"></i> Syarat: ${cTargetText}<br>'

$txt = [regex]::Replace($txt, $oldBlock1, $newBlock1)
$txt | Out-File "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js" -Encoding UTF8
