param(
    [ValidateSet('Start', 'Stop', 'Status', 'Check')][string]$Action = 'Status',
    [int]$ApiPort = 8000,
    [int]$WebPort = 5173,
    [string]$RuntimeDirectory = '',
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$apiDirectory = Join-Path $projectRoot 'apps\api'
$webDirectory = Join-Path $projectRoot 'apps\web'
$runtimeDirectory = if ($RuntimeDirectory) { [IO.Path]::GetFullPath($RuntimeDirectory) } else { Join-Path $projectRoot 'artifacts\local-services' }
$statePath = Join-Path $runtimeDirectory 'processes.json'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

function Get-OwnedProcess($record) {
    try {
        $process = Get-Process -Id $record.ProcessId -ErrorAction Stop
        if ($process.StartTime.ToUniversalTime().ToString('o') -eq $record.StartedAt -and
            $process.Path -eq $record.Executable) { return $process }
    } catch {
        # An exited process or an unverifiable PID must never be stopped.
    }
    return $null
}

function Stop-OwnedProcesses($records) {
    foreach ($record in $records) {
        $process = Get-OwnedProcess $record
        if ($null -ne $process) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            if (-not $process.WaitForExit(5000)) { throw "Could not stop $($record.Name). Logs: $runtimeDirectory" }
        }
    }
}

function Assert-PortFree([int]$Port) {
    if ($Port -lt 1 -or $Port -gt 65535) { throw "Invalid port: $Port" }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch { throw "Port $Port is already in use. Stop the existing service or select another port." }
    finally { $listener.Stop() }
}

function Find-FreePort([int]$Preferred, [int]$Excluded = 0) {
    for ($candidatePort = $Preferred; $candidatePort -le [Math]::Min(65535, $Preferred + 30); $candidatePort++) {
        if ($candidatePort -eq $Excluded) { continue }
        try { Assert-PortFree $candidatePort; return $candidatePort } catch { }
    }
    throw "No available local port near $Preferred. Specify -ApiPort and -WebPort explicitly."
}

function Wait-Http([string]$Url, $record) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($null -eq (Get-OwnedProcess $record)) { throw "$($record.Name) exited. See $runtimeDirectory" }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    throw "Service readiness timed out: $Url. See $runtimeDirectory"
}

$lockPath = Join-Path $runtimeDirectory 'control.lock'
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Another project start/stop command is running. Wait for it to finish and retry.' }
try {
    $state = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
    if ($Action -eq 'Stop') {
        if ($null -ne $state) {
            Stop-OwnedProcesses $state.Processes
            Remove-Item -LiteralPath $statePath
        }
        Write-Output 'Project API, Worker and Web stopped. Other processes were not touched.'
        exit 0
    }
    if ($Action -eq 'Status') {
        if ($null -eq $state) { Write-Output 'No managed services.'; exit 0 }
        foreach ($record in $state.Processes) {
            $running = $null -ne (Get-OwnedProcess $record)
            Write-Output "$($record.Name): $(if ($running) {'running'} else {'stopped'})"
        }
        Write-Output "Web: $($state.WebUrl)"
        exit 0
    }
    if ($Action -eq 'Start' -and $null -ne $state) {
        $running = @($state.Processes | Where-Object { $null -ne (Get-OwnedProcess $_) })
        if ($running.Count -eq 3 -and @($running.Name | Sort-Object -Unique).Count -eq 3) {
            Write-Output "Project is already running. Web: $($state.WebUrl) API: $($state.ApiUrl)/docs"
            if (-not $NoBrowser) { Start-Process $state.WebUrl }
            exit 0
        }
        if ($running.Count -gt 0) { throw 'Some project services are still running. Run Stop, then Start to restart the full project.' }
    }
    $pythonExecutable = $null
    foreach ($candidate in @((Join-Path $projectRoot '.venv\Scripts\python.exe'), (Join-Path $apiDirectory '.venv\Scripts\python.exe'))) {
        if (Test-Path -LiteralPath $candidate) { $pythonExecutable = $candidate; break }
    }
    if (-not $pythonExecutable) {
        $pythonCommand = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $pythonCommand) { throw 'Python was not found. Install Python 3.12+ and enable Add to PATH.' }
        $pythonExecutable = $pythonCommand.Source
    }
    if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) { throw 'Node.js was not found. Install Node.js and enable Add to PATH.' }
    $nodeExecutable = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $viteEntry = Join-Path $webDirectory 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Missing frontend dependencies. Run npm ci in apps/web.' }
    & $pythonExecutable -c 'import fastapi, uvicorn, langchain_core, PIL, httpx, bcrypt, multipart'
    if ($LASTEXITCODE -ne 0) { throw 'Missing Python dependencies. Install apps/api/requirements.lock.txt.' }
    if ($Action -eq 'Check') { Write-Output 'Launcher dependencies available.'; exit 0 }
    if ($PSBoundParameters.ContainsKey('ApiPort')) { Assert-PortFree $ApiPort }
    else { $ApiPort = Find-FreePort $ApiPort }
    if ($PSBoundParameters.ContainsKey('WebPort')) { Assert-PortFree $WebPort }
    else { $WebPort = Find-FreePort $WebPort $ApiPort }
    if ($ApiPort -eq $WebPort) { throw 'API and Web require different ports.' }
    $records = @()
    function Start-ServiceProcess([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$Directory) {
        $quotedArguments = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $process = Start-Process -FilePath $Executable -ArgumentList $quotedArguments -WorkingDirectory $Directory `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory "$Name.out.log") `
            -RedirectStandardError (Join-Path $runtimeDirectory "$Name.err.log")
        # Query the live process: Start-Process can return before its executable path is available.
        $liveProcess = Get-Process -Id $process.Id
        return [pscustomobject]@{ Name=$Name; ProcessId=$process.Id; StartedAt=$liveProcess.StartTime.ToUniversalTime().ToString('o'); Executable=$Executable }
    }
    try {
        # No reload subprocess: each managed service has one tracked process.
        $records += Start-ServiceProcess 'api' $pythonExecutable @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$ApiPort") $apiDirectory
        $state = [pscustomobject]@{ Processes=$records; WebUrl="http://127.0.0.1:$WebPort"; ApiUrl="http://127.0.0.1:$ApiPort" }
        $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
        Wait-Http "$($state.ApiUrl)/readyz" $records[0]
        $records += Start-ServiceProcess 'worker' $pythonExecutable @('-m', 'app.worker') $apiDirectory
        $state.Processes = $records
        $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
        $previousApiTarget = $env:ZHIXIU_API_TARGET
        $env:ZHIXIU_API_TARGET = $state.ApiUrl
        try {
            $records += Start-ServiceProcess 'web' $nodeExecutable @($viteEntry, '--host', '127.0.0.1', '--port', "$WebPort", '--strictPort') $webDirectory
        } finally { $env:ZHIXIU_API_TARGET = $previousApiTarget }
        $state.Processes = $records
        $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
        Wait-Http $state.WebUrl $records[2]
        foreach ($record in $records) {
            if ($null -eq (Get-OwnedProcess $record)) { throw "$($record.Name) did not remain running." }
        }
        Write-Output "API, Worker and Web ready. Web: $($state.WebUrl) API: $($state.ApiUrl)/docs"
        Write-Output "Logs: $runtimeDirectory"
        if (-not $NoBrowser) { Start-Process $state.WebUrl }
    } catch {
        Stop-OwnedProcesses $records
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
        throw
    }
} finally { $lock.Dispose() }
