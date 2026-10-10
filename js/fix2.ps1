$txt = Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Raw
$oldStr = '        const modeStr = item.snapshotCalcMode === "MONTHLY_ONLY" ? "Single Bln" : "Kumulatif";
      tr.innerHTML = `'

$newStr = '        const modeStr = item.snapshotCalcMode === "MONTHLY_ONLY" ? "Single Bln" : "Kumulatif";
        const noGoods = !item.goodsDescription;
        const noCash = (!item.fixedCashAmount || item.fixedCashAmount === 0);
        const noVoucher = (!item.fixedVoucherAmount || item.fixedVoucherAmount === 0);
        const isTotalValueZero = (!item.totalRewardValue || item.totalRewardValue === 0);
        const isDisabled = (noGoods && noCash && noVoucher && isTotalValueZero);
        const displayStatus = isDisabled ? "PENDING" : item.payoutStatus;
      tr.innerHTML = `'

$txt = $txt.Replace($oldStr.Replace("`r`n", "`n"), $newStr.Replace("`r`n", "`n"))
$txt = $txt.Replace($oldStr, $newStr)
$txt | Out-File 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding utf8
