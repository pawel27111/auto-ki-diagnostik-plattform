# apiNET32.dll public API inventory

Inspected locally by reflection:

```text
Path:            C:\EDIABAS\Bin\NET\4.0\apiNET32.dll
Assembly:        apiNET32, Version=7.3.0.502, Culture=neutral, PublicKeyToken=null
File version:    7.3.0.502
Primary type:    Ediabas.API
Invocation:      public static methods
```

The signatures below are reflection output from the installed assembly. They
are not inferred names.

```csharp
void apiBreak()
bool apiCheckVersion(int versionCompatibility, out string versionInfo)
void apiEnd()
int apiErrorCode()
string apiErrorText()
bool apiGetConfig(string cfgName, out string cfgValue)
bool apiInit()
bool apiInitExt(string ifh, string unit, string app, string reserved)
void apiJob(string ecu, string job, string para, string result)
void apiJobData(string ecu, string job, byte[] para, int paralen, string result)
void apiJobExt(string ecu, string job, byte[] stdpara, int stdparalen,
    byte[] para, int paralen, string result, int reserved)
int apiJobInfo(out string infoText)
bool apiResultBinary(out byte[] buffer, out ushort bufferLen,
    string result, ushort rset)
bool apiResultBinaryExt(out byte[] buffer, out uint bufferLen,
    uint bufferSize, string result, ushort rset)
bool apiResultByte(out byte buffer, string result, ushort rset)
bool apiResultChar(out char buffer, string result, ushort rset)
bool apiResultDWord(out uint buffer, string result, ushort rset)
bool apiResultFormat(out int buffer, string result, ushort rset)
bool apiResultInt(out short buffer, string result, ushort rset)
bool apiResultLong(out int buffer, string result, ushort rset)
bool apiResultName(out string buffer, ushort index, ushort rset)
bool apiResultNumber(out ushort buffer, ushort rset)
bool apiResultReal(out double buffer, string result, ushort rset)
void apiResultsDelete(Ediabas.API.APIRESULTFIELD resultField)
bool apiResultSets(out ushort rsets)
Ediabas.API.APIRESULTFIELD apiResultsNew()
void apiResultsScope(Ediabas.API.APIRESULTFIELD resultField)
bool apiResultText(out char[] buffer, string result, ushort rset, string format)
bool apiResultText(out string buffer, string result, ushort rset, string format)
bool apiResultVar(out string var)
bool apiResultWord(out ushort buffer, string result, ushort rset)
bool apiSetConfig(string cfgName, string cfgValue)
int apiState()
int apiStateExt(int suspendTime)
bool apiSwitchDevice(string unit, string app)
void apiTrace(string msg)
bool apiXSysSetConfig(string cfgName, string cfgValue)
void closeServer()
bool enableMultiThreading(bool onOff)
bool enableServer(bool onOff)
```

Public state constants used by the bridge:

```text
APIBUSY=0
APIREADY=1
APIBREAK=2
APIERROR=3
```

Public result-format constants used for typed JSON conversion:

```text
APIFORMAT_CHAR=0
APIFORMAT_BYTE=1
APIFORMAT_INTEGER=2
APIFORMAT_WORD=3
APIFORMAT_LONG=4
APIFORMAT_DWORD=5
APIFORMAT_TEXT=6
APIFORMAT_BINARY=7
APIFORMAT_REAL=8
```

`Ediabas.API` additionally exposes the installed EDIABAS error-code constants
and the nested public value type `Ediabas.API.APIRESULTFIELD`.
