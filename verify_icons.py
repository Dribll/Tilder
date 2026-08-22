import re
import glob

files = glob.glob('d:/Tilder - Copy/desktop-app/src/**/*.jsx', recursive=True)
total = 0
for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    # Find <i className="fa-..."> not preceded by <span>
    matches = re.findall(r'(?<!<span>)(<i\s+className=["\'{`]fa-[^>]*?>)', content)
    if matches:
        print(f"{f}: {len(matches)} unwrapped <i> tags")
        total += len(matches)

print(f"\nTotal unwrapped: {total}")
