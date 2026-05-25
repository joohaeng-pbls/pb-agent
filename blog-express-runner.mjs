#!/usr/bin/env node
/**
 * Blog Express Pipeline Runner
 * Spawned as a detached background process by blog-mcp.ts for express mode.
 * Runs all pipeline phases sequentially, skips gates, auto-submits PR.
 *
 * Usage: node blog-express-runner.mjs <runId>
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BLOG_REPO = '/workspace/extra/repos/pebblous.github.io';
const RUNS_DIR = path.join(BLOG_REPO, '_workspace/.runs');
const runId = process.argv[2];

if (!runId) {
  process.stderr.write('Usage: blog-express-runner.mjs <runId>\n');
  process.exit(1);
}

const logFile = path.join(RUNS_DIR, runId, 'express-runner.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
  process.stderr.write(line);
}

function readState() {
  return JSON.parse(fs.readFileSync(path.join(RUNS_DIR, runId, 'state.json'), 'utf-8'));
}

function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(RUNS_DIR, runId, 'state.json'), JSON.stringify(state, null, 2));
}

function buildPrompt(state, phase) {
  const runDir = path.join(RUNS_DIR, runId);
  const skillPath = `.claude/skills/${phase.skill}`;
  const completedOutputs = state.phases
    .filter(p => p.status === 'completed' && p.output)
    .map(p => `[${p.name}]: see file ${p.output}`)
    .join('\n');

  return `You are executing phase "${phase.name}" of a ${state.type} pipeline.

Topic: ${state.topic}
Run directory: ${runDir}
Branch: ${state.branch}

## Instructions

1. Read the skill file at \`${skillPath}/skill.md\` (and \`${skillPath}/SKILL.md\` if it exists) for detailed execution instructions.
2. Read the blog repo's CLAUDE.md for HTML conventions and structure rules.
3. This is phase "${phase.name}" — focus ONLY on this phase's responsibilities as described in the skill.

## Previous Phase Outputs
${completedOutputs || '(first phase — no prior outputs)'}

## Workspace
All intermediate files go in: ${runDir}/
Follow the naming convention: {phase}_{artifact}.{ext}

## Key Rules
- Write all output files to the run directory
- Follow the blog repo's conventions exactly (PebblousPage.init, CSS order, SEO 4-layer, etc.)
- For HTML output: write to the correct path in the blog repo (on the feature branch)
- If this is a research phase: save comprehensive findings, don't summarize away detail
- If this is a writing phase: produce complete, publication-ready HTML
${phase.promptExtra ? `\n## Phase-Specific Instructions\n${phase.promptExtra}` : ''}

Begin.`;
}

function runPhase(state, phase) {
  const runDir = path.join(RUNS_DIR, runId);
  const promptFile = path.join(runDir, `.express-prompt-${phase.name}.md`);
  const outputFile = path.join(runDir, `${phase.name}-output.txt`);
  const timeoutMs = phase.timeoutMs ?? (
    ['write-ko', 'write-en', 'reinforce', 'synthesis', 'planning'].includes(phase.name) ? 1_800_000 : 600_000
  );

  fs.writeFileSync(promptFile, buildPrompt(state, phase));

  const cmd = [
    'claude',
    '-p', promptFile,
    '--model', phase.model,
    '--output-format', 'text',
    '--max-turns', '50',
    '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch,Agent',
  ].join(' ');

  log(`Phase ${phase.name} starting (model=${phase.model}, timeout=${Math.round(timeoutMs / 60000)}min)`);

  try {
    const result = execSync(cmd, {
      cwd: BLOG_REPO,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    });
    fs.writeFileSync(outputFile, result);
    return outputFile;
  } catch (err) {
    // ETIMEDOUT: claude may have written the output file before dying
    if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 200) {
      log(`Phase ${phase.name} timed out but output exists — treating as completed`);
      return outputFile;
    }
    throw err;
  }
}

async function submitPR(state) {
  const hostsFile = fs.readFileSync('/workspace/extra/gh-config/hosts.yml', 'utf-8');
  const tokenMatch = hostsFile.match(/oauth_token:\s*(.+)/);
  if (!tokenMatch) throw new Error('GitHub token not found');
  const token = tokenMatch[1].trim();

  const owner = 'pebblous';
  const repo = 'pebblous.github.io';
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Get main HEAD SHA
  const mainRef = await fetch(`${apiBase}/git/refs/heads/main`, { headers });
  const mainRefData = await mainRef.json();
  const mainSha = mainRefData.object?.sha;
  if (!mainSha) throw new Error('Could not get main SHA');

  // Create branch on GitHub
  await fetch(`${apiBase}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${state.branch}`, sha: mainSha }),
  });

  // Get changed files vs main on local branch
  const changedRaw = execSync('git diff main HEAD --name-only', { cwd: BLOG_REPO, encoding: 'utf-8' });
  const files = changedRaw.trim().split('\n').filter(Boolean);
  log(`Pushing ${files.length} files to ${state.branch}`);

  let pushed = 0;
  for (const filePath of files) {
    const fullPath = path.join(BLOG_REPO, filePath);
    if (!fs.existsSync(fullPath)) continue;

    const contentBase64 = fs.readFileSync(fullPath).toString('base64');

    let fileSha;
    try {
      const existing = await fetch(`${apiBase}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(state.branch)}`, { headers });
      if (existing.ok) fileSha = (await existing.json()).sha;
    } catch { /* file doesn't exist on remote yet */ }

    const putBody = { message: `feat: ${filePath} [${state.id}]`, content: contentBase64, branch: state.branch };
    if (fileSha) putBody.sha = fileSha;

    const putRes = await fetch(`${apiBase}/contents/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody),
    });

    if (putRes.ok) { pushed++; log(`Pushed: ${filePath}`); }
    else { log(`Failed: ${filePath} — ${putRes.status} ${await putRes.text().then(t => t.slice(0, 100))}`); }
  }

  // Create PR
  const prBody = [
    `## Summary`,
    ``,
    `Pipeline: ${state.type} (express)`,
    `Topic: ${state.topic}`,
    `Run ID: ${state.id}`,
    ``,
    `## Phases`,
    ...state.phases.map(p => `- ${p.status === 'completed' ? '✅' : p.status === 'skipped' ? '⏭' : '❌'} ${p.name}`),
    ``,
    `---`,
    `🤖 Generated by NanoClaw Blog MCP (express mode)`,
  ].join('\n');

  const prRes = await fetch(`${apiBase}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: `[${state.type}] ${state.topic}`, body: prBody, head: state.branch, base: 'main' }),
  });
  const prData = await prRes.json();
  if (!prRes.ok) throw new Error(`PR creation failed: ${prData.message}`);

  return { pushed, prUrl: prData.html_url };
}

async function main() {
  log(`Express runner started for ${runId}`);

  // Make sure we're on the right branch
  let state = readState();
  try {
    execSync(`git checkout main && git pull origin main && git checkout -b ${state.branch} 2>/dev/null || git checkout ${state.branch}`, {
      cwd: BLOG_REPO,
      encoding: 'utf-8',
      shell: true,
    });
  } catch (err) {
    log(`Branch setup: ${err.message}`);
  }

  // Execute phases sequentially, skipping gates
  while (true) {
    state = readState();
    const nextPhase = state.phases.find(p => p.status === 'pending');
    if (!nextPhase) break;

    // Skip known-failing phase
    if (nextPhase.name === 'image-reinforce') {
      log('Skipping image-reinforce');
      nextPhase.status = 'skipped';
      nextPhase.completedAt = new Date().toISOString();
      writeState(state);
      continue;
    }

    // Mark running
    nextPhase.status = 'running';
    nextPhase.startedAt = new Date().toISOString();
    state.currentPhase = nextPhase.name;
    state.status = 'running';
    writeState(state);

    try {
      const outputFile = runPhase(state, nextPhase);
      nextPhase.status = 'completed';
      nextPhase.completedAt = new Date().toISOString();
      nextPhase.output = outputFile;
      log(`Phase ${nextPhase.name} ✅`);
    } catch (err) {
      log(`Phase ${nextPhase.name} failed: ${err.message}`);
      nextPhase.status = 'failed';
      nextPhase.completedAt = new Date().toISOString();
      // Continue in express mode despite individual phase failures
    }
    writeState(state);
  }

  // Mark completed
  state = readState();
  state.status = 'completed';
  writeState(state);
  log('All phases done. Submitting PR...');

  try {
    const { pushed, prUrl } = await submitPR(state);
    state = readState();
    state.prUrl = prUrl;
    writeState(state);
    log(`PR submitted ✅ ${prUrl} (${pushed} files)`);

    // Write completion notification file
    fs.writeFileSync(
      path.join(RUNS_DIR, runId, 'express-complete.json'),
      JSON.stringify({ prUrl, pushed, completedAt: new Date().toISOString() }, null, 2),
    );
  } catch (err) {
    log(`PR submission failed: ${err.message}`);
  }

  log('Express runner done');
}

main().catch(err => {
  log(`Fatal: ${err.message}\n${err.stack}`);
  process.exit(1);
});
