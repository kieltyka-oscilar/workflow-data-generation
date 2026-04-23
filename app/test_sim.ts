import * as fs from 'fs';
import { simulateWorkflow } from './src/utils/engine';
import { Workflow } from './src/types';

const wf = JSON.parse(fs.readFileSync('../rp-setup2.json', 'utf8')).workflow as Workflow;
const lines = fs.readFileSync('../rp-test4.jsonl', 'utf8').trim().split('\n');

for (let i = 0; i < lines.length; i++) {
  const record = JSON.parse(lines[i]);
  const sim = simulateWorkflow(record, wf);
  console.log(`Record ${i}: ${sim}`);
}
