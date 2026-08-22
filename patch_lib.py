import re

with open('src-tauri/src/lib.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# Add mod arduino_cmd
content = content.replace("mod native_drop;", "mod native_drop;\nmod arduino_cmd;")

# Add run_arduino_cli to generate_handler!
content = content.replace("open_external_url,", "open_external_url,\n            arduino_cmd::run_arduino_cli,")

with open('src-tauri/src/lib.rs', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
