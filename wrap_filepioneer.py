import re

file_path = 'd:/Tilder - Copy/desktop-app/src/components/SideBar/Main Components/filePioneer/filePioneer.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Self-closing <i className="..." /> or <i className={...} />
# Only wrap if not already inside a <span>
# We process in one pass using a function

def wrap_i_tags(text):
    # Wrap self-closing: <i className="..."/> but not <span><i...
    text = re.sub(
        r'(?<!<span>)(<i\s+className=[^>]*?/>)',
        r'<span>\1</span>',
        text
    )
    # Wrap open/close: <i className="...">...</i>
    text = re.sub(
        r'(?<!<span>)(<i\s+className=[^>]*?>.*?</i\s*>)',
        r'<span>\1</span>',
        text,
        flags=re.DOTALL
    )
    return text

new_content = wrap_i_tags(content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done wrapping filePioneer.jsx")

# Verify remaining bare <i> tags
remaining = re.findall(r'(?<!<span>)<i\s+className=', new_content)
print(f"Remaining unwrapped <i> tags: {len(remaining)}")
