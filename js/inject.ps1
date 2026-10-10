$lines = [System.Collections.ArrayList](Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js')
$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '<td><strong>\$\{item.storeName\}</strong></td>') {
        if ($lines[$i-1] -match 'tr.innerHTML = \s*`') {
            $idx = $i
            break
        }
    }
}
if ($idx -gt 0) {
    $lines.Insert($idx, '        <td style="font-size:0.8rem;">')
    $lines.Insert($idx+1, '          <span class="badge badge-info"><i class="fa-solid fa-calendar"></i> ${mStr}</span><br>')
    $lines.Insert($idx+2, '          <span class="badge badge-secondary" style="font-size:0.7rem; margin-top:4px;">${modeStr}</span>')
    $lines.Insert($idx+3, '        </td>')
    $lines.Insert($idx+4, '        <td style="font-size:0.85rem; max-width:180px;">')
    $lines.Insert($idx+5, '          <strong>${item.campaignCode || ""}</strong><br>')
    $lines.Insert($idx+6, '          <span style="color:#64748b; font-size:0.75rem;">${item.campaignName || ""}</span>')
    $lines.Insert($idx+7, '        </td>')
    
    $lines.Insert($idx-1, '      const modeStr = item.snapshotCalcMode === "MONTHLY_ONLY" ? "Single Bln" : "Kumulatif";')
    $lines.Insert($idx-1, '      const mStr = parts.length === 2 ? ${monthNames[parseInt(parts[1],10)-1]}  : item.snapshotMonth;')
    $lines.Insert($idx-1, '      const parts = (item.snapshotMonth || "").split("-");')
    $lines.Insert($idx-1, '      const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];')
    
    $lines | Out-File 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding utf8
} else {
    Write-Host 'Not found'
}
