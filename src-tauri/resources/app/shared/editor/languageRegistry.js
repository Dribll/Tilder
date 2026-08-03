import { GENERATED_MONACO_LANGUAGE_CATALOG } from './generatedMonacoLanguageCatalog.js';

function nativeLanguage(id, aliases, extensions, detail, extras = {}) {
  return {
    id,
    aliases,
    extensions,
    supportLevel: 'native',
    detail,
    ...extras,
  };
}

function lspLanguage(id, aliases, extensions, serverLabel, serverCommands, serverArgs, rootPatterns, extras = {}) {
  return {
    id,
    aliases,
    extensions,
    supportLevel: 'lsp',
    serverLabel,
    serverCommands,
    serverArgs,
    rootPatterns,
    ...extras,
  };
}

function basicLanguage(id, aliases, extensions, extras = {}) {
  return {
    id,
    aliases,
    extensions,
    supportLevel: 'basic',
    detail: 'Syntax highlighting, language mode detection, and editor basics are available.',
    ...extras,
  };
}

const nativeLanguages = [
  nativeLanguage('html', ['HTML'], ['.html', '.htm', '.xhtml'], 'Native Monaco HTML language service.', {
    family: 'markup',
  }),
  nativeLanguage('css', ['CSS'], ['.css'], 'Native Monaco CSS language service.', {
    family: 'stylesheet',
  }),
  nativeLanguage('scss', ['SCSS', 'Sass'], ['.scss', '.sass'], 'Native Monaco SCSS language service.', {
    family: 'stylesheet',
  }),
  nativeLanguage('javascript', ['JavaScript', 'JS', 'Node.js'], ['.js', '.mjs', '.cjs', '.jsx', '.es6'], 'Native Monaco JavaScript language service.', {
    family: 'javascript',
  }),
  nativeLanguage('typescript', ['TypeScript', 'TS', 'TSX'], ['.ts', '.tsx', '.mts', '.cts'], 'Native Monaco TypeScript language service.', {
    family: 'typescript',
  }),
  nativeLanguage('json', ['JSON'], [
    '.json',
    '.jsonc',
    '.webmanifest',
    '.ipynb',
    '.geojson',
    '.har',
    'package-lock.json',
    'tsconfig.json',
    'jsconfig.json',
    '.eslintrc',
    '.prettierrc',
  ], 'Native Monaco JSON language service.', {
    family: 'data',
  }),
  nativeLanguage('markdown', ['Markdown', 'MD'], ['.md', '.mdx', '.markdown', '.mkd'], 'Native Monaco Markdown language service.', {
    family: 'markup',
  }),
];

