#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Comprehensive build verification script for OpenRouter Search MCP server
 * This script validates that the project builds correctly and all components work together
 */

import { spawn } from 'child_process';
import { constants } from 'fs';
import { readFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

/**
 * Logging utility with colored output
 */
const log = {
  info: msg => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: msg => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: msg => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: msg => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: msg => console.log(`\n${colors.bold}${msg}${colors.reset}`),
};

/**
 * Execute a command and return promise with result
 */
function execCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'pipe',
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(
          new Error(
            `Command failed with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        );
      }
    });

    proc.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verification steps
 */
const verificationSteps = [
  {
    name: 'Clean previous build',
    async run() {
      log.info('Cleaning dist directory...');
      await execCommand('npm', ['run', 'clean']);
      log.success('Cleaned dist directory');
    },
  },

  {
    name: 'TypeScript compilation',
    async run() {
      log.info('Running TypeScript type checking...');
      await execCommand('npm', ['run', 'type-check']);
      log.success('TypeScript type checking passed');

      log.info('Building project...');
      await execCommand('npm', ['run', 'build']);
      log.success('TypeScript compilation successful');
    },
  },

  {
    name: 'Verify build artifacts',
    async run() {
      const requiredFiles = [
        'dist/src/index.js',
        'dist/src/index.d.ts',
        'dist/src/config/index.js',
        'dist/src/clients/index.js',
        'dist/src/tools/search.js',
        'dist/src/types/search.js',
      ];

      log.info('Checking build artifacts...');
      for (const file of requiredFiles) {
        const filePath = join(projectRoot, file);
        if (!(await fileExists(filePath))) {
          throw new Error(`Required build artifact not found: ${file}`);
        }
      }
      log.success(`All ${requiredFiles.length} required build artifacts exist`);
    },
  },

  {
    name: 'Code quality checks',
    async run() {
      log.info('Running ESLint...');
      await execCommand('npm', ['run', 'lint']);
      log.success('ESLint checks passed');

      log.info('Checking code formatting...');
      await execCommand('npm', ['run', 'format:check']);
      log.success('Code formatting is correct');
    },
  },

  {
    name: 'Test execution',
    async run() {
      log.info('Running test suite...');
      const result = await execCommand('npm', ['test']);

      // Parse test results
      const testOutput = result.stdout;
      const testSummary = testOutput.match(/Tests\s+(\d+)\s+passed/);
      const passedTests = testSummary ? testSummary[1] : 'unknown';

      log.success(`Test suite passed (${passedTests} tests)`);
    },
  },

  {
    name: 'MCP server initialization',
    async run() {
      log.info('Testing MCP server initialization...');

      // Start the server with a timeout
      const serverProcess = spawn('node', ['dist/src/index.js'], {
        cwd: projectRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
          // Don't provide API key to test graceful error handling
        },
      });

      let serverOutput = '';
      let serverError = '';

      serverProcess.stdout.on('data', data => {
        serverOutput += data.toString();
      });

      serverProcess.stderr.on('data', data => {
        serverError += data.toString();
      });

      // Wait for server to start or fail
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          serverProcess.kill('SIGTERM');
          resolve();
        }, 3000);

        serverProcess.on('exit', _code => {
          clearTimeout(timeout);
          resolve();
        });

        serverProcess.on('error', error => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const fullOutput = serverOutput + serverError;

      // Check that server handled missing API key gracefully
      if (
        fullOutput.includes('Configuration validation failed') &&
        (fullOutput.includes('OPENROUTER_API_KEY') ||
          fullOutput.includes('OPENROUTER_KEY'))
      ) {
        log.success('MCP server handles configuration errors gracefully');
      } else {
        throw new Error(
          `MCP server did not handle missing API key configuration correctly. Full output: ${fullOutput}`
        );
      }
    },
  },

  {
    name: 'Package.json validation',
    async run() {
      log.info('Validating package.json configuration...');

      const packagePath = join(projectRoot, 'package.json');
      const packageContent = await readFile(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      // Check required fields
      const requiredFields = ['name', 'version', 'description', 'main', 'type'];
      for (const field of requiredFields) {
        if (!packageJson[field]) {
          throw new Error(`Missing required field in package.json: ${field}`);
        }
      }

      // Check that main points to correct file
      if (packageJson.main !== 'dist/src/index.js') {
        throw new Error(
          `package.json main field should point to 'dist/src/index.js', got '${packageJson.main}'`
        );
      }

      // Check that type is module
      if (packageJson.type !== 'module') {
        throw new Error(
          `package.json type should be 'module', got '${packageJson.type}'`
        );
      }

      log.success('Package.json validation passed');
    },
  },

  {
    name: 'ES Module compatibility',
    async run() {
      log.info('Testing ES Module imports...');

      // Create a temporary test file to verify ES module imports work
      const testImport = `
        import { OpenRouterClient } from './dist/src/clients/openrouter.js';
        import { validateSearchInput } from './dist/src/schemas/search.js';
        import { createSearchTool } from './dist/src/tools/search.js';
        
        console.log('ES Module imports successful');
        process.exit(0);
      `;

      const tempFile = join(projectRoot, 'temp-import-test.mjs');
      await import('fs/promises').then(fs =>
        fs.writeFile(tempFile, testImport)
      );

      try {
        await execCommand('node', ['temp-import-test.mjs']);
        log.success('ES Module imports work correctly');
      } finally {
        // Clean up temp file
        await import('fs/promises').then(fs =>
          fs.unlink(tempFile).catch(() => {})
        );
      }
    },
  },
];

/**
 * Main verification function
 */
async function runVerification() {
  log.step('🚀 OpenRouter Search MCP Server - Build Verification');

  const startTime = Date.now();
  let failedSteps = 0;

  for (let i = 0; i < verificationSteps.length; i++) {
    const step = verificationSteps[i];

    try {
      log.step(`Step ${i + 1}/${verificationSteps.length}: ${step.name}`);
      await step.run();
    } catch (error) {
      log.error(`Step failed: ${step.name}`);
      log.error(error.message);
      failedSteps++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  log.step('📊 Verification Summary');

  if (failedSteps === 0) {
    log.success(
      `All ${verificationSteps.length} verification steps passed! (${duration}s)`
    );
    log.success('✨ Project is ready for deployment');
    process.exit(0);
  } else {
    log.error(
      `${failedSteps}/${verificationSteps.length} verification steps failed (${duration}s)`
    );
    log.error('🚨 Please fix the issues above before deployment');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', error => {
  log.error('Uncaught exception during verification:');
  log.error(error.message);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  log.error('Unhandled promise rejection during verification:');
  log.error(reason);
  process.exit(1);
});

// Run verification
runVerification().catch(error => {
  log.error('Verification failed:');
  log.error(error.message);
  process.exit(1);
});
