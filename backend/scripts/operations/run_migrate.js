const { spawn } = require('child_process');

const p = spawn('npx.cmd', ['prisma', 'migrate', 'dev', '--name', 'move_emu_id', '--create-only'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

p.stdin.write('y\n');
setTimeout(() => {
  p.stdin.write('y\n');
  p.stdin.end();
}, 2000);

p.on('close', code => {
  process.exit(code);
});
