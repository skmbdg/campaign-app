$txt = Get-Content 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Raw
$newFunc = ""
// Populate achievements month filter based on snapshots
function populateAchMonthFilter() {
  const sel = document.getElementById('ach-month-filter');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="ALL">Semua Bulan</option>';
  const snaps = window.db.getMonthlySnapshots() || {};
  const monthSet = new Set();
  Object.keys(snaps).forEach(k => {
    const parts = k.split('_');
    if (parts[0]) monthSet.add(parts[0]);
  });
  const sorted = Array.from(monthSet).sort().reverse();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  sorted.forEach(m => {
    const p = m.split('-');
    const mName = p.length === 2 ? monthNames[parseInt(p[1],10)-1] : '';
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = p.length === 2 ? mName + ' ' + p[0] : m;
    sel.appendChild(opt);
  });
  if (currentVal && monthSet.has(currentVal)) {
    sel.value = currentVal;
  }
}
""
$txt = $txt + "
" + $newFunc
$txt | Out-File 'd:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js' -Encoding utf8
