import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const required = [
  '/src/navigation-preferences.test.ts',
  '/src/navigation-state.test.ts',
  '/src/navigation-menu.test.ts',
  '/src/navigation-assets.test.ts',
  '/src/api/core/menu.test.ts',
  '/src/api/system/personal-notification.test.ts',
  '/src/views/system/user/index.test.ts',
  '/src/views/system/user/user-modal.test.ts',
  '/src/layouts/personal-notification-entry.test.ts',
  '/src/layouts/native-notification.test.ts',
  '/src/views/system/notification/index.test.ts',
  '/src/store/personal-notification.test.ts',
  '/src/router/retired-tabs.test.ts',
  '/src/router/routes-helper.test.ts',
  '/src/router/routes-recovery.test.ts',
  '/src/router/routes/legacy-wechat.test.ts',
  '/src/views/system/business-config/index.test.ts',
  '/src/api/system/wechat.test.ts',
  '/src/views/_core/authentication/wechat-entry.test.ts',
  '/src/views/_core/authentication/wechat-result.test.ts',
  '/src/views/system/ai-model/index.test.ts',
  '/src/views/system/ai-config/form.test.ts',
  '/src/views/system/ai-config/ModelHubWorkspace.test.ts',
  '/src/views/system/ai-config/SceneRoutingWorkspace.test.ts',
  '/src/views/system/ai-config/SimpleSettingsPanel.test.ts',
  '/src/views/system/ai-application/KeyPolicyEditor.test.ts',
  '/src/views/system/ai-request/RequestLogPanel.test.ts',
  '/src/views/system/ai-request/MonitorWorkspace.test.ts',
  '/src/views/system/ai-request/CallLogPanel.test.ts',
  '/src/views/system/ai-request/call-log-format.test.ts',
  '/src/views/system/ai-request/conversations/ConversationBoard.test.ts',
  '/src/views/system/ai-template/workspace/ordered-autosave.test.ts',
  '/src/views/system/ai-template/workspace/prompt-tokens.test.ts',
  '/src/views/system/ai-template/workspace/query-parameters.test.ts',
  '/src/views/system/ai-template/workspace/scene-save-adapter.test.ts',
  '/src/views/system/ai-template/workspace/SceneWorkspace.test.ts',
  '/src/views/system/ai-template/workspace/SceneDataSelector.test.ts',
  '/src/views/system/ai-template/workspace/SceneTrialPanel.test.ts',
  '/src/views/system/ai-template/workspace/DatabaseBindingEditor.test.ts',
  '/src/views/system/ai-template/workspace/DatabaseRecordPicker.test.ts',
  '/src/views/system/ai-template/workspace/DataReferenceTable.test.ts',
  '/src/views/system/ai-template/workspace/PromptEditor.test.ts',
  '/src/views/system/ai-template/workspace/PromptTextEditor.test.ts',
  '/src/views/system/ai-template/workspace/SqlReferenceAssistant.test.ts',
  '/src/api/system/ai-template.test.ts',
  '/src/api/system/ai-runtime-stream.test.ts',
  '/src/api/system/ai-runtime-errors.test.ts',
  '/src/views/lowcode/records/index.test.ts',
  '/src/views/lowcode/records/AiSummaryDialog.test.ts',
  '/src/router/routes/legacy-ai.test.ts',
  '/src/views/lowcode/form-schema.test.ts',
  '/src/views/lowcode/forms/FormDesigner.test.ts',
  '/src/views/lowcode/forms/designer-schema.test.ts',
  '/src/views/lowcode/RuntimeFields.test.ts',
  '/src/views/lowcode/forms/FormSharing.test.ts',
  '/src/views/lowcode/fill/index.test.ts',
  '/src/router/menu-cleanup.test.ts',
  '/src/styles/workspace-theme.test.ts',
  '/src/router/guard.test.ts',
];
const authSuites = [
  '/src/api/core/session-info.test.mjs',
  '/src/views/_core/authentication/captcha-state.test.mjs',
];
export function verify(report, requiredSuites = required) {
  assert.equal(report.success, true, 'Application test run must succeed');
  assert.equal(report.numFailedTests, 0);
  assert.equal(
    report.numPendingTests,
    0,
    'Required application tests cannot be skipped',
  );
  assert.ok(report.testResults.length > 0, 'Test report must contain suites');
  for (const suite of report.testResults) {
    assert.equal(suite.status, 'passed', `Suite failed: ${suite.name}`);
    assert.ok(
      suite.assertionResults.length > 0,
      `Suite ran zero tests: ${suite.name}`,
    );
    for (const test of suite.assertionResults)
      assert.equal(
        test.status,
        'passed',
        `Test did not pass: ${test.fullName}`,
      );
  }
  for (const suffix of requiredSuites) {
    const suites = report.testResults.filter((suite) =>
      suite.name.replaceAll('\\', '/').endsWith(suffix),
    );
    assert.equal(
      suites.length,
      1,
      `Missing or duplicate required test report: ${suffix}`,
    );
    const suite = suites[0];
    assert.equal(suite.status, 'passed', `Required suite failed: ${suffix}`);
    assert.ok(
      suite.assertionResults.length > 0,
      `Required suite ran fewer than the required tests: ${suffix}`,
    );
    for (const test of suite.assertionResults)
      assert.equal(
        test.status,
        'passed',
        `Required test did not pass: ${test.fullName}`,
      );
  }
}
if (process.argv.includes('--self-test')) {
  const valid = {
    success: true,
    numFailedTests: 0,
    numPendingTests: 0,
    testResults: required.map((name) => ({
      name,
      status: 'passed',
      assertionResults: Array.from({ length: 1 }, () => ({
        status: 'passed',
        fullName: name,
      })),
    })),
  };
  verify(valid);
  verify(valid, []);
  assert.throws(() => verify({ ...valid, testResults: [] }, []));
  assert.throws(() => verify({ ...valid, testResults: [] }));
  for (const suffix of required) {
    const missing = structuredClone(valid);
    missing.testResults = missing.testResults.filter(
      (suite) => suite.name !== suffix,
    );
    assert.throws(() => verify(missing), `Missing suite accepted: ${suffix}`);
    const duplicate = structuredClone(valid);
    duplicate.testResults.push(
      structuredClone(
        duplicate.testResults.find((suite) => suite.name === suffix),
      ),
    );
    assert.throws(
      () => verify(duplicate),
      `Duplicate suite accepted: ${suffix}`,
    );
  }
  for (const status of ['failed', 'pending', 'skipped']) {
    const invalid = structuredClone(valid);
    invalid.testResults[0].assertionResults[0].status = status;
    assert.throws(() => verify(invalid));
  }
  console.log(
    'Required application report rejects missing, failed, pending, and skipped tests',
  );
} else {
  const root = process.argv.includes('--root');
  const auth = process.argv.includes('--auth');
  let reportPath = process.argv[2] ?? '.quality/web-ele.json';
  let suites = required;
  if (root) {
    reportPath = '.quality/root.json';
    suites = [];
  }
  if (auth) {
    reportPath = '.quality/auth.json';
    suites = authSuites;
  }
  verify(JSON.parse(readFileSync(reportPath, 'utf8')), suites);
  console.log(
    'Content, business configuration, lowcode, and router quality reports passed',
  );
}
