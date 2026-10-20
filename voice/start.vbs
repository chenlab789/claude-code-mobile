' Start the voice server hidden (no console window). Put a shortcut to this in shell:startup to run at login.
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & dir & """ && if not exist logs mkdir logs && node server.js >> logs\out.txt 2>&1", 0, False
