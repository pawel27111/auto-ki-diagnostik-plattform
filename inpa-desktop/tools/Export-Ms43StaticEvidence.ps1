[CmdletBinding()]
param(
    [string]$IpoPath = "C:\EC-APPS\INPA\SGDAT\MS430.IPO",
    [string]$PrgPath = "C:\EDIABAS\ECU\ms430ds0.prg",
    [string]$BestInfoPath = "C:\EDIABAS\Bin\bestinfo.exe",
    [string]$ProfilePath = (
        Join-Path $PSScriptRoot "..\config\ms43-profile.offline.json"),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\docs")
)

$ErrorActionPreference = "Stop"

foreach ($path in @($IpoPath, $PrgPath, $BestInfoPath, $ProfilePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required static-analysis input is missing: $path"
    }
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $resolvedOutput.StartsWith(
    $projectRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase)) {
    throw "Output must remain inside the project directory."
}

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

function Get-Cp1252StringsWithOffset {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [int]$MinimumLength = 2
    )

    $bytes = [IO.File]::ReadAllBytes($Path)
    $encoding = [Text.Encoding]::GetEncoding(1252)
    $start = -1
    $buffer = New-Object Collections.Generic.List[byte]

    for ($index = 0; $index -lt $bytes.Length; $index++) {
        $byte = $bytes[$index]
        $printable = ($byte -ge 32 -and $byte -le 126) -or $byte -ge 160
        if ($printable) {
            if ($start -lt 0) {
                $start = $index
            }
            $buffer.Add($byte)
            continue
        }

        if ($buffer.Count -ge $MinimumLength) {
            [pscustomobject]@{
                Offset = $start
                Hex = "0x{0:X}" -f $start
                Text = $encoding.GetString($buffer.ToArray())
            }
        }
        $start = -1
        $buffer.Clear()
    }

    if ($buffer.Count -ge $MinimumLength) {
        [pscustomobject]@{
            Offset = $start
            Hex = "0x{0:X}" -f $start
            Text = $encoding.GetString($buffer.ToArray())
        }
    }
}

$ipoHash = (Get-FileHash -LiteralPath $IpoPath -Algorithm SHA256).Hash
$prgHash = (Get-FileHash -LiteralPath $PrgPath -Algorithm SHA256).Hash

$jobOutput = & $BestInfoPath -Q $PrgPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "bestinfo failed with exit code $LASTEXITCODE."
}

$jobHeader = @(
    "STATIC ANALYSIS ONLY - NO EDIABAS JOB EXECUTED"
    "Source: $PrgPath"
    "SHA-256: $prgHash"
    "Tool: $BestInfoPath -Q"
    ""
)
($jobHeader + $jobOutput) | Set-Content -LiteralPath (
    Join-Path $resolvedOutput "ms43-prg-jobs.txt") -Encoding UTF8

$stringHeader = @(
    "STATIC ANALYSIS ONLY - CP1252 PRINTABLE STRINGS WITH FILE OFFSETS"
    "Source: $IpoPath"
    "SHA-256: $ipoHash"
    "Tool: $($MyInvocation.MyCommand.Path)"
    ""
    "OFFSET`tTEXT"
)
$stringLines = Get-Cp1252StringsWithOffset -Path $IpoPath |
    ForEach-Object { "$($_.Hex)`t$($_.Text)" }
($stringHeader + $stringLines) | Set-Content -LiteralPath (
    Join-Path $resolvedOutput "ms43-ipo-strings.txt") -Encoding UTF8

function ConvertTo-MarkdownCell {
    param([object]$Value)

    if ($null -eq $Value) {
        return "not statically proven"
    }
    return ([string]$Value).Replace("|", "\|").Replace(
        "`r",
        " ").Replace(
        "`n",
        " ")
}

$profile = Get-Content -LiteralPath $ProfilePath -Raw | ConvertFrom-Json
if ($profile.profileState -ne "OFFLINE_ONLY" -or
    $profile.runtimeVerified -ne $false -or
    $profile.executionEnabled -ne $false) {
    throw "Profile is not safely locked to OFFLINE_ONLY."
}

$catalogLines = New-Object Collections.Generic.List[string]
$catalogLines.Add("# Static MS43 offline catalog")
$catalogLines.Add("")
$catalogLines.Add('Generated from `config\ms43-profile.offline.json`.')
$catalogLines.Add("This is metadata only and is not an executable bridge allowlist.")
$catalogLines.Add("")
$catalogLines.Add('```text')
$catalogLines.Add("profileState:     $($profile.profileState)")
$catalogLines.Add("runtimeVerified:  $($profile.runtimeVerified)")
$catalogLines.Add("executionEnabled: $($profile.executionEnabled)")
$catalogLines.Add("SGBD:             $($profile.sgbd)")
$catalogLines.Add("catalog entries:  $($profile.catalog.Count)")
$catalogLines.Add('```')

foreach ($group in $profile.catalog.group | Sort-Object -Unique) {
    $catalogLines.Add("")
    $catalogLines.Add("## $(ConvertTo-MarkdownCell $group)")
    $catalogLines.Add("")
    $catalogLines.Add(
        "| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |")
    $catalogLines.Add(
        "|---|---|---|---|---|---|---|---|---:|---|")

    foreach ($entry in $profile.catalog | Where-Object group -eq $group) {
        $offsets = $entry.source.ipoOffsets -join ", "
        $verification = $entry.verificationStatus -join ", "
        $catalogLines.Add(
            "| $(ConvertTo-MarkdownCell $entry.sgbd) " +
            "| $(ConvertTo-MarkdownCell $entry.job) " +
            "| $(ConvertTo-MarkdownCell $entry.resultField) " +
            "| $(ConvertTo-MarkdownCell $entry.normalizedName) " +
            "| $(ConvertTo-MarkdownCell $entry.dataType) " +
            "| $(ConvertTo-MarkdownCell $entry.unit) " +
            "| $(ConvertTo-MarkdownCell $offsets) " +
            "| $(ConvertTo-MarkdownCell $verification) " +
            "| $($entry.readOnlyCandidate) " +
            "| $(ConvertTo-MarkdownCell $entry.notes) |")
    }
}

$catalogLines | Set-Content -LiteralPath (
    Join-Path $resolvedOutput "ms43-static-catalog.md") -Encoding UTF8

Write-Output "PRG jobs: $(Join-Path $resolvedOutput 'ms43-prg-jobs.txt')"
Write-Output "IPO strings: $(Join-Path $resolvedOutput 'ms43-ipo-strings.txt')"
Write-Output "Catalog: $(Join-Path $resolvedOutput 'ms43-static-catalog.md')"
