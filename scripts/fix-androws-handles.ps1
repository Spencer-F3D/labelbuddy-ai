# ============================================================
#  騰訊應用寶 (Tencent Androws) 控制代碼洩漏修復工具
#  由「修復應用寶.bat」以系統管理員權限呼叫。
#
#  背景：AndrowsStore.exe（腾讯应用宝 商店常駐程式）在
#        v3.0.8100.1583 出現控制代碼洩漏，實測約每秒 +300~400 個，
#        只增不減，最終佔用全機 90% 的控制代碼。
#
#  本檔必須是 UTF-8 with BOM，PowerShell 5.1 才讀得對中文。
# ============================================================

$ErrorActionPreference = 'Continue'

$logPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '應用寶修復記錄.txt'
$L = New-Object System.Collections.Generic.List[string]

function Say($t) {
  $L.Add($t)
  Write-Host $t
}

Say '============================================================'
Say '  騰訊應用寶 —— 控制代碼洩漏修復'
Say "  時間：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say '============================================================'
Say ''

# ---------- 權限檢查 ----------
$wi = [Security.Principal.WindowsIdentity]::GetCurrent()
$wp = New-Object Security.Principal.WindowsPrincipal($wi)
if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Say '[錯誤] 需要系統管理員權限才能繼續。'
  Say ''
  Say '       請改用以下任一方式：'
  Say '         1. 對「修復應用寶.bat」按右鍵 → 以系統管理員身分執行'
  Say '         2. 以管理員身分開啟 PowerShell，執行：'
  Say "            powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  Say ''
  Set-Content -Path $logPath -Value $L -Encoding UTF8
  exit 1
}
Say '[OK] 已取得系統管理員權限。'
Say ''

# ---------- 修復前快照 ----------
$allBefore  = Get-Process
$totalBefore = ($allBefore | Measure-Object HandleCount -Sum).Sum
$storeBefore = @($allBefore | Where-Object { $_.Name -eq 'AndrowsStore' })
if ($storeBefore.Count -gt 0) {
  foreach ($s in $storeBefore) {
    Say "修復前：AndrowsStore (PID $($s.Id)) 控制代碼 = $($s.HandleCount.ToString('N0'))"
  }
} else {
  Say '修復前：AndrowsStore 未執行'
}
Say "修復前：全系統控制代碼合計 = $($totalBefore.ToString('N0'))"
Say ''

# ---------- 步驟 1：結束洩漏行程 ----------
Say '------------------------------------------------------------'
Say '步驟 1／3：結束 AndrowsStore.exe'
Say '------------------------------------------------------------'
$targets = @(Get-Process -Name 'AndrowsStore' -ErrorAction SilentlyContinue)
if ($targets.Count -eq 0) {
  Say '  沒有正在執行的 AndrowsStore，略過。'
} else {
  foreach ($t in $targets) {
    try {
      Stop-Process -Id $t.Id -Force -ErrorAction Stop
      Say "  PID $($t.Id) → 已結束"
    } catch {
      Say "  PID $($t.Id) → 失敗：$($_.Exception.Message)"
    }
  }
}
Start-Sleep -Seconds 8
$left = @(Get-Process -Name 'AndrowsStore' -ErrorAction SilentlyContinue)
if ($left.Count -gt 0) {
  Say "  [注意] 它又自己回來了：PID $(($left | ForEach-Object { $_.Id }) -join '、')"
  Say '         研判是 AndrowsSvr 服務把它重新拉起的。'
} else {
  Say '  [OK] 確認已結束，且沒有自動重啟。'
}
Say ''

# ---------- 步驟 2：服務改為手動啟動 ----------
Say '------------------------------------------------------------'
Say '步驟 2／3：AndrowsSvr 服務改為「手動」啟動'
Say '------------------------------------------------------------'
$svc = Get-CimInstance Win32_Service -Filter "Name='AndrowsSvr'" -ErrorAction SilentlyContinue
if (-not $svc) {
  Say '  找不到 AndrowsSvr 服務，略過。'
} else {
  Say "  修改前：啟動類型 = $($svc.StartMode)　狀態 = $($svc.State)"
  $changed = $false
  try {
    Set-Service -Name 'AndrowsSvr' -StartupType Manual -ErrorAction Stop
    $changed = $true
    Say '  [OK] 已改為手動啟動'
  } catch {
    Say "  Set-Service 失敗（$($_.Exception.Message)），改用 sc.exe："
    & sc.exe config AndrowsSvr start= demand | ForEach-Object { Say "    $_" }
    $changed = $true
  }
  $svc2 = Get-CimInstance Win32_Service -Filter "Name='AndrowsSvr'" -ErrorAction SilentlyContinue
  Say "  修改後：啟動類型 = $($svc2.StartMode)　狀態 = $($svc2.State)"
  if ($svc2.StartMode -ne 'Manual') {
    Say '  [警告] 啟動類型沒有改成 Manual，請手動到 services.msc 修改。'
  }
}
Say ''

# ---------- 步驟 3：驗證 ----------
Say '------------------------------------------------------------'
Say '步驟 3／3：驗證 30 秒（控制代碼應該不再攀升）'
Say '------------------------------------------------------------'
for ($i = 1; $i -le 6; $i++) {
  Start-Sleep -Seconds 5
  $now = Get-Process
  $tot = ($now | Measure-Object HandleCount -Sum).Sum
  $st  = @($now | Where-Object { $_.Name -eq 'AndrowsStore' })
  if ($st.Count -gt 0) {
    $h = ($st | Measure-Object HandleCount -Sum).Sum
    Say "  t=$($i * 5)秒　全系統 = $($tot.ToString('N0'))　｜　AndrowsStore = $($h.ToString('N0'))（又啟動了）"
  } else {
    Say "  t=$($i * 5)秒　全系統 = $($tot.ToString('N0'))　｜　AndrowsStore = 未執行"
  }
}
Say ''

$totalAfter = ((Get-Process) | Measure-Object HandleCount -Sum).Sum
Say '============================================================'
Say '  結果'
Say '============================================================'
Say "  全系統控制代碼：$($totalBefore.ToString('N0'))  →  $($totalAfter.ToString('N0'))"
Say "  本次減少：$(([int64]$totalBefore - [int64]$totalAfter).ToString('N0')) 個"
Say ''
Say '  若要還原成開機自動啟動：'
Say '    執行 services.msc → 找到 AndrowsSvr → 內容 → 啟動類型改回「自動」。'
Say ''
Say "  完整記錄檔：$logPath"
Say '============================================================'

Set-Content -Path $logPath -Value $L -Encoding UTF8
exit 0
