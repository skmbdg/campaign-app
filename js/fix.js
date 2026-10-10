const fs = require('fs');
let txt = fs.readFileSync('d:/Users/mukinaryo/.gemini/antigravity/scratch/campaign_app_netlify/js/app.js', 'utf8');

const regex = /<td><strong style="color:#16a34a; font-size:1\.05rem;">\$\{formatRupiah\(item\.totalRewardValue\)\}<\/strong><\/td>`n\s*<td>\$\{getPayoutBadge\(displayStatus\)\}<\/td>`n\s*\$\{isManagerOrAdmin \? ```n\s*<td>`n\s*<select class="form-select btn-sm" onchange="changePayoutStatus\('\$\{item\.id\}', this\.value, this\)" style="width: auto;" \$\{isDisabled \? 'disabled' : ''\}>`n\s*<option value="PENDING" \$\{displayStatus === 'PENDING' \? 'selected' : ''\}>PENDING<\/option>`n\s*<option value="APPROVED" \$\{displayStatus === 'APPROVED' \? 'selected' : ''\}>APPROVED<\/option>`n\s*<option value="TRANSFERRED" \$\{displayStatus === 'TRANSFERRED' \? 'selected' : ''\}>TRANSFERRED<\/option>`n\s*<option value="CLAIMED" \$\{displayStatus === 'CLAIMED' \? 'selected' : ''\}>CLAIMED<\/option>`n\s*<\/select>`n\s*<\/td>``` : `<td class="role-admin-manager">-<\/td>`\}/s;

const newStr = `<td><strong style="color:#16a34a; font-size:1.05rem;">${formatRupiah(item.totalRewardValue)}</strong></td>
        <td>${getPayoutBadge(displayStatus)}</td>
        ${isManagerOrAdmin ? \`
        <td>
          <select class="form-select btn-sm" onchange="changePayoutStatus('\${item.id}', this.value, this)" style="width: auto;" \${isDisabled ? 'disabled' : ''}>
            <option value="PENDING" \${displayStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
            <option value="APPROVED" \${displayStatus === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
            <option value="TRANSFERRED" \${displayStatus === 'TRANSFERRED' ? 'selected' : ''}>TRANSFERRED</option>
            <option value="CLAIMED" \${displayStatus === 'CLAIMED' ? 'selected' : ''}>CLAIMED</option>
          </select>
        </td>\` : \`<td class="role-admin-manager">-</td>\`}`;

txt = txt.replace(regex, newStr);

fs.writeFileSync('d:/Users/mukinaryo/.gemini/antigravity/scratch/campaign_app_netlify/js/app.js', txt, 'utf8');
