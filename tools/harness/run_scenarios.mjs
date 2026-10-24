#!/usr/bin/env node
/**
 * Runs every scenario of every face (or the faces named on the command line)
 * through the harness. Fails on runtime errors, missing assets or wrong theme.
 *
 *   node tools/harness/run_scenarios.mjs [face ...]            # test only
 *   node tools/harness/run_scenarios.mjs --render [face ...]   # also write quick previews to faces/<face>/previews/
 *
 * Previews are approximations for prototyping; README screenshots come from the real
 * firmware (tools/emu/screenshots.mjs).
 *
 * A scenario may set "expect_theme" (default "color"), and "aod": true to build the
 * always-on copy of the face, which must create only always-on widgets.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const render = args.includes('--render');
const wanted = args.filter((a) => !a.startsWith('--'));
const faces = (wanted.length ? wanted : fs.readdirSync(path.join(REPO, 'faces')))
  .filter((f) => fs.existsSync(path.join(REPO, 'faces', f, 'app.json')))
  .sort();

let failed = 0;
for (const face of faces) {
  const faceDir = path.join(REPO, 'faces', face);
  const scenDir = path.join(faceDir, 'scenarios');
  const out = path.join(REPO, 'tools/.build/harness', face);
  fs.mkdirSync(out, { recursive: true });
  for (const file of fs.readdirSync(scenDir).filter((f) => f.endsWith('.json')).sort()) {
    const name = path.basename(file, '.json');
    const scenarioPath = path.join(scenDir, file);
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    let dumpText;
    try {
      dumpText = execFileSync('node', [path.join(REPO, 'tools/harness/harness.mjs'), faceDir, scenarioPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      console.error(`✗ ${face}/${name}: harness failed\n${e.stderr || e.message}`);
      failed++;
      continue;
    }
    const dump = JSON.parse(dumpText);
    const bg = dump.widgets.find((w) => w.type === 'IMG' && /^bg\//.test(w.props.src || ''));
    const aodTime = dump.widgets.find((w) => /aod\/time_/.test(JSON.stringify(w.props)));
    const theme = scenario.aod
      ? (JSON.stringify(aodTime ? aodTime.props : {}).match(/aod\/time_(\w+)/) || [, '?'])[1]
      : (bg ? path.basename(bg.props.src, '.png') : '?');
    const want = scenario.expect_theme || 'color';
    const problems = [...dump.errors];
    if (theme !== want) problems.push(`expected theme ${want}, got ${theme}`);
    if (scenario.aod) {
      // the edit groups stay: they're how the face reads its settings
      const normal = dump.widgets.filter((w) => w.props.show_level === 1);
      if (normal.length) problems.push(`always-on copy created ${normal.length} normal-screen widgets`);
    }
    const dumpPath = path.join(out, `${name}.json`);
    fs.writeFileSync(dumpPath, dumpText);
    if (problems.length) {
      console.error(`✗ ${face}/${name}: ${problems.join('; ')}`);
      failed++;
      continue;
    }
    console.log(`✓ ${face}/${name} (${theme}, ${dump.widgets.length} widgets)`);
    if (render) {
      const shots = path.join(faceDir, 'previews');
      fs.mkdirSync(shots, { recursive: true });
      const py = (extra) => execFileSync('python3',
        [path.join(REPO, 'tools/preview.py'), faceDir, dumpPath, scenarioPath, ...extra], { stdio: 'inherit' });
      if (scenario.aod) {   // the always-on copy only has an always-on view
        py([path.join(shots, `${name}.png`), '--aod']);
      } else {
        py([path.join(shots, `${name}.png`)]);
        py([path.join(shots, `${name}_aod.png`), '--aod']);
        py([path.join(shots, `${name}_edit.png`), '--edit']);
      }
    }
  }
}
if (failed) {
  console.error(`${failed} scenario(s) failed`);
  process.exit(1);
}
