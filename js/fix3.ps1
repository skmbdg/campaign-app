$txt = Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Raw
$regex = '(?s)(const modeStr = item\.snapshotCalcMode === "MONTHLY_ONLY" \? "Single Bln" : "Kumulatif";)\s*(tr\.innerHTML = `)'

$newStr = '$1
        const noGoods = !item.goodsDescription;
        const noCash = (!item.fixedCashAmount || item.fixedCashAmount === 0);
        const noVoucher = (!item.fixedVoucherAmount || item.fixedVoucherAmount === 0);
        const isTotalValueZero = (!item.totalRewardValue || item.totalRewardValue === 0);
        const isDisabled = (noGoods && noCash && noVoucher && isTotalValueZero);
        const displayStatus = isDisabled ? "PENDING" : item.payoutStatus;
      $2'

$txt = [regex]::Replace($txt, $regex, $newStr)
$txt | Out-File 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding utf8
