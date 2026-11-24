import { t } from './i18n.ts'

const STARTERS = {
  php: { run: 'php main.php', files: [{ path: 'main.php', content: '<?php\n\necho "Hello from PHP " . PHP_VERSION . PHP_EOL;\n' }] },
  cpp: {
    run: 'g++ -std=c++20 -Wall -o /tmp/main main.cpp && /tmp/main',
    files: [{ path: 'main.cpp', content: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++" << std::endl;\n    return 0;\n}\n' }],
  },
  python: { run: 'python main.py', files: [{ path: 'main.py', content: 'import sys\n\nprint(f"Hello from Python {sys.version.split()[0]}")\n' }] },
  javascript: { run: 'node main.js', files: [{ path: 'main.js', content: 'console.log(`Hello from Node ${process.version}`)\n' }] },
  typescript: { run: 'tsx main.ts', files: [{ path: 'main.ts', content: 'const greet = (who: string): string => `Hello, ${who}!`\nconsole.log(greet("TypeScript"))\n' }] },
  go: {
    run: 'go run .',
    files: [
      { path: 'go.mod', content: 'module playground\n\ngo 1.23\n' },
      { path: 'main.go', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Go")\n}\n' },
    ],
  },
  rust: { run: 'rustc --edition 2021 -o /tmp/main main.rs && /tmp/main', files: [{ path: 'main.rs', content: 'fn main() {\n    println!("Hello from Rust");\n}\n' }] },
  java: {
    run: 'javac -d /tmp/out Main.java && java -cp /tmp/out Main',
    files: [{ path: 'Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java " + Runtime.version());\n    }\n}\n' }],
  },
  csharp: {
    run: 'dotnet run',
    files: [
      { path: 'app.csproj', content: '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n    <Nullable>enable</Nullable>\n    <ImplicitUsings>enable</ImplicitUsings>\n  </PropertyGroup>\n</Project>\n' },
      { path: 'Program.cs', content: 'Console.WriteLine($"Hello from .NET {Environment.Version}");\n' },
    ],
  },
  ruby: { run: 'ruby main.rb', files: [{ path: 'main.rb', content: 'puts "Hello from Ruby #{RUBY_VERSION}"\n' }] },
  sql: {
    run: 'sqlite3 /tmp/db.sqlite < schema.sql',
    files: [{ path: 'schema.sql', content: "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (name) VALUES ('Ala'), ('Ola');\n.mode table\nSELECT * FROM users;\n" }],
  },
}

export const DEFAULT_SANDBOX_LANGUAGE = 'php'

export function hasSandboxStarter(language) {
  return Object.hasOwn(STARTERS, language)
}

export function getSandboxStarter(language) {
  const { files, run } = STARTERS[language]
  return {
    run,
    mainFile: files[files.length - 1].path,
    files: files.map(({ path, content }) => ({
      path,
      content: language === 'cpp' ? content.replace('Hello from C++', t('Hello from C++')) : t(content),
    })),
  }
}
