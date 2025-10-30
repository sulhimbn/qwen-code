/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('edit', () => {
  it('should be able to edit content in a file', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to edit content in a file');

    const fileName = 'file_to_edit.txt';
    const originalContent = 'original content';
    const expectedContent = 'edited content';

    rig.createFile(fileName, originalContent);
    const prompt = `Can you edit the file 'file_to_edit.txt' to change 'original' to 'edited'`;

    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('edit');

    // Add debugging information
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find an edit tool call').toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(
      result,
      ['edited', 'file_to_edit.txt'],
      'Edit content test',
    );

    const newFileContent = rig.readFile(fileName);

    // Add debugging for file content
    if (newFileContent !== expectedContent) {
      console.error('File content mismatch - Debug info:');
      console.error('Expected:', expectedContent);
      console.error('Actual:', newFileContent);
      console.error(
        'Tool calls:',
        rig.readToolLogs().map((t) => ({
          name: t.toolRequest.name,
          args: t.toolRequest.args,
        })),
      );
    }

    expect(newFileContent).toBe(expectedContent);

    // Log success info if verbose
    vi.stubEnv('VERBOSE', 'true');
    if (process.env['VERBOSE'] === 'true') {
      console.log('File edited successfully. New content:', newFileContent);
    }
  });

  it('should handle $ literally when replacing text ending with $', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should handle $ literally when replacing text ending with $',
    );

    const fileName = 'regex.yml';
    const originalContent = "| select('match', '^[sv]d[a-z]$')\n";
    const expectedContent = "| select('match', '^[sv]d[a-z]$') # updated\n";

    rig.createFile(fileName, originalContent);

    const prompt =
      "Open regex.yml and append ' # updated' after the line containing ^[sv]d[a-z]$ without breaking the $ character.";

    const result = await rig.run(prompt);
    const foundToolCall = await rig.waitForToolCall('edit');

    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }

    expect(foundToolCall, 'Expected to find an edit tool call').toBeTruthy();

    validateModelOutput(result, ['regex.yml'], 'Replace $ literal test');

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe(expectedContent);
  });

  it.skip('should fail safely when old_string is not found', async () => {
    const rig = new TestRig();
    await rig.setup('should fail safely when old_string is not found');
    const fileName = 'no_match.txt';
    const fileContent = 'hello world';
    rig.createFile(fileName, fileContent);

    const prompt = `replace "goodbye" with "farewell" in ${fileName}`;
    await rig.run(prompt);

    await rig.waitForTelemetryReady();
    const toolLogs = rig.readToolLogs();

    const editAttempt = toolLogs.find((log) => log.toolRequest.name === 'edit');
    const readAttempt = toolLogs.find(
      (log) => log.toolRequest.name === 'read_file',
    );

    // VERIFY: The model must have at least tried to read the file or perform an edit.
    expect(
      readAttempt || editAttempt,
      'Expected model to attempt a read_file or edit',
    ).toBeDefined();

    // If the model tried to edit, that specific attempt must have failed.
    if (editAttempt) {
      if (editAttempt.toolRequest.success) {
        console.error('The edit tool succeeded when it was expected to fail');
        console.error('Tool call args:', editAttempt.toolRequest.args);
      }
      expect(
        editAttempt.toolRequest.success,
        'If edit is called, it must fail',
      ).toBe(false);
    }

    // CRITICAL: The final content of the file must be unchanged.
    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe(fileContent);
  });

  it('should insert a multi-line block of text', async () => {
    const rig = new TestRig();
    await rig.setup('should insert a multi-line block of text');
    const fileName = 'insert_block.js';
    const originalContent = 'function hello() {\n  // INSERT_CODE_HERE\n}';
    const newBlock = "console.log('hello');\n  console.log('world');";
    const expectedContent = `function hello() {\n  ${newBlock}\n}`;
    rig.createFile(fileName, originalContent);

    const prompt = `In ${fileName}, replace "// INSERT_CODE_HERE" with:\n${newBlock}`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('edit');
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(foundToolCall, 'Expected to find an edit tool call').toBeTruthy();

    const newFileContent = rig.readFile(fileName);

    expect(newFileContent.replace(/\r\n/g, '\n')).toBe(
      expectedContent.replace(/\r\n/g, '\n'),
    );
  });

  it('should delete a block of text', async () => {
    const rig = new TestRig();
    await rig.setup('should delete a block of text');
    const fileName = 'delete_block.txt';
    const blockToDelete =
      '## DELETE THIS ##\nThis is a block of text to delete.\n## END DELETE ##';
    const originalContent = `Hello\n${blockToDelete}\nWorld`;
    // When deleting the block, a newline remains from the original structure (Hello\n + \nWorld)
    rig.createFile(fileName, originalContent);

    const prompt = `In ${fileName}, delete the entire block from "## DELETE THIS ##" to "## END DELETE ##" including the markers.`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('edit');
    if (!foundToolCall) {
      printDebugInfo(rig, result);
    }
    expect(foundToolCall, 'Expected to find an edit tool call').toBeTruthy();

    const newFileContent = rig.readFile(fileName);

    // Accept either 1 or 2 newlines between Hello and World
    expect(newFileContent).toMatch(/^Hello\n\n?World$/);
  });
});
