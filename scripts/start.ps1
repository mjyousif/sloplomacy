param(
    [switch]$SeparateWindows,
    [switch]$NoBrowser,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

& "$PSScriptRoot\dev.ps1" @PSBoundParameters
