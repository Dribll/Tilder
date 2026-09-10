$content = Get-Content "d:\Tilder - Copy\desktop-app\src\App.css" -Raw

$dropdownOld = @"
.dropdown-content {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background-color: var(--content-box-bg-color);
    min-width: 260px;
    max-width: 320px;
    width: max-content;
    box-shadow: 0px 8px 16px 0px rgb(53, 53, 53);
    padding-left: 9px;
    padding-right: 11px;
    padding-bottom: 9px;
    padding-top: 9px;
    border-radius: 5px;
}
"@

$dropdownNew = @"
.dropdown-content {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background-color: var(--content-box-bg-color);
    min-width: 180px;
    max-width: 320px;
    width: max-content;
    box-shadow: 0px 8px 16px 0px rgb(53, 53, 53);
    padding: 6px 0;
    border-radius: 5px;
    z-index: 999;
}

.dropdown-content ul {
    margin: 0;
    padding: 0;
    list-style: none;
}
"@

$content = $content.Replace($dropdownOld.Replace("`r", ""), $dropdownNew.Replace("`r", ""))
$content = $content.Replace($dropdownOld, $dropdownNew)

$subOld = @"
.subdropdown-content {
    display: none;
    top: -6px;
    left: calc(100% + 8px);
    margin-top: 0;
    margin-left: 0;
    background-color: var(--subdropdown-box-bg-color);
    min-width: 240px;
    max-width: 300px;
    width: max-content;
    box-shadow: 0px 7px 15px 0px rgb(53, 53, 53);
    padding-left: 10px;
    padding-right: 12px;
    padding-bottom: 12px;
    padding-top: 4px;
    border-radius: 6px;
    position: absolute;
}
"@

$subNew = @"
.subdropdown-content {
    display: none;
    top: -6px;
    left: calc(100% + 8px);
    margin-top: 0;
    margin-left: 0;
    background-color: var(--subdropdown-box-bg-color);
    min-width: 180px;
    max-width: 300px;
    width: max-content;
    box-shadow: 0px 7px 15px 0px rgb(53, 53, 53);
    padding: 6px 0;
    border-radius: 6px;
    position: absolute;
}

.subdropdown-content ul {
    margin: 0;
    padding: 0;
    list-style: none;
}
"@

$content = $content.Replace($subOld.Replace("`r", ""), $subNew.Replace("`r", ""))
$content = $content.Replace($subOld, $subNew)

$liOld1 = @"
.dropdown-content li {
    padding: 4px 12px;
    margin: 0;
    border-radius: 2px;
    cursor: pointer;
    line-height: 18px;
    transition: background-color 0.1s ease;
}
"@

$liNew1 = @"
.dropdown-content li {
    padding: 4px 16px;
    margin: 0;
    border-radius: 0;
    cursor: pointer;
    line-height: 18px;
    transition: background-color 0.1s ease;
}
"@
$content = $content.Replace($liOld1.Replace("`r", ""), $liNew1.Replace("`r", ""))
$content = $content.Replace($liOld1, $liNew1)

$liOld2 = @"
.subdropdown-content li {
    padding: 3px 8px;
    margin: 1px 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.1s ease;
}
"@

$liNew2 = @"
.subdropdown-content li {
    padding: 4px 16px;
    margin: 0;
    border-radius: 0;
    cursor: pointer;
    line-height: 18px;
    transition: background-color 0.1s ease;
}
"@
$content = $content.Replace($liOld2.Replace("`r", ""), $liNew2.Replace("`r", ""))
$content = $content.Replace($liOld2, $liNew2)

Set-Content -Path "d:\Tilder - Copy\desktop-app\src\App.css" -Value $content
