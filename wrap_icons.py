import re
import glob

def wrap_i_tags(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to match <i className="...">...</i> or <i className="..." />
    # but only if not already preceded by <span>
    
    # 1. Self-closing <i />
    content = re.sub(r'(?<!<span>)(<i\s+className=[^>]*?/>)', r'<span>\1</span>', content)
    
    # 2. Open/close <i ...></i> or <i ...> ... </i>
    content = re.sub(r'(?<!<span>)(<i\s+className=[^>]*?>.*?</i>)', r'<span>\1</span>', content, flags=re.DOTALL)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

files = glob.glob('d:/Tilder - Copy/desktop-app/src/**/*.jsx', recursive=True)
for file in files:
    if 'filePioneer' not in file and 'App' not in file and 'OutlineView' not in file and 'TrashView' not in file:
        try:
            wrap_i_tags(file)
            print(f"Wrapped icons in {file}")
        except Exception as e:
            print(f"Error processing {file}: {e}")
