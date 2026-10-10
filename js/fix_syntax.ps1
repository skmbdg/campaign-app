$lines = Get-Content "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js"

for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match " : '}") {
        $lines[$i] = $lines[$i] -replace " : '}", ' : ""}'
    }
}

$lines | Set-Content "d:\Users\mukinaryo\.gemini\antigravity\scratch\campaign_app_netlify\js\app.js" -Encoding UTF8
