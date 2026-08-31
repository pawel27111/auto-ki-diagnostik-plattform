[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$compiler = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
$frameworkPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319"
$apiSource = "C:\EDIABAS\Bin\NET\4.0\apiNET32.dll"
$outputRoot = Join-Path $projectRoot ("artifacts\" + $Configuration)
$bridgeOutput = Join-Path $outputRoot "bridge"
$copilotOutput = Join-Path $outputRoot "copilot"
$testOutput = Join-Path $outputRoot "tests"

foreach ($requiredPath in @($compiler, $apiSource)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required installed file is missing: $requiredPath"
    }
}

New-Item -ItemType Directory -Force -Path $bridgeOutput, $copilotOutput, $testOutput |
    Out-Null

$sharedSources = Get-ChildItem (Join-Path $projectRoot "src\InpaAi.Shared") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName
$bridgeSources = @($sharedSources) + @(Get-ChildItem (Join-Path $projectRoot "src\InpaAi.Bridge") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName)
$testSources = Get-ChildItem (Join-Path $projectRoot "tests\InpaAi.Bridge.Tests") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName
$copilotSources = @($sharedSources) + @(Get-ChildItem (Join-Path $projectRoot "src\InpaAi.Copilot") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName)
$copilotTestSources = Get-ChildItem `
    (Join-Path $projectRoot "tests\InpaAi.Copilot.Tests") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName
$uiSmokeSources = Get-ChildItem `
    (Join-Path $projectRoot "tests\InpaAi.Copilot.UiSmoke") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName
$liveSmokeSources = Get-ChildItem `
    (Join-Path $projectRoot "tests\InpaAi.Copilot.LiveSmoke") -Filter *.cs |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName
$fakeBridgeSource = Join-Path $projectRoot "tests\Fixtures\FakeBridge.cs"

$commonArguments = @(
    "/nologo",
    "/warn:4",
    "/warnaserror+",
    "/langversion:5",
    "/reference:$frameworkPath\System.Web.Extensions.dll"
)

$configurationArguments = if ($Configuration -eq "Debug") {
    @("/debug:full", "/optimize-")
} else {
    @("/debug:pdbonly", "/optimize+")
}

$bridgeExe = Join-Path $bridgeOutput "InpaAi.Bridge.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$bridgeExe" `
    "/reference:$apiSource" `
    $bridgeSources
if ($LASTEXITCODE -ne 0) {
    throw "Bridge compilation failed with exit code $LASTEXITCODE."
}

Copy-Item -LiteralPath $apiSource -Destination (Join-Path $bridgeOutput "apiNET32.dll") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "src\InpaAi.Bridge\App.config") `
    -Destination ($bridgeExe + ".config") -Force

$testExe = Join-Path $testOutput "InpaAi.Bridge.Tests.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$testExe" `
    "/reference:$bridgeExe" `
    $testSources
if ($LASTEXITCODE -ne 0) {
    throw "Test compilation failed with exit code $LASTEXITCODE."
}

Copy-Item -LiteralPath $bridgeExe -Destination (Join-Path $testOutput "InpaAi.Bridge.exe") -Force
Copy-Item -LiteralPath (Join-Path $bridgeOutput "apiNET32.dll") `
    -Destination (Join-Path $testOutput "apiNET32.dll") -Force
Copy-Item -LiteralPath ($bridgeExe + ".config") `
    -Destination ($testExe + ".config") -Force

$copilotExe = Join-Path $copilotOutput "InpaAi.Copilot.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:winexe" `
    "/platform:x86" `
    "/out:$copilotExe" `
    "/reference:$frameworkPath\System.Drawing.dll" `
    "/reference:$frameworkPath\System.Net.Http.dll" `
    "/reference:$frameworkPath\System.Windows.Forms.dll" `
    $copilotSources
if ($LASTEXITCODE -ne 0) {
    throw "Copilot compilation failed with exit code $LASTEXITCODE."
}

Copy-Item -LiteralPath (Join-Path $projectRoot "src\InpaAi.Copilot\App.config") `
    -Destination ($copilotExe + ".config") -Force

$copilotFixtureOutput = Join-Path $copilotOutput "fixtures\synthetic"
$copilotConfigOutput = Join-Path $copilotOutput "config"
$copilotSchemaOutput = Join-Path $copilotOutput "schemas"
New-Item -ItemType Directory -Force -Path `
    $copilotFixtureOutput, $copilotConfigOutput, $copilotSchemaOutput | Out-Null
Get-ChildItem (Join-Path $projectRoot "fixtures\synthetic") -Filter *.json |
    Copy-Item -Destination $copilotFixtureOutput -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "config\ms43-profile.offline.json") `
    -Destination $copilotConfigOutput -Force
Copy-Item -LiteralPath (
    Join-Path $projectRoot "schemas\diagnostic-data-contract.schema.json") `
    -Destination $copilotSchemaOutput -Force

