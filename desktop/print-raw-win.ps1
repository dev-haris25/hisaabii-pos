param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HisabiRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$h = [IntPtr]::Zero
if (-not [HisabiRawPrint]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
  throw "OpenPrinter failed for $PrinterName"
}
$di = New-Object HisabiRawPrint+DOCINFO
$di.pDocName = 'Hisabi receipt'
$di.pDataType = 'RAW'
try {
  if (-not [HisabiRawPrint]::StartDocPrinter($h, 1, $di)) { throw 'StartDocPrinter failed' }
  [HisabiRawPrint]::StartPagePrinter($h) | Out-Null
  $written = 0
  if (-not [HisabiRawPrint]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) {
    throw 'WritePrinter failed'
  }
  [HisabiRawPrint]::EndPagePrinter($h) | Out-Null
  [HisabiRawPrint]::EndDocPrinter($h) | Out-Null
} finally {
  [HisabiRawPrint]::ClosePrinter($h) | Out-Null
}
