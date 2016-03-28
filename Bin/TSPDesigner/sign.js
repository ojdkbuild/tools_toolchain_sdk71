/**********************************************************************
Description:

    This jscript should be invoked in admin privilege, since it may need to import the
    certificate to system store. And the first run of signtool needs to register capicom.dll
    into user's system too.
    We will firstly try to sign the file without generating new certificate. If failed, we will
    generate a new one to use.
    
Arguments:

    The file full path to be signed.

Return value:

    Return 0 if succeeds.

Dependencies:

    We will call the Makecert.exe, CertMgr.exe and Signtool.exe
    
**********************************************************************/
var ObjArgs = WScript.Arguments;
var wshShell = WScript.CreateObject("WScript.Shell");
var wshEnv = wshShell.Environment("Process");
var SignFileFullPath;
var ImportCert;
var CertName = "TestWindowsTroubleShooting.cer";
var CertStore = "TestWindowsTroubleShooting";
var SubjectName = "TestCertforWindowsTroubleShooting";
var StdOutStr = "";
var StdErrStr = "";
var Result = 0;
var BadURLErrorCode = 10014;
var CurrentDir = WScript.ScriptFullName.substr(0, WScript.ScriptFullName.length-WScript.ScriptName.length);
wshShell.CurrentDirectory = CurrentDir;
//var ExternalToolRoot = CurrentDir;
var TimeStampingServiceURL = "";

if(3 > ObjArgs.length ||
    4 < ObjArgs.length) {
   WScript.StdErr.WriteLine("[Usage]: Sign.js <string - file name> <bool - import certificate> <string - external tool root path> <string(optional) - time stamping service URL for sign.>");
   WScript.Quit(1);
}

// Get the arguments first
SignFileFullPath = ObjArgs(0);
ImportCert = ObjArgs(1);
ExternalToolRoot = ObjArgs(2);
if(4 == ObjArgs.length) {
    TimeStampingServiceURL = ObjArgs(3);
}

if("0"==ImportCert || "false"==ImportCert.toLowerCase()) {
    Result = SignAndVerify(SignFileFullPath);
    ExitPoint();
}
else {
    // Try to create new certificate
    Result = GenCertAndImport();
    if(0 != Result) {
        ExitPoint();
    }

    Result = SignAndVerify(SignFileFullPath);
    ExitPoint();
}

/***********************************************************************
Routine Description:

    Invoke external binaries: CertMgr.exe and Makecert.exe.
    Generate the new certificate and import it to system store.
    
Arguments:


Return value:

    Return 0 if succeeds.
***********************************************************************/
function GenCertAndImport() 
{
    
    // Delete all the certificates in the old certificate store
    var RetFromExe = InvokeExe(ExternalToolRoot + "\\CertMgr.exe -del -c -all -s "+CertStore);
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
    // Make a new certificate and put it in the certificate store
    RetFromExe = InvokeExe(ExternalToolRoot + "\\Makecert.exe -r -pe -ss "+CertStore+" -n \"CN="+SubjectName+"\" -eku 1.3.6.1.5.5.7.3.3 \""+CurrentDir+"\\"+CertName+"\"");
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
    // Import the new certificate to localmachine root
    RetFromExe = InvokeExe(ExternalToolRoot + "\\Certmgr.exe -add \""+CurrentDir+"\\"+CertName+"\" -s -r localMachine root");
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
    // Import the new certificate to localmachine trustedpublisher
    RetFromExe = InvokeExe(ExternalToolRoot + "\\Certmgr.exe -add \""+CurrentDir+"\\"+CertName+"\" -s -r localMachine trustedpublisher ");
    if(0 != RetFromExe) {
        return RetFromExe;
    }

cleanup:
    return 0;
}

