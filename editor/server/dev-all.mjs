// Run the editor (vite) and the render server together so export "just works".
//   npm run dev:all
import { spawn } from "node:child_process";

const opts = { stdio: "inherit", shell: true };
const procs = [spawn("pnpm", ["run", "dev"], opts), spawn("pnpm", ["run", "server"], opts)];

const shutdown = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const p of procs) p.on("exit", shutdown);
