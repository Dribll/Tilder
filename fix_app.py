import re

with open('d:/Tilder - Copy/desktop-app/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

matches = re.findall(r'(?<!<span>)(<i\s+className=["\'{`]fa-[^>]*?>)', content)
print(f'App.jsx unwrapped: {len(matches)}')
for m in matches:
    print(' ', m)

# Also fix them
new_content = re.sub(r'(?<!<span>)(<i\s+className=[^>]*?/>)', r'<span>\1</span>', content)
new_content = re.sub(r'(?<!<span>)(<i\s+className=[^>]*?>.*?</i\s*>)', r'<span>\1</span>', new_content, flags=re.DOTALL)

with open('d:/Tilder - Copy/desktop-app/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("App.jsx fixed")
