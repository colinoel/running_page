import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import type { Plugin } from 'vite';

const ENDPOINT = '/api/garmin-import';
const MAX_BYTES = 4 * 1024 ** 3;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const RELOAD_QUIET_MS = 3000;

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Rejects requests from any other site (the endpoint runs on your computer). */
function isLocalRequest(req: IncomingMessage) {
  const { host, origin } = req.headers;
  if (!host || !LOCAL_HOST.test(host) || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function runImporter(root: string, zipPath: string) {
  const python = path.join(
    root,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  );
  const script = path.join(root, 'run_page', 'garmin_export_import.py');
  return new Promise<{ status: number; body: object }>((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(python, [script, zipPath], {
      cwd: root,
      env: { ...process.env, PYTHONUTF8: '1' },
    });
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) =>
      resolve({ status: 500, body: { ok: false, error: error.message } })
    );
    child.on('close', () => {
      try {
        const body = JSON.parse(stdout.trim().split('\n').pop() as string);
        resolve({ status: body.ok ? 200 : 422, body });
      } catch {
        const reason = stderr.trim().split('\n').pop() || 'Importer crashed.';
        resolve({ status: 500, body: { ok: false, error: reason } });
      }
    });
  });
}

/** Dev-only endpoint: receives a Garmin export ZIP and imports it. */
export function garminImport(): Plugin {
  let busy = false;
  let quietUntil = 0;

  return {
    name: 'garmin-import',
    apply: 'serve',
    // The page reloads itself after showing the result of the import.
    handleHotUpdate({ file }) {
      if (
        (busy || Date.now() < quietUntil) &&
        file.endsWith('activities.json')
      ) {
        return [];
      }
    },
    configureServer(server) {
      server.middlewares.use(ENDPOINT, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'POST only.' });
          return;
        }
        if (!isLocalRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'Local requests only.' });
          return;
        }
        if (Number(req.headers['content-length']) > MAX_BYTES) {
          sendJson(res, 413, { ok: false, error: 'File is too large.' });
          return;
        }
        if (busy) {
          sendJson(res, 409, {
            ok: false,
            error: 'An import is already running.',
          });
          return;
        }

        busy = true;
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'garmin-import-'));
        try {
          const zipPath = path.join(tempDir, 'export.zip');
          await pipeline(req, createWriteStream(zipPath));
          const { status, body } = await runImporter(
            server.config.root,
            zipPath
          );
          sendJson(res, status, body);
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error) });
        } finally {
          busy = false;
          quietUntil = Date.now() + RELOAD_QUIET_MS;
          await rm(tempDir, { recursive: true, force: true });
        }
      });
    },
  };
}
