param(
    [switch]$SeparateWindows,
    [switch]$NoBrowser,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

& "$PSScriptRoot\scripts\dev.ps1" @PSBoundParameters
