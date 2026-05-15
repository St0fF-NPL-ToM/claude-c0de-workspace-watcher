#!/bin/bash
# Install git hooks for automatic version bumping

HOOK_DIR=".git/hooks"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/prepare-commit-msg" << 'HOOK_EOF'
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

const version = pkg.version.split('.');
const patch = parseInt(version[2]) + 1;
version[2] = patch.toString();
pkg.version = version.join('.');

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const { spawnSync } = require('child_process');
const gitAdd = spawnSync('git', ['add', 'package.json'], { stdio: 'pipe' });
if (gitAdd.error) {
  console.error('Failed to stage package.json:', gitAdd.error);
  process.exit(1);
}
HOOK_EOF

chmod +x "$HOOK_DIR/prepare-commit-msg"
echo "✅ Git hooks installed successfully"