const lspLanguages = [
  lspLanguage('python', ['Python', 'Py'], ['.py', '.pyw', '.pyi'], 'Pyright', ['pyright-langserver'], ['--stdio'], ['pyproject.toml', 'setup.py', 'requirements.txt', '.git'], {
    family: 'python',
    bundled: true,
    serverPackage: 'pyright',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('javascript', ['JavaScript', 'JS', 'Node.js'], ['.js', '.mjs', '.cjs', '.jsx', '.es6'], 'TypeScript Language Server', ['typescript-language-server'], ['--stdio'], ['tsconfig.json', 'jsconfig.json', 'package.json', '.git'], {
    family: 'javascript',
    bundled: true,
    serverPackage: 'typescript-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
    detail: 'Desktop JavaScript IntelliSense via the local TypeScript language server.',
  }),
  lspLanguage('typescript', ['TypeScript', 'TS', 'TSX'], ['.ts', '.tsx', '.mts', '.cts'], 'TypeScript Language Server', ['typescript-language-server'], ['--stdio'], ['tsconfig.json', 'jsconfig.json', 'package.json', '.git'], {
    family: 'typescript',
    bundled: true,
    serverPackage: 'typescript-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
    detail: 'Desktop TypeScript IntelliSense via the local TypeScript language server.',
  }),
  lspLanguage('html', ['HTML'], ['.html', '.htm', '.xhtml'], 'HTML Language Server', ['vscode-html-language-server', 'html-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'markup',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable HTML IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'HTML IntelliSense via a locally installed HTML language server.',
  }),
  lspLanguage('css', ['CSS'], ['.css'], 'CSS Language Server', ['vscode-css-language-server', 'css-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'stylesheet',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable CSS IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'CSS IntelliSense via a locally installed CSS language server.',
  }),
  lspLanguage('scss', ['SCSS', 'Sass'], ['.scss', '.sass'], 'CSS Language Server', ['vscode-css-language-server', 'css-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'stylesheet',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable SCSS IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'SCSS/Sass IntelliSense via a locally installed CSS language server.',
  }),
  lspLanguage('less', ['LESS'], ['.less'], 'CSS Language Server', ['vscode-css-language-server', 'css-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'stylesheet',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable LESS IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'LESS IntelliSense via a locally installed CSS language server.',
  }),
  lspLanguage('json', ['JSON'], [
    '.json',
    '.jsonc',
    '.webmanifest',
    '.ipynb',
    '.geojson',
    '.har',
    'package-lock.json',
    'tsconfig.json',
    'jsconfig.json',
    '.eslintrc',
    '.prettierrc',
  ], 'JSON Language Server', ['vscode-json-language-server', 'json-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'data',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable JSON IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'JSON IntelliSense via a locally installed JSON language server.',
  }),
  lspLanguage('markdown', ['Markdown', 'MD'], ['.md', '.mdx', '.markdown', '.mkd'], 'Markdown Language Server', ['vscode-markdown-language-server', 'markdown-languageserver'], ['--stdio'], ['package.json', '.git'], {
    family: 'markup',
    installHint: 'Install vscode-langservers-extracted globally via npm to enable Markdown IntelliSense.',
    installCommandWindows: 'npm install -g vscode-langservers-extracted',
    detail: 'Markdown IntelliSense via a locally installed Markdown language server.',
  }),
  lspLanguage('c', ['C'], ['.c', '.h'], 'clangd', ['clangd'], ['--background-index'], ['compile_commands.json', 'compile_flags.txt', '.clangd', '.git'], {
    family: 'clang',
    installHint: 'Install clangd to enable full C IntelliSense.',
    installCommandWindows: 'winget install LLVM.LLVM',
  }),
  lspLanguage('cpp', ['C++', 'CPP', 'CXX'], ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.ino', '.ipp', '.ixx'], 'clangd', ['clangd', 'ccls'], ['--background-index'], ['compile_commands.json', 'compile_flags.txt', '.clangd', '.git'], {
    family: 'clang',
    installHint: 'Install clangd or ccls to enable full C++ IntelliSense.',
    installCommandWindows: 'winget install LLVM.LLVM',
  }),
  lspLanguage('go', ['Go', 'Golang'], ['.go'], 'gopls', ['gopls'], [], ['go.work', 'go.mod', '.git'], {
    family: 'go',
    installHint: 'Install gopls to enable full Go IntelliSense.',
    installCommandWindows: 'go install golang.org/x/tools/gopls@latest',
  }),
  lspLanguage('rust', ['Rust'], ['.rs'], 'rust-analyzer', ['rust-analyzer'], [], ['Cargo.toml', 'rust-project.json', '.git'], {
    family: 'rust',
    installHint: 'Install rust-analyzer to enable full Rust IntelliSense.',
    installCommandWindows: 'winget install Rustlang.Rustup',
  }),
  lspLanguage('java', ['Java'], ['.java'], 'jdtls', ['jdtls'], [
    '--jvm-arg=-Xmx1G',
    '--jvm-arg=-Xms128m',
    '--jvm-arg=-XX:+UseG1GC',
    '--jvm-arg=-XX:+UseStringDeduplication',
    '--jvm-arg=-Djava.awt.headless=true',
  ], ['pom.xml', 'build.gradle', 'settings.gradle', '.git'], {
    family: 'java',
    bundled: true,
    serverPackage: '@vscjava/java-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
    detail: 'Desktop Java IntelliSense via the bundled Eclipse JDT language server.',
  }),
  lspLanguage('csharp', ['C#', 'CSharp', 'CS'], ['.cs', '.csx'], 'OmniSharp', ['OmniSharp', 'omnisharp'], ['-lsp'], ['*.sln', '*.csproj', '.git'], {
    family: 'dotnet',
    installHint: 'Install OmniSharp to enable full C# IntelliSense.',
    installCommandWindows: 'dotnet tool install --global omnisharp',
  }),
  lspLanguage('php', ['PHP'], ['.php', '.phtml', '.php4', '.php5', '.php7', '.php8'], 'Intelephense', ['intelephense', 'phpactor'], ['--stdio'], ['composer.json', '.git'], {
    family: 'php',
    bundled: true,
    serverPackage: 'intelephense',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('ruby', ['Ruby', 'RB'], ['.rb', '.erb', '.rake', '.gemspec', 'Gemfile'], 'Solargraph', ['solargraph', 'ruby-lsp'], ['stdio'], ['Gemfile', '.ruby-version', '.git'], {
    family: 'ruby',
    detail: 'Desktop Ruby IntelliSense via Solargraph or Ruby LSP.',
    installHint: 'Install Solargraph or Ruby LSP to enable full Ruby IntelliSense.',
  }),
  lspLanguage('lua', ['Lua'], ['.lua'], 'Lua Language Server', ['lua-language-server'], [], ['.luarc.json', '.git'], {
    family: 'lua',
    installHint: 'Install lua-language-server to enable full Lua IntelliSense.',
    installCommandWindows: 'winget install LuaLS.lua-language-server',
  }),
  lspLanguage('dart', ['Dart'], ['.dart'], 'Dart Analysis Server', ['dart'], ['language-server', '--protocol=lsp'], ['pubspec.yaml', '.git'], {
    family: 'dart',
    installHint: 'Install the Dart SDK to enable full Dart IntelliSense.',
  }),
  lspLanguage('kotlin', ['Kotlin', 'KT'], ['.kt', '.kts'], 'Kotlin Language Server', ['kotlin-language-server'], [], ['settings.gradle', 'build.gradle', 'pom.xml', '.git'], {
    family: 'jvm',
    installHint: 'Install kotlin-language-server to enable full Kotlin IntelliSense.',
    installCommandWindows: 'scoop install kotlin-language-server',
  }),
  lspLanguage('swift', ['Swift'], ['.swift'], 'SourceKit-LSP', ['sourcekit-lsp'], [], ['Package.swift', '.git'], {
    family: 'swift',
    installHint: 'Install sourcekit-lsp to enable full Swift IntelliSense.',
    installCommandWindows: 'Install Swift for Windows with SourceKit-LSP support',
  }),
  lspLanguage('scala', ['Scala'], ['.scala', '.sc', '.sbt'], 'Metals', ['metals'], [], ['build.sbt', '.scala-build', '.git'], {
    family: 'jvm',
    installHint: 'Install Metals to enable full Scala IntelliSense.',
    installCommandWindows: 'coursier install metals',
  }),
  lspLanguage('r', ['R'], ['.r', '.R', '.rmd'], 'R languageserver', ['R'], ['--slave', '-e', 'languageserver::run()'], ['DESCRIPTION', '.Rproj', '.git'], {
    family: 'statistics',
    installHint: 'Install the R languageserver package to enable full R IntelliSense.',
    installCommandWindows: 'R -e "install.packages(\'languageserver\')"',
  }),
  lspLanguage('fsharp', ['F#', 'FSharp'], ['.fs', '.fsi', '.fsx'], 'FsAutoComplete', ['fsautocomplete'], ['--adaptive-lsp-server-enabled'], ['*.sln', '*.fsproj', '.git'], {
    family: 'dotnet',
    installHint: 'Install FsAutoComplete to enable full F# IntelliSense.',
    installCommandWindows: 'dotnet tool install --global fsautocomplete',
  }),
  lspLanguage('assembly', ['Assembly', 'ASM'], ['.asm', '.s', '.S', '.inc'], 'asm-lsp', ['asm-lsp'], [], ['compile_commands.json', '.git'], {
    family: 'systems',
    installHint: 'Install asm-lsp to enable full Assembly IntelliSense.',
    installCommandWindows: 'cargo install asm-lsp',
  }),
  lspLanguage('cmake', ['CMake'], ['.cmake', 'CMakeLists.txt'], 'cmake-language-server', ['cmake-language-server'], [], ['CMakeLists.txt', '.git'], {
    family: 'build',
    installHint: 'Install cmake-language-server to enable full CMake IntelliSense.',
    installCommandWindows: 'pip install cmake-language-server',
  }),
  lspLanguage('powershell', ['PowerShell', 'PS1'], ['.ps1', '.psm1', '.psd1'], 'PowerShell Editor Services', ['pwsh', 'powershell.exe'], ['-NoLogo', '-NoProfile', '-Command', 'Import-Module PowerShellEditorServices; Start-EditorServices -Stdio -SessionDetailsPath $null'], ['.git'], {
    family: 'shell',
    installHint: 'Install PowerShell Editor Services to enable full PowerShell IntelliSense.',
    installCommandWindows: 'Install-Module PowerShellEditorServices -Scope CurrentUser',
  }),
  lspLanguage('perl', ['Perl'], ['.pl', '.pm', '.t'], 'Perl Navigator', ['perlnavigator'], ['--stdio'], ['cpanfile', '.git'], {
    family: 'perl',
    installHint: 'Install Perl Navigator to enable full Perl IntelliSense.',
    installCommandWindows: 'npm install -g perlnavigator-server',
  }),
  lspLanguage('fortran', ['Fortran', 'F90'], ['.f', '.f90', '.f95', '.f03', '.f08'], 'fortls', ['fortls'], [], ['.git'], {
    family: 'scientific',
    installHint: 'Install fortls to enable full Fortran IntelliSense.',
    installCommandWindows: 'pip install fortls',
  }),
  lspLanguage('elixir', ['Elixir'], ['.ex', '.exs'], 'ElixirLS', ['elixir-ls'], [], ['mix.exs', '.git'], {
    family: 'beam',
    installHint: 'Install ElixirLS to enable full Elixir IntelliSense.',
    installCommandWindows: 'Install ElixirLS and add its language server to PATH',
  }),
  lspLanguage('erlang', ['Erlang'], ['.erl', '.hrl'], 'Erlang LS', ['erlang_ls'], [], ['rebar.config', 'erlang.mk', '.git'], {
    family: 'beam',
    installHint: 'Install erlang_ls to enable full Erlang IntelliSense.',
    installCommandWindows: 'Install erlang_ls and add it to PATH',
  }),
  lspLanguage('bicep', ['Bicep'], ['.bicep'], 'Bicep Language Server', ['bicep-lsp'], [], ['bicepconfig.json', '.git'], {
    family: 'cloud',
    installHint: 'Install bicep-lsp to enable full Bicep IntelliSense.',
    installCommandWindows: 'winget install Microsoft.Bicep',
  }),
  lspLanguage('nix', ['Nix'], ['.nix'], 'nil', ['nil'], [], ['flake.nix', 'shell.nix', '.git'], {
    family: 'systems',
    installHint: 'Install nil to enable full Nix IntelliSense.',
    installCommandWindows: 'winget install oxalica.nil',
  }),
  lspLanguage('haskell', ['Haskell'], ['.hs', '.lhs'], 'Haskell Language Server', ['haskell-language-server-wrapper', 'haskell-language-server'], ['--lsp'], ['stack.yaml', 'cabal.project', '.git'], {
    family: 'functional',
    installHint: 'Install Haskell Language Server to enable full Haskell IntelliSense.',
    installCommandWindows: 'ghcup install hls',
  }),
  lspLanguage('ocaml', ['OCaml'], ['.ml', '.mli'], 'ocamllsp', ['ocamllsp'], [], ['dune-project', 'opam', '.git'], {
    family: 'functional',
    installHint: 'Install ocamllsp to enable full OCaml IntelliSense.',
    installCommandWindows: 'opam install ocaml-lsp-server',
  }),
  lspLanguage('zig', ['Zig'], ['.zig'], 'zls', ['zls'], [], ['build.zig', '.git'], {
    family: 'systems',
    installHint: 'Install zls to enable full Zig IntelliSense.',
    installCommandWindows: 'winget install zig.zig && zig fetch --global-cache-dir zls',
  }),
  lspLanguage('shell', ['Shell', 'Bash', 'sh'], ['.sh', '.bash', '.zsh', '.ksh', '.fish', '.command', '.envrc', '.bashrc', '.zshrc'], 'bash-language-server', ['bash-language-server'], ['start'], ['.git'], {
    family: 'shell',
    detail: 'Hosted shell IntelliSense via bash-language-server when the backend server pack is installed.',
    bundled: true,
    serverPackage: 'bash-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('yaml', ['YAML', 'YML'], ['.yaml', '.yml', '.clang-format', '.clang-tidy', '.yamllint', '.ansible-lint'], 'yaml-language-server', ['yaml-language-server'], ['--stdio'], ['.git'], {
    family: 'data',
    detail: 'Hosted YAML IntelliSense via yaml-language-server when the backend server pack is installed.',
    bundled: true,
    serverPackage: 'yaml-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('dockerfile', ['Dockerfile'], ['Dockerfile', '.dockerfile', 'dockerfile'], 'docker-langserver', ['docker-langserver'], ['--stdio'], ['Dockerfile', 'docker-compose.yml', '.git'], {
    family: 'infra',
    detail: 'Hosted Dockerfile IntelliSense via docker-langserver when the backend server pack is installed.',
    bundled: true,
    serverPackage: 'dockerfile-language-server-nodejs',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('dockercompose', ['Docker Compose', 'Compose'], ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'], 'Docker Compose Language Service', ['docker-compose-langserver'], ['--stdio'], ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', '.git'], {
    family: 'infra',
    bundled: true,
    serverPackage: '@microsoft/compose-language-service',
    installHint: 'Bundled with the Tilder desktop runtime.',
    detail: 'Compose completions, hover, formatting, and diagnostics via Docker Compose Language Service.',
  }),
  lspLanguage('graphql', ['GraphQL'], ['.graphql', '.gql'], 'GraphQL LSP', ['graphql-lsp'], ['server', '-m', 'stream'], ['package.json', 'graphql.config.js', '.git'], {
    family: 'api',
    bundled: true,
    serverPackage: 'graphql-language-service-cli',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('prisma', ['Prisma'], ['.prisma'], 'Prisma Language Server', ['prisma-language-server'], ['--stdio'], ['schema.prisma', '.git'], {
    family: 'database',
    bundled: true,
    serverPackage: '@prisma/language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
    detail: 'Schema-aware Prisma completions, rename, formatting, diagnostics, hover, references, and go-to-definition.',
  }),
  lspLanguage('sql', ['SQL'], ['.sql', '.ddl', '.dml'], 'SQL Language Server', ['sql-language-server'], ['up', '--method', 'stdio'], ['.git'], {
    family: 'database',
    bundled: true,
    serverPackage: 'sql-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('ansible', ['Ansible'], ['ansible.cfg', '.ansible.yml', '.ansible.yaml'], 'Ansible Language Server', ['ansible-language-server'], ['--stdio'], ['ansible.cfg', 'galaxy.yml', '.git'], {
    family: 'infra',
    installHint: 'Install Ansible Language Server to enable full Ansible IntelliSense.',
    installCommandWindows: 'npm install -g @ansible/ansible-language-server',
    detail: 'Ansible-aware diagnostics and completions for dedicated Ansible config files.',
  }),
  lspLanguage('terraform', ['Terraform', 'HCL'], ['.tf', '.tfvars', '.hcl'], 'Terraform Language Server', ['terraform-ls'], ['serve'], ['.terraform', '.git'], {
    family: 'infra',
    installHint: 'Install terraform-ls to enable full Terraform IntelliSense.',
    installCommandWindows: 'winget install Hashicorp.Terraform',
  }),
  lspLanguage('xml', ['XML', 'XAML', 'SVG'], ['.xml', '.xaml', '.svg', '.plist', '.xsd', '.wsdl', '.csproj', '.vbproj', '.fsproj', '.props', '.targets'], 'LemMinX', ['lemminx'], [], ['.git'], {
    family: 'markup',
    installHint: 'Install LemMinX to enable full XML IntelliSense.',
    installCommandWindows: 'Download LemMinX and add it to PATH',
  }),
  lspLanguage('toml', ['TOML'], ['.toml', 'cargo.lock', '.taplo.toml'], 'Taplo', ['taplo'], ['lsp', 'stdio'], ['Cargo.toml', '.git'], {
    family: 'data',
    bundled: true,
    serverPackage: '@taplo/cli',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('vue', ['Vue'], ['.vue'], 'Vue Language Server', ['vue-language-server'], ['--stdio'], ['package.json', 'tsconfig.json', 'jsconfig.json', '.git'], {
    family: 'web',
    bundled: true,
    serverPackage: '@vue/language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('svelte', ['Svelte'], ['.svelte'], 'Svelte Language Server', ['svelteserver'], ['--stdio'], ['package.json', 'svelte.config.js', '.git'], {
    family: 'web',
    bundled: true,
    serverPackage: 'svelte-language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
  lspLanguage('astro', ['Astro'], ['.astro'], 'Astro Language Server', ['astro-ls'], ['--stdio'], ['package.json', 'astro.config.mjs', '.git'], {
    family: 'web',
    bundled: true,
    serverPackage: '@astrojs/language-server',
    installHint: 'Bundled with the Tilder desktop runtime.',
  }),
];

const basicLanguages = [
  basicLanguage('plaintext', ['Plain Text'], ['.txt', '.text', '.log'], { family: 'text' }),
  basicLanguage('ini', ['INI', 'Config'], ['.ini', '.conf', '.cfg', '.cnf', '.properties', '.editorconfig', '.env', '.env.local', '.env.development', '.env.production', '.env.test', '.npmrc', '.yarnrc', '.pnpmrc', '.gitconfig'], {
    family: 'config',
  }),
  basicLanguage('protobuf', ['Protocol Buffers', 'Proto'], ['.proto'], { family: 'data' }),
  basicLanguage('makefile', ['Makefile'], ['Makefile', '.mk', 'GNUmakefile', 'makefile'], { family: 'build' }),
  basicLanguage('gradle', ['Gradle'], ['.gradle'], { family: 'build' }),
  basicLanguage('groovy', ['Groovy'], ['.groovy', '.gvy', '.gradle.kts', 'Jenkinsfile'], { family: 'jvm' }),
  basicLanguage('bat', ['Batch', 'CMD'], ['.bat', '.cmd'], { family: 'shell' }),
  basicLanguage('julia', ['Julia'], ['.jl'], { family: 'scientific' }),
  basicLanguage('matlab', ['MATLAB'], ['.m'], { family: 'scientific' }),
  basicLanguage('clojure', ['Clojure'], ['.clj', '.cljs', '.cljc', '.edn'], { family: 'lisp' }),
  basicLanguage('scheme', ['Scheme'], ['.scm', '.ss'], { family: 'lisp' }),
  basicLanguage('nim', ['Nim'], ['.nim', '.nims'], { family: 'nim' }),
  basicLanguage('mips', ['MIPS'], ['.mips'], { family: 'systems' }),
  basicLanguage('pascal', ['Pascal'], ['.pas', '.pp', '.lpr'], { family: 'systems' }),
  basicLanguage('vb', ['Visual Basic'], ['.vb', '.vbs'], { family: 'dotnet' }),
  basicLanguage('tcl', ['Tcl'], ['.tcl'], { family: 'scripting' }),
  basicLanguage('coffee', ['CoffeeScript'], ['.coffee', '.litcoffee'], { family: 'javascript' }),
  basicLanguage('pug', ['Pug', 'Jade'], ['.pug', '.jade'], { family: 'markup' }),
  basicLanguage('handlebars', ['Handlebars', 'HBS'], ['.hbs', '.handlebars', '.mustache'], { family: 'markup' }),
  basicLanguage('nginx', ['Nginx'], ['nginx.conf'], { family: 'infra' }),
  basicLanguage('apache', ['Apache'], ['.htaccess', 'httpd.conf'], { family: 'infra' }),
  basicLanguage('latex', ['LaTeX', 'TeX'], ['.tex', '.sty', '.cls'], { family: 'document' }),
  basicLanguage('solidity', ['Solidity'], ['.sol'], { family: 'blockchain' }),
  basicLanguage('verilog', ['Verilog'], ['.v', '.vh'], { family: 'hardware' }),
  basicLanguage('systemverilog', ['SystemVerilog'], ['.sv', '.svh'], { family: 'hardware' }),
  basicLanguage('vhdl', ['VHDL'], ['.vhd', '.vhdl'], { family: 'hardware' }),
  basicLanguage('abap', ['ABAP'], ['.abap'], { family: 'enterprise' }),
  basicLanguage('apex', ['Apex'], ['.cls', '.trigger'], { family: 'enterprise' }),
  basicLanguage('azcli', ['Azure CLI'], ['.azcli'], { family: 'cloud' }),
  basicLanguage('cameligo', ['CameLIGO'], ['.mligo'], { family: 'blockchain' }),
  basicLanguage('cypher', ['Cypher'], ['.cypher', '.cql'], { family: 'database' }),
  basicLanguage('csp', ['CSP'], ['.csp'], { family: 'web' }),
  basicLanguage('diff', ['Diff', 'Patch'], ['.diff', '.patch'], { family: 'tools' }),
  basicLanguage('ecl', ['ECL'], ['.ecl'], { family: 'data' }),
  basicLanguage('freemarker2', ['FreeMarker'], ['.ftl'], { family: 'markup' }),
  basicLanguage('liquid', ['Liquid'], ['.liquid'], { family: 'markup' }),
  basicLanguage('postiats', ['ATS/Postiats'], ['.dats', '.sats', '.hats'], { family: 'systems' }),
  basicLanguage('powerquery', ['Power Query'], ['.pq', '.mquery'], { family: 'data' }),
  basicLanguage('qsharp', ['Q#'], ['.qs'], { family: 'quantum' }),
  basicLanguage('razor', ['Razor'], ['.cshtml', '.razor'], { family: 'web' }),
  basicLanguage('redis', ['Redis'], ['.redis'], { family: 'database' }),
  basicLanguage('redshift', ['Redshift'], ['.redshift'], { family: 'database' }),
  basicLanguage('sb', ['Small Basic'], ['.sb'], { family: 'education' }),
  basicLanguage('sparql', ['SPARQL'], ['.rq', '.sparql'], { family: 'data' }),
  basicLanguage('st', ['Structured Text'], ['.st'], { family: 'industrial' }),
  basicLanguage('twig', ['Twig'], ['.twig'], { family: 'markup' }),
  basicLanguage('wgsl', ['WGSL'], ['.wgsl'], { family: 'graphics' }),
];

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

const explicitLanguages = [...nativeLanguages, ...lspLanguages, ...basicLanguages];
const languageById = new Map(explicitLanguages.map((entry) => [entry.id, entry]));

for (const generatedEntry of GENERATED_MONACO_LANGUAGE_CATALOG) {
  const existing = languageById.get(generatedEntry.id);
  if (existing) {
    existing.aliases = uniqueStrings([...(existing.aliases || []), ...(generatedEntry.aliases || [])]);
    existing.extensions = uniqueStrings([...(existing.extensions || []), ...(generatedEntry.extensions || [])]);
    continue;
  }

  languageById.set(
    generatedEntry.id,
    basicLanguage(generatedEntry.id, generatedEntry.aliases || [generatedEntry.id], generatedEntry.extensions || [], {
      family: 'monaco',
      detail: 'Monaco language mode with syntax highlighting and editor basics.',
    })
  );
}

export const EDITOR_LANGUAGE_REGISTRY = [...languageById.values()];

export const EDITOR_LANGUAGE_BY_ID = Object.fromEntries(
  EDITOR_LANGUAGE_REGISTRY.map((entry) => [entry.id, entry])
);

export function getEditorLanguage(languageId) {
  return EDITOR_LANGUAGE_BY_ID[languageId] || null;
}

export function getEditorLanguagesBySupportLevel(supportLevel) {
  return EDITOR_LANGUAGE_REGISTRY.filter((entry) => entry.supportLevel === supportLevel);
}
