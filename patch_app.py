import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add HardwareManager component rendering
hw_manager_jsx = '''<HardwareManager
              ariaExpandedisplayhardware={panelDisplay('hardware')}
              pushNotification={pushNotification}
            />
            '''

content = content.replace("<TrashView", hw_manager_jsx + "<TrashView")

# Add toggle property to SideBar component in App.jsx
content = content.replace("toggleAriaExpandedtrash={() => toggleSidebarPanel('trashview')}", "toggleAriaExpandedhardware={() => toggleSidebarPanel('hardware')}\n              toggleAriaExpandedtrash={() => toggleSidebarPanel('trashview')}")

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
