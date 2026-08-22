import re
import json

with open('src/components/SideBar/SideBar.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add 'hardware' to DEFAULT_ORDER
content = content.replace(
    "const DEFAULT_ORDER = ['explorer', 'search', 'extensions', 'debug', 'tests', 'git', 'github', 'backpack'];",
    "const DEFAULT_ORDER = ['explorer', 'search', 'extensions', 'debug', 'tests', 'git', 'github', 'backpack', 'hardware'];"
)

# Also fix the length check for localStorage to allow migration
content = content.replace(
    "if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length)",
    "if (Array.isArray(saved) && saved.length >= DEFAULT_ORDER.length - 1)"
)
content = content.replace(
    "return saved;",
    "return Array.from(new Set([...saved, ...DEFAULT_ORDER]));"
)

# Add the hardware icon definition
hw_icon_def = '''
    hardware: {
      show: true,
      id: "hardware",
      title: "Hardware Manager",
      onClick: props.toggleAriaExpandedhardware,
      iconClass: "fa-solid fa-microchip fa-xl"
    },'''

content = content.replace(
    "backpack: {",
    hw_icon_def.lstrip() + "\n    backpack: {"
)

with open('src/components/SideBar/SideBar.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