$copilotTestExe = Join-Path $testOutput "InpaAi.Copilot.Tests.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$copilotTestExe" `
    "/reference:$copilotExe" `
    "/reference:$frameworkPath\System.Drawing.dll" `
    "/reference:$frameworkPath\System.Net.Http.dll" `
    "/reference:$frameworkPath\System.Windows.Forms.dll" `
    $copilotTestSources
if ($LASTEXITCODE -ne 0) {
    throw "Copilot test compilation failed with exit code $LASTEXITCODE."
}

Copy-Item -LiteralPath $copilotExe `
    -Destination (Join-Path $testOutput "InpaAi.Copilot.exe") -Force
Copy-Item -LiteralPath ($copilotExe + ".config") `
    -Destination ($copilotTestExe + ".config") -Force

$uiSmokeExe = Join-Path $testOutput "InpaAi.Copilot.UiSmoke.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$uiSmokeExe" `
    "/reference:$copilotExe" `
    "/reference:$frameworkPath\System.Drawing.dll" `
    "/reference:$frameworkPath\System.Net.Http.dll" `
    "/reference:$frameworkPath\System.Windows.Forms.dll" `
    $uiSmokeSources
if ($LASTEXITCODE -ne 0) {
    throw "Copilot UI smoke compilation failed with exit code $LASTEXITCODE."
}
Copy-Item -LiteralPath ($copilotExe + ".config") `
    -Destination ($uiSmokeExe + ".config") -Force

$liveSmokeExe = Join-Path $testOutput "InpaAi.Copilot.LiveSmoke.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$liveSmokeExe" `
    "/reference:$copilotExe" `
    "/reference:$frameworkPath\System.Drawing.dll" `
    "/reference:$frameworkPath\System.Net.Http.dll" `
    "/reference:$frameworkPath\System.Windows.Forms.dll" `
    $liveSmokeSources
if ($LASTEXITCODE -ne 0) {
    throw "Copilot live smoke compilation failed with exit code $LASTEXITCODE."
}
Copy-Item -LiteralPath ($copilotExe + ".config") `
    -Destination ($liveSmokeExe + ".config") -Force

$fakeBridgeExe = Join-Path $testOutput "InpaAi.FakeBridge.exe"
& $compiler @commonArguments @configurationArguments `
    "/target:exe" `
    "/platform:x86" `
    "/out:$fakeBridgeExe" `
    $fakeBridgeSource
if ($LASTEXITCODE -ne 0) {
    throw "Fake bridge test fixture compilation failed with exit code $LASTEXITCODE."
}
Copy-Item -LiteralPath $fakeBridgeExe `
    -Destination (Join-Path $testOutput "InpaAi.FakeBridge-Hang.exe") -Force
Copy-Item -LiteralPath $fakeBridgeExe `
    -Destination (Join-Path $testOutput "InpaAi.FakeBridge-Extra.exe") -Force

$testProviderFixtures = Join-Path $testOutput "fixtures\provider"
$testSyntheticFixtures = Join-Path $testOutput "fixtures\synthetic"
$testInvalidFixtures = Join-Path $testOutput "fixtures\data-contract-invalid"
$testSecurityFixtures = Join-Path $testOutput "fixtures\security"
$testConfigOutput = Join-Path $testOutput "config"
$testSchemaOutput = Join-Path $testOutput "schemas"
New-Item -ItemType Directory -Force -Path `
    $testProviderFixtures, `
    $testSyntheticFixtures, `
    $testInvalidFixtures, `
    $testSecurityFixtures, `
    $testConfigOutput, `
    $testSchemaOutput |
    Out-Null
Get-ChildItem (Join-Path $projectRoot "fixtures\provider") -Filter *.json |
    Copy-Item -Destination $testProviderFixtures -Force
Get-ChildItem (Join-Path $projectRoot "fixtures\synthetic") -Filter *.json |
    Copy-Item -Destination $testSyntheticFixtures -Force
Get-ChildItem (Join-Path $projectRoot "fixtures\data-contract-invalid") -Filter *.json |
    Copy-Item -Destination $testInvalidFixtures -Force
Get-ChildItem (Join-Path $projectRoot "fixtures\security") -Filter *.json |
    Copy-Item -Destination $testSecurityFixtures -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "config\ms43-profile.offline.json") `
    -Destination $testConfigOutput -Force
Copy-Item -LiteralPath (
    Join-Path $projectRoot "schemas\diagnostic-data-contract.schema.json") `
    -Destination $testSchemaOutput -Force

Write-Output "Bridge: $bridgeExe"
Write-Output "Copilot: $copilotExe"
Write-Output "Bridge tests:  $testExe"
Write-Output "Copilot tests: $copilotTestExe"
Write-Output "UI smoke test: $uiSmokeExe"
Write-Output "Live smoke test: $liveSmokeExe"
