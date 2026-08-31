# Phase 1A verification report

## Scope and safety

The bridge is confined to this project directory. No file below
`C:\EDIABAS` or `C:\EC-APPS` was written, replaced, or configured. No INI,
registry, or PATH setting was changed. The only executed SGBD was `TMODE`; the
only executed jobs were `INFO` and `INITIALISIERUNG`.

## Installed build tools

```text
Visual Studio / Build Tools: not installed
vswhere.exe:                 not installed
dotnet SDK:                  not installed
dotnet host/runtimes:        installed, x64
MSBuild x86:                 C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe
MSBuild version:             4.8.9032.0
C# compiler x86:             C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
C# compiler version:         4.8.9232.0
.NET Framework runtime:      4.8.1, release 533320, x86 and x64
4.8 targeting pack:          not installed
4.8.1 targeting pack/SDK:    installed
```

The solution metadata targets `.NET Framework 4.8` and `x86`. Because the
separate 4.8 reference pack is absent, `build.ps1` invokes the already
installed 32-bit Framework compiler directly and limits the source to APIs
available in .NET Framework 4.8. Nothing is downloaded or restored.

## Bridge design

The process has one synchronous stdin worker and no listener. A fixed mapping
is the only route to EDIABAS:

```text
health                   -> no EDIABAS call
tmode-info               -> TMODE / INFO
tmode-initialisierung    -> TMODE / INITIALISIERUNG
```

There is no request property for an arbitrary ECU or job. Unknown commands are
rejected during the allowlist phase. Each EDIABAS attempt is closed with
`apiEnd()` in `finally`, including a partially failed initialization attempt.
The native DLL search path and ECU path are process/session-local and reset
after each request.

## Verification

```text
Build:                    passed
PE machine:               0x014C (I386)
CLR flags:                0x00000003 (ILONLY, 32BITREQUIRED)
Runtime IntPtr.Size:      4
Vehicle-free tests:       9 passed, 0 failed
health:                   passed
TMODE / INFO:             passed
TMODE / INITIALISIERUNG:  passed
Process exit code:        0
stdout JSON lines:        3
stderr bytes:             0
```

## Exact final JSON output

```json
{"success":true,"command":"health","ecu":null,"job":null,"durationMs":141,"results":{"processBitness":32,"ediabasBinPath":"C:\\EDIABAS\\Bin","ecuPath":"C:\\EDIABAS\\ECU","mode":"TMODE_ONLY"},"error":null}
{"success":true,"command":"tmode-info","ecu":"TMODE","job":"INFO","durationMs":5792,"results":[{"OBJECT":"tmode","SAETZE":1,"JOBNAME":"INFO","VARIANTE":"TMODE","JOBSTATUS":"","UBATTCURRENT":-1,"UBATTHISTORY":-1,"IGNITIONCURRENT":-1,"IGNITIONHISTORY":-1},{"ECU":"TMODE","AUTHOR":"Softing Ta, Softing WT","ORIGIN":"BMW VS-43 Leipold","COMMENT":"Erstellung aus TMODE.B1V, Version 1.3","PACKAGE":"1.29","SPRACHE":"deutsch","REVISION":"1.40"}],"error":null}
{"success":true,"command":"tmode-initialisierung","ecu":"TMODE","job":"INITIALISIERUNG","durationMs":5130,"results":[{"OBJECT":"tmode","SAETZE":1,"JOBNAME":"INITIALISIERUNG","VARIANTE":"TMODE","JOBSTATUS":"","UBATTCURRENT":-1,"UBATTHISTORY":-1,"IGNITIONCURRENT":-1,"IGNITIONHISTORY":-1},{"DONE":1}],"error":null}
```

`durationMs` is measured and will vary between runs. Every diagnostic field
shown above was returned by EDIABAS.

## Protected-file verification

SHA-256 was measured immediately before and after the final build/test/TMODE
run:

```text
C:\EDIABAS\Bin\EDIABAS.INI
11606DC5ACC838B332A898F5DD8B23965CCF822C61E76642309D3BBD59AB7A98 unchanged

C:\EDIABAS\Bin\obd.ini
DDAF2C69A90D3B4896A964649790836248EDAEE731DEA15933868339430BC265 unchanged

C:\EDIABAS\Bin\NET\4.0\apiNET32.dll
E5B66D123959BDB5F3F47D20B8674E25064F021E3535AD2B06E77B510D99878C unchanged

C:\EDIABAS\Bin\api32.dll
15265157215B814F44397DF49C9964448F5F0A9F8A02E1B432406C92E6215A48 unchanged
```

## Created files

Source and documentation:

```text
InpaAi.Bridge.sln
build.ps1
README.md
PHASE-1A-REPORT.md
docs\apiNET32-public-api.md
src\InpaAi.Bridge\App.config
src\InpaAi.Bridge\AssemblyInfo.cs
src\InpaAi.Bridge\BridgeApplication.cs
src\InpaAi.Bridge\BridgeModels.cs
src\InpaAi.Bridge\CommandPolicy.cs
src\InpaAi.Bridge\EdiabasClient.cs
src\InpaAi.Bridge\InpaAi.Bridge.csproj
src\InpaAi.Bridge\JsonLineProtocol.cs
src\InpaAi.Bridge\Program.cs
tests\InpaAi.Bridge.Tests\InpaAi.Bridge.Tests.csproj
tests\InpaAi.Bridge.Tests\TestProgram.cs
```

Generated Release artifacts:

```text
artifacts\Release\bridge\apiNET32.dll
artifacts\Release\bridge\InpaAi.Bridge.exe
artifacts\Release\bridge\InpaAi.Bridge.exe.config
artifacts\Release\bridge\InpaAi.Bridge.pdb
artifacts\Release\tests\apiNET32.dll
artifacts\Release\tests\InpaAi.Bridge.exe
artifacts\Release\tests\InpaAi.Bridge.Tests.exe
artifacts\Release\tests\InpaAi.Bridge.Tests.exe.config
artifacts\Release\tests\InpaAi.Bridge.Tests.pdb
```
