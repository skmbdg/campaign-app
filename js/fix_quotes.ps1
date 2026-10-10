$lines = Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js'

$lines[850] = '                  ${t.consistencyVoucherAmount > 0 ? `<i class="fa-solid fa-circle-dot"></i> Bonus Cash/Voucher: Rp ${t.consistencyVoucherAmount.toLocaleString("id-ID")}<br>` : ""}'
$lines[851] = '                  ${cGoodsText ? `<i class="fa-solid fa-circle-dot"></i> Hadiah Barang Bonus: ${cGoodsText}` : ""}'
$lines[1726] = '            ${t.consistencyVoucherAmount > 0 ? `<i class="fa-solid fa-circle-dot"></i> Bonus Cash/Voucher: Rp ${t.consistencyVoucherAmount.toLocaleString("id-ID")}<br>` : ""}'
$lines[1727] = '            ${cGoodsText ? `<i class="fa-solid fa-circle-dot"></i> Hadiah Barang Bonus: ${cGoodsText}` : ""}'

$lines | Set-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding UTF8
