<script setup>
import { computed, ref, onMounted } from 'vue'
import { useApp } from '../stores/app.js'
import AppShell from '../components/AppShell.vue'
import SandboxIDE from '../components/SandboxIDE.vue'

const app = useApp()

const STARTERS = {
  php: { run: 'php main.php', files: [{ path: 'main.php', content: '<?php\n\necho "Cześć z PHP " . PHP_VERSION . PHP_EOL;\n' }] },
  cpp: {
    run: 'g++ -std=c++20 -Wall -o /tmp/main main.cpp && /tmp/main',
    files: [{ path: 'main.cpp', content: '#include <iostream>\n\nint main() {\n    std::cout << "Cześć z C++" << std::endl;\n    return 0;\n}\n' }],
  },
  python: { run: 'python main.py', files: [{ path: 'main.py', content: 'import sys\n\nprint(f"Cześć z Pythona {sys.version.split()[0]}")\n' }] },
  javascript: { run: 'node main.js', files: [{ path: 'main.js', content: 'console.log(`Cześć z Node ${process.version}`)\n' }] },
  typescript: { run: 'tsx main.ts', files: [{ path: 'main.ts', content: 'const greet = (who: string): string => `Cześć, ${who}!`\nconsole.log(greet("TypeScript"))\n' }] },
  go: {
    run: 'go run .',
    files: [
      { path: 'go.mod', content: 'module playground\n\ngo 1.23\n' },
      { path: 'main.go', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Cześć z Go")\n}\n' },
    ],
  },
  rust: { run: 'rustc --edition 2021 -o /tmp/main main.rs && /tmp/main', files: [{ path: 'main.rs', content: 'fn main() {\n    println!("Cześć z Rusta");\n}\n' }] },
  java: {
    run: 'javac -d /tmp/out Main.java && java -cp /tmp/out Main',
    files: [{ path: 'Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Cześć z Javy " + Runtime.version());\n    }\n}\n' }],
  },
  csharp: {
    run: 'dotnet run',
    files: [
      { path: 'app.csproj', content: '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n    <Nullable>enable</Nullable>\n    <ImplicitUsings>enable</ImplicitUsings>\n  </PropertyGroup>\n</Project>\n' },
      { path: 'Program.cs', content: 'Console.WriteLine($"Cześć z .NET {Environment.Version}");\n' },
    ],
  },
  ruby: { run: 'ruby main.rb', files: [{ path: 'main.rb', content: 'puts "Cześć z Rubiego #{RUBY_VERSION}"\n' }] },
  sql: {
    run: 'sqlite3 /tmp/db.sqlite < schema.sql',
    files: [{ path: 'schema.sql', content: "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (name) VALUES ('Ala'), ('Ola');\n.mode table\nSELECT * FROM users;\n" }],
  },
}

const langs = computed(() => Object.entries(app.docker?.envs || {}).filter(([k]) => STARTERS[k] && k !== 'c'))
const pick = () => {
  const l = String(app.plan?.language || '').toLowerCase()
  return STARTERS[l] ? l : 'php'
}
const lang = ref(pick())
const starter = computed(() => STARTERS[lang.value])

onMounted(() => {
  if (!app.docker) app.refreshStatus()
})
</script>

<template>
  <AppShell>
    <div class="pg">
      <div class="pg-head">
        <h1>Piaskownica</h1>
        <div class="seg">
          <button v-for="[k, label] in langs" :key="k" class="chip" :aria-pressed="lang === k" @click="lang = k">{{ label }}</button>
        </div>
      </div>
      <div v-if="app.docker && !app.docker.available" class="card off">
        <strong>Docker nie działa.</strong> Uruchom Docker Desktop i kliknij
        <button class="link-btn" @click="app.refreshStatus()">sprawdź ponownie</button>.
      </div>
      <SandboxIDE
        v-else-if="app.docker"
        :key="lang"
        class="ide"
        :ws-id="`play-${lang}`"
        :language="lang"
        :seed-files="starter.files"
        :test-command="starter.run"
        :main-file="starter.files[starter.files.length - 1].path"
        run-label="Uruchom"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.pg {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  padding: 20px 28px 24px;
  height: calc(100vh - 72px);
  min-height: 560px;
}
.pg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 16px;
}
h1 {
  font-size: 26px;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.seg .chip {
  padding: 6px 12px;
  font-size: 13px;
}
.ide {
  min-height: 0;
  height: 100%;
}
.off {
  padding: 20px;
}
@media (max-width: 860px) {
  .pg {
    padding: 14px;
    height: auto;
  }
  .ide {
    height: 80vh;
  }
}
</style>
