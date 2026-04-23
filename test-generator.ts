import fs from 'fs';
import { simulateWorkflow } from './app/src/utils/engine';
import { SchemaField } from './app/src/types';

const wf = JSON.parse(fs.readFileSync('rpnewsetup.json', 'utf8'));

// Assuming workflow schema is in event_types
const eventType = wf.event_types ? wf.event_types[0] : wf.event_types;
const schema = eventType.input_features.fields;

const workflow = wf.workflows ? wf.workflows[0] : wf;

const rules = [];

console.log("Testing generation...");
let success = 0;
for (let i = 0; i < 1000; i++) {
  // We need to write a script that tests the same loop that PreviewGeneration does.
}
