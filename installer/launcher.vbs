Option Explicit

Dim objShell, objFSO, strDir, http, bRunning

Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Sunucu zaten calisiyor mu kontrol et
bRunning = False
Set http = CreateObject("MSXML2.XMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:3000", False
http.Send
If Err.Number = 0 Then
    If http.Status >= 200 And http.Status < 400 Then
        bRunning = True
    End If
End If
On Error GoTo 0
Set http = Nothing

' Sunucu calismiyorsa arka planda baslat
If Not bRunning Then
    objShell.Run Chr(34) & strDir & "\OkulNobet.exe" & Chr(34), 0, False
    ' Sunucunun ayaga kalkmasini bekle
    Dim i, ready
    ready = False
    For i = 1 To 20
        WScript.Sleep 500
        Set http = CreateObject("MSXML2.XMLHTTP")
        On Error Resume Next
        http.Open "GET", "http://localhost:3000", False
        http.Send
        If Err.Number = 0 Then
            If http.Status >= 200 And http.Status < 400 Then
                ready = True
            End If
        End If
        On Error GoTo 0
        Set http = Nothing
        If ready Then Exit For
    Next
End If

' Edge veya Chrome'u app modunda ac (tarayici gibi degil, bagimsiz pencere)
Dim edgePath, chromePath, appUrl, launched
appUrl = "http://localhost:3000"
launched = False

' Microsoft Edge (Windows 10/11'de her zaman yuklu)
edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
If Not objFSO.FileExists(edgePath) Then
    edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
End If

If objFSO.FileExists(edgePath) Then
    objShell.Run Chr(34) & edgePath & Chr(34) & " --app=" & appUrl & " --window-size=1366,768", 1, False
    launched = True
End If

' Edge bulunamazsa Chrome dene
If Not launched Then
    chromePath = objShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
    If Not objFSO.FileExists(chromePath) Then
        chromePath = objShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe"
    End If
    If Not objFSO.FileExists(chromePath) Then
        chromePath = objShell.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe"
    End If

    If objFSO.FileExists(chromePath) Then
        objShell.Run Chr(34) & chromePath & Chr(34) & " --app=" & appUrl & " --window-size=1366,768", 1, False
        launched = True
    End If
End If

' Hicbiri bulunamazsa varsayilan tarayicida ac
If Not launched Then
    objShell.Run appUrl
End If

Set objFSO   = Nothing
Set objShell = Nothing