/***********************************************************************
Routine Description:

    Sign the file with existing certificate.
    
Arguments:

    The full path of the file to be signed.

Return value:

    Return 0 if succeeds.
***********************************************************************/
function SignAndVerify(FileFullPath) 
{    
    // Sign the file with the existing certificate
    var SignToolCommand;
    
    SignToolCommand = ExternalToolRoot + "\\Signtool.exe sign -a -n  "+SubjectName+" -s "+CertStore+" \""+FileFullPath+"\"";
    var RetFromExe = InvokeExe(SignToolCommand);
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
    // Verify the signature of the file
    RetFromExe = InvokeExe(ExternalToolRoot + "\\Signtool.exe verify -pa -v \""+FileFullPath+"\"");
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
    if ("" != TimeStampingServiceURL) {
        SignToolCommand = ExternalToolRoot + "\\Signtool.exe sign -a -n  "+SubjectName+" -s "+CertStore+" -t \"" + TimeStampingServiceURL + "\" \""+FileFullPath+"\"";
        
        RetFromExe = InvokeExe(SignToolCommand);
        if(0 != RetFromExe) {
            return BadURLErrorCode;
        }
    }
    
    // Verify the signature of the file
    RetFromExe = InvokeExe(ExternalToolRoot + "\\Signtool.exe verify -pa -v \""+FileFullPath+"\"");
    if(0 != RetFromExe) {
        return RetFromExe;
    }
    
cleanup:
    return 0;
}

/***********************************************************************
Routine Description:

    Output all stdout and stderr message.
    
Arguments:


Return value:

    void
***********************************************************************/
function ExitPoint()
{
    WScript.StdOut.WriteLine(StdOutStr);
    WScript.StdErr.WriteLine(StdErrStr);
    WScript.Quit(Result);    
}

/***********************************************************************
Routine Description:

    Reset stdout and stderr buffers.
    
Arguments:


Return value:

    void
***********************************************************************/
function CleanBuffer()
{
    StdOutStr = "";
    StdErrStr = "";
}

/***********************************************************************
Routine Description:

    Invoke external binary and append its stdout and stderr to our buffer.
    
Arguments:

    The file full path of the external binary.

Return value:

    Return 0 if succeeds.
***********************************************************************/
function InvokeExe(FullCommand) 
{
    if(null == FullCommand) {
        return 1;
    }

    var line;
    try {
        var objExec=wshShell.Exec(FullCommand);

        while(objExec.Status == 0) {
            WScript.sleep(300);        }

        for(num=1;!objExec.StdOut.AtEndOfStream;num++) {
            StdOutStr += objExec.StdOut.ReadLine();
            StdOutStr += "\n";
        }
        StdOutStr += "\n\n";
        
        // Write to stderr
        for(num=1;!objExec.StdErr.AtEndOfStream;num++) {
            StdErrStr += objExec.StdErr.ReadLine();
            StdOutStr += "\n";
        }
    }
    catch (e) {
        StdErrStr += "Error message: " + (e.message ? e.message : e) + "\n";
        return 1;
    }
    

    return objExec.ExitCode;
}

// SIG // Begin signature block
// SIG // MIIXNAYJKoZIhvcNAQcCoIIXJTCCFyECAQExCzAJBgUr
// SIG // DgMCGgUAMGcGCisGAQQBgjcCAQSgWTBXMDIGCisGAQQB
// SIG // gjcCAR4wJAIBAQQQEODJBs441BGiowAQS9NQkAIBAAIB
// SIG // AAIBAAIBAAIBADAhMAkGBSsOAwIaBQAEFOz6mtG1/KQ2
// SIG // UR93c20xLugcY4wmoIISMTCCBGAwggNMoAMCAQICCi6r
// SIG // EdxQ/1ydy8AwCQYFKw4DAh0FADBwMSswKQYDVQQLEyJD
// SIG // b3B5cmlnaHQgKGMpIDE5OTcgTWljcm9zb2Z0IENvcnAu
// SIG // MR4wHAYDVQQLExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // ITAfBgNVBAMTGE1pY3Jvc29mdCBSb290IEF1dGhvcml0
// SIG // eTAeFw0wNzA4MjIyMjMxMDJaFw0xMjA4MjUwNzAwMDBa
// SIG // MHkxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5n
// SIG // dG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVN
// SIG // aWNyb3NvZnQgQ29ycG9yYXRpb24xIzAhBgNVBAMTGk1p
// SIG // Y3Jvc29mdCBDb2RlIFNpZ25pbmcgUENBMIIBIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt3l91l2zRTmo
// SIG // NKwx2vklNUl3wPsfnsdFce/RRujUjMNrTFJi9JkCw03Y
// SIG // SWwvJD5lv84jtwtIt3913UW9qo8OUMUlK/Kg5w0jH9FB
// SIG // JPpimc8ZRaWTSh+ZzbMvIsNKLXxv2RUeO4w5EDndvSn0
// SIG // ZjstATL//idIprVsAYec+7qyY3+C+VyggYSFjrDyuJSj
// SIG // zzimUIUXJ4dO3TD2AD30xvk9gb6G7Ww5py409rQurwp9
// SIG // YpF4ZpyYcw2Gr/LE8yC5TxKNY8ss2TJFGe67SpY7UFMY
// SIG // zmZReaqth8hWPp+CUIhuBbE1wXskvVJmPZlOzCt+M26E
// SIG // RwbRntBKhgJuhgCkwIffUwIDAQABo4H6MIH3MBMGA1Ud
// SIG // JQQMMAoGCCsGAQUFBwMDMIGiBgNVHQEEgZowgZeAEFvQ
// SIG // cO9pcp4jUX4Usk2O/8uhcjBwMSswKQYDVQQLEyJDb3B5
// SIG // cmlnaHQgKGMpIDE5OTcgTWljcm9zb2Z0IENvcnAuMR4w
// SIG // HAYDVQQLExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xITAf
// SIG // BgNVBAMTGE1pY3Jvc29mdCBSb290IEF1dGhvcml0eYIP
// SIG // AMEAizw8iBHRPvZj7N9AMA8GA1UdEwEB/wQFMAMBAf8w
// SIG // HQYDVR0OBBYEFMwdznYAcFuv8drETppRRC6jRGPwMAsG
// SIG // A1UdDwQEAwIBhjAJBgUrDgMCHQUAA4IBAQB7q65+Siby
// SIG // zrxOdKJYJ3QqdbOG/atMlHgATenK6xjcacUOonzzAkPG
// SIG // yofM+FPMwp+9Vm/wY0SpRADulsia1Ry4C58ZDZTX2h6t
// SIG // KX3v7aZzrI/eOY49mGq8OG3SiK8j/d/p1mkJkYi9/uEA
// SIG // uzTz93z5EBIuBesplpNCayhxtziP4AcNyV1ozb2AQWtm
// SIG // qLu3u440yvIDEHx69dLgQt97/uHhrP7239UNs3DWkuNP
// SIG // tjiifC3UPds0C2I3Ap+BaiOJ9lxjj7BauznXYIxVhBoz
// SIG // 9TuYoIIMol+Lsyy3oaXLq9ogtr8wGYUgFA0qvFL0QeBe
// SIG // MOOSKGmHwXDi86erzoBCcnYOMIIEejCCA2KgAwIBAgIK
// SIG // YQHPPgAAAAAADzANBgkqhkiG9w0BAQUFADB5MQswCQYD
// SIG // VQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4G
// SIG // A1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0
// SIG // IENvcnBvcmF0aW9uMSMwIQYDVQQDExpNaWNyb3NvZnQg
// SIG // Q29kZSBTaWduaW5nIFBDQTAeFw0wOTEyMDcyMjQwMjla
// SIG // Fw0xMTAzMDcyMjQwMjlaMIGDMQswCQYDVQQGEwJVUzET
// SIG // MBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVk
// SIG // bW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMQ0wCwYDVQQLEwRNT1BSMR4wHAYDVQQDExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24wggEiMA0GCSqGSIb3DQEB
// SIG // AQUAA4IBDwAwggEKAoIBAQC9MIn7RXKoU2ueiU8AI8C+
// SIG // 1B09sVlAOPNzkYIm5pYSAFPZHIIOPM4du733Qo2X1Pw4
// SIG // GuS5+ePs02EDv6DT1nVNXEap7V7w0uJpWxpz6rMcjQTN
// SIG // KUSgZFkvHphdbserGDmCZcSnvKt1iBnqh5cUJrN/Jnak
// SIG // 1Dg5hOOzJtUY+Svp0skWWlQh8peNh4Yp/vRJLOaL+AQ/
// SIG // fc3NlpKGDXED4tD+DEI1/9e4P92ORQp99tdLrVvwdnId
// SIG // dyN9iTXEHF2yUANLR20Hp1WImAaApoGtVE7Ygdb6v0LA
// SIG // Mb5VDZnVU0kSMOvlpYh8XsR6WhSHCLQ3aaDrMiSMCOv5
// SIG // 1BS64PzN6qQVAgMBAAGjgfgwgfUwEwYDVR0lBAwwCgYI
// SIG // KwYBBQUHAwMwHQYDVR0OBBYEFDh4BXPIGzKbX5KGVa+J
// SIG // usaZsXSOMA4GA1UdDwEB/wQEAwIHgDAfBgNVHSMEGDAW
// SIG // gBTMHc52AHBbr/HaxE6aUUQuo0Rj8DBEBgNVHR8EPTA7
// SIG // MDmgN6A1hjNodHRwOi8vY3JsLm1pY3Jvc29mdC5jb20v
// SIG // cGtpL2NybC9wcm9kdWN0cy9DU1BDQS5jcmwwSAYIKwYB
// SIG // BQUHAQEEPDA6MDgGCCsGAQUFBzAChixodHRwOi8vd3d3
// SIG // Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL0NTUENBLmNy
// SIG // dDANBgkqhkiG9w0BAQUFAAOCAQEAKAODqxMN8f4Rb0J2
// SIG // 2EOruMZC+iRlNK51sHEwjpa2g/py5P7NN+c6cJhRIA66
// SIG // cbTJ9NXkiugocHPV7eHCe+7xVjRagILrENdyA+oSTuzd
// SIG // DYx7RE8MYXX9bpwH3c4rWhgNObBg/dr/BKoCo9j6jqO7
// SIG // vcFqVDsxX+QsbsvxTSoc8h52e4avxofWsSrtrMwOwOSf
// SIG // f+jP6IRyVIIYbirInpW0Gh7Bb5PbYqbBS2utye09kuOy
// SIG // L6t6dzlnagB7gp0DEN5jlUkmQt6VIsGHC9AUo1/cczJy
// SIG // Nh7/yCnFJFJPZkjJHR2pxSY5aVBOp+zCBmwuchvxIdpt
// SIG // JEiAgRVAfJ/MdDhKTzCCBJ0wggOFoAMCAQICEGoLmU/A
// SIG // ACWrEdtFH1h6Z6IwDQYJKoZIhvcNAQEFBQAwcDErMCkG
// SIG // A1UECxMiQ29weXJpZ2h0IChjKSAxOTk3IE1pY3Jvc29m
// SIG // dCBDb3JwLjEeMBwGA1UECxMVTWljcm9zb2Z0IENvcnBv
// SIG // cmF0aW9uMSEwHwYDVQQDExhNaWNyb3NvZnQgUm9vdCBB
// SIG // dXRob3JpdHkwHhcNMDYwOTE2MDEwNDQ3WhcNMTkwOTE1
// SIG // MDcwMDAwWjB5MQswCQYDVQQGEwJVUzETMBEGA1UECBMK
// SIG // V2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwG
// SIG // A1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSMwIQYD
// SIG // VQQDExpNaWNyb3NvZnQgVGltZXN0YW1waW5nIFBDQTCC
// SIG // ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANw3
// SIG // bvuvyEJKcRjIzkg+U8D6qxS6LDK7Ek9SyIPtPjPZSTGS
// SIG // KLaRZOAfUIS6wkvRfwX473W+i8eo1a5pcGZ4J2botrfv
// SIG // hbnN7qr9EqQLWSIpL89A2VYEG3a1bWRtSlTb3fHev5+D
// SIG // x4Dff0wCN5T1wJ4IVh5oR83ZwHZcL322JQS0VltqHGP/
// SIG // gHw87tUEJU05d3QHXcJc2IY3LHXJDuoeOQl8dv6dbG56
// SIG // 4Ow+j5eecQ5fKk8YYmAyntKDTisiXGhFi94vhBBQsvm1
// SIG // Go1s7iWbE/jLENeFDvSCdnM2xpV6osxgBuwFsIYzt/iU
// SIG // W4RBhFiFlG6wHyxIzG+cQ+Bq6H8mjmsCAwEAAaOCASgw
// SIG // ggEkMBMGA1UdJQQMMAoGCCsGAQUFBwMIMIGiBgNVHQEE
// SIG // gZowgZeAEFvQcO9pcp4jUX4Usk2O/8uhcjBwMSswKQYD
// SIG // VQQLEyJDb3B5cmlnaHQgKGMpIDE5OTcgTWljcm9zb2Z0
// SIG // IENvcnAuMR4wHAYDVQQLExVNaWNyb3NvZnQgQ29ycG9y
// SIG // YXRpb24xITAfBgNVBAMTGE1pY3Jvc29mdCBSb290IEF1
// SIG // dGhvcml0eYIPAMEAizw8iBHRPvZj7N9AMBAGCSsGAQQB
// SIG // gjcVAQQDAgEAMB0GA1UdDgQWBBRv6E4/l7k0q0uGj7yc
// SIG // 6qw7QUPG0DAZBgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMA
// SIG // QTALBgNVHQ8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAN
// SIG // BgkqhkiG9w0BAQUFAAOCAQEAlE0RMcJ8ULsRjqFhBwEO
// SIG // jHBFje9zVL0/CQUt/7hRU4Uc7TmRt6NWC96Mtjsb0fus
// SIG // p8m3sVEhG28IaX5rA6IiRu1stG18IrhG04TzjQ++B4o2
// SIG // wet+6XBdRZ+S0szO3Y7A4b8qzXzsya4y1Ye5y2PENtEY
// SIG // Ib923juasxtzniGI2LS0ElSM9JzCZUqaKCacYIoPO8cT
// SIG // ZXhIu8+tgzpPsGJY3jDp6Tkd44ny2jmB+RMhjGSAYwYE
// SIG // lvKaAkMve0aIuv8C2WX5St7aA3STswVuDMyd3ChhfEjx
// SIG // F5wRITgCHIesBsWWMrjlQMZTPb2pid7oZjeN9CKWnMyw
// SIG // d1RROtZyRLIj9jCCBKowggOSoAMCAQICCmEGlC0AAAAA
// SIG // AAkwDQYJKoZIhvcNAQEFBQAweTELMAkGA1UEBhMCVVMx
// SIG // EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
// SIG // ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3Jh
// SIG // dGlvbjEjMCEGA1UEAxMaTWljcm9zb2Z0IFRpbWVzdGFt
// SIG // cGluZyBQQ0EwHhcNMDgwNzI1MTkwMjE3WhcNMTMwNzI1
// SIG // MTkxMjE3WjCBszELMAkGA1UEBhMCVVMxEzARBgNVBAgT
// SIG // Cldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAc
// SIG // BgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjENMAsG
// SIG // A1UECxMETU9QUjEnMCUGA1UECxMebkNpcGhlciBEU0Ug
// SIG // RVNOOjdBODItNjg4QS05RjkyMSUwIwYDVQQDExxNaWNy
// SIG // b3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIIBIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlYEKIEIYUXrZ
// SIG // le2b/dyH0fsOjxPqqjcoEnb+TVCrdpcqk0fgqVZpAuWU
// SIG // fk2F239x73UA27tDbPtvrHHwK9F8ks6UF52hxbr5937d
// SIG // YeEtMB6cJi12P+ZGlo6u2Ik32Mzv889bw/xo4PJkj5vo
// SIG // wxL5o76E/NaLzgU9vQF2UCcD+IS3FoaNYL5dKSw8z6X9
// SIG // mFo1HU8WwDjYHmE/PTazVhQVd5U7EPoAsJPiXTerJ7tj
// SIG // LEgUgVXjbOqpK5WNiA5+owCldyQHmCpwA7gqJJCa3sWi
// SIG // Iku/TFkGd1RyQ7A+ZN2ThAhYtv7ph0kJNrOz+DOpfkyi
// SIG // eX8yWSkOnrX14DyeP+xGOwIDAQABo4H4MIH1MB0GA1Ud
// SIG // DgQWBBQolYi/Ajvr2pS6fUYP+sv0fp3/0TAfBgNVHSME
// SIG // GDAWgBRv6E4/l7k0q0uGj7yc6qw7QUPG0DBEBgNVHR8E
// SIG // PTA7MDmgN6A1hjNodHRwOi8vY3JsLm1pY3Jvc29mdC5j
// SIG // b20vcGtpL2NybC9wcm9kdWN0cy90c3BjYS5jcmwwSAYI
// SIG // KwYBBQUHAQEEPDA6MDgGCCsGAQUFBzAChixodHRwOi8v
// SIG // d3d3Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL3RzcGNh
// SIG // LmNydDATBgNVHSUEDDAKBggrBgEFBQcDCDAOBgNVHQ8B
// SIG // Af8EBAMCBsAwDQYJKoZIhvcNAQEFBQADggEBAADurPzi
// SIG // 0ohmyinjWrnNAIJ+F1zFJFkSu6j3a9eH/o3LtXYfGyL2
// SIG // 9+HKtLlBARo3rUg3lnD6zDOnKIy4C7Z0Eyi3s3XhKgni
// SIG // i0/fmD+XtzQSgeoQ3R3cumTPTlA7TIr9Gd0lrtWWh+pL
// SIG // xOXw+UEXXQHrV4h9dnrlb/6HIKyTnIyav18aoBUwJOCi
// SIG // fmGRHSkpw0mQOkODie7e1YPdTyw1O+dBQQGqAAwL8tZJ
// SIG // G85CjXuw8y2NXSnhvo1/kRV2tGD7FCeqbxJjQihYOoo7
// SIG // i0Dkt8XMklccRlZrj8uSTVYFAMr4MEBFTt8ZiL31EPDd
// SIG // Gt8oHrRR8nfgJuO7CYES3B460EUxggRvMIIEawIBATCB
// SIG // hzB5MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGlu
// SIG // Z3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMV
// SIG // TWljcm9zb2Z0IENvcnBvcmF0aW9uMSMwIQYDVQQDExpN
// SIG // aWNyb3NvZnQgQ29kZSBTaWduaW5nIFBDQQIKYQHPPgAA
// SIG // AAAADzAJBgUrDgMCGgUAoIGaMBkGCSqGSIb3DQEJAzEM
// SIG // BgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAMBgor
// SIG // BgEEAYI3AgEVMCMGCSqGSIb3DQEJBDEWBBQ46WInr23o
// SIG // /WzzprtbU/Hmy22P9zA6BgorBgEEAYI3AgEMMSwwKqAQ
// SIG // gA4AcwBpAGcAbgAuAGoAc6EWgBRodHRwOi8vbWljcm9z
// SIG // b2Z0LmNvbTANBgkqhkiG9w0BAQEFAASCAQBY2vP5zKcQ
// SIG // b43/ah5RBgWKaRAmlz8SwuMisTOq/XN8eV2EFMcnfB7W
// SIG // YXKFJQEA3uzOTLG2qBkh37XpER1HtxTmaUn/AKY33LRR
// SIG // qGCsrGGAG2Ny2oatdW9a7scA4fyT3weT6gPVl4oLZrLs
// SIG // BFGGXEF/1dUoj64Xstm57Bf12gb9gDGaz/tc8/oyuOHD
// SIG // AOHNPrgSgigWnhaIBdqOBml9hMxrSbqjg3LOqYPlHhfD
// SIG // M8B5oUsXkg3YiIiETnhxtYmstJ8qUnE1mAw9Kc3tXWl5
// SIG // 5nhAKnpWK/xfS48vk5J0gFZ/+zZBFQqlEMoUmL3ZFAxG
// SIG // 0FGR2/kxuOvroQG/YDc6lO+RoYICHzCCAhsGCSqGSIb3
// SIG // DQEJBjGCAgwwggIIAgEBMIGHMHkxCzAJBgNVBAYTAlVT
// SIG // MRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdS
// SIG // ZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9y
// SIG // YXRpb24xIzAhBgNVBAMTGk1pY3Jvc29mdCBUaW1lc3Rh
// SIG // bXBpbmcgUENBAgphBpQtAAAAAAAJMAcGBSsOAwIaoF0w
// SIG // GAYJKoZIhvcNAQkDMQsGCSqGSIb3DQEHATAcBgkqhkiG
// SIG // 9w0BCQUxDxcNMTAwNTE0MDUzOTM1WjAjBgkqhkiG9w0B
// SIG // CQQxFgQU2NDls86+sZtvnyOsCApkCN+xUNMwDQYJKoZI
// SIG // hvcNAQEFBQAEggEAHai9wHsNFhs6gfe6eIa4Qyg9VLcP
// SIG // 3sHTNHOUc1b2cEWUOqbJGQ2bOBpfONgZTuB17jlKqdLZ
// SIG // kGf+HeGUCPRzt5AnP3z8ZYIuhzUOdeEw+43AIAaoWwTV
// SIG // MezkoGfj89kdzUVg8V+URQLW22ZqRvJtkPv1D3HxK2JX
// SIG // m25ju7gGChMu+GlNjRMoCwyfMOHOD3JF8djCO9qzdjpd
// SIG // tawid1SaZ16LtqPhYsFBTo8rvVyEvPV8m5vECKDBXGfc
// SIG // I1MtqPKkti4Z8kjKVbStezwGeLBOSrC2D7syYwhpPCpa
// SIG // sRhiYGRkKVhGi+6KTKYkYiTaGFVYEAVPkaRMgGiiEEFJ
// SIG // niq6EQ==
// SIG // End signature block
