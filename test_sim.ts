import * as fs from 'fs';
import { simulateWorkflow } from './app/src/utils/engine';

const wfData = JSON.parse(fs.readFileSync('rpnewsetup.json', 'utf8'));
const wf = wfData.workflows.find((w: any) => w.name === 'test_kyc_onboarding');
const eventType = wfData.event_types.find((et: any) => et.id === wf.event_type_id);
const schema = eventType.input_features.fields;

function fuzzData(base: any, schemaFields: any[], constraints: any = {}) {
    // We'll use a mocked fuzzData or just rely on actual one
    const { fuzzData: engineFuzzData } = require('./app/src/utils/engine');
    return engineFuzzData(base, schemaFields, constraints);
}

function pruneToSchema(data: any, schemaFields: any[]) {
    const { pruneToSchema: enginePrune } = require('./app/src/utils/engine');
    return enginePrune(data, schemaFields);
}

function testOutcome(outcomeName: string) {
    console.log(`Testing outcome: ${outcomeName}`);
    let success = false;
    let iterations = 0;
    const maxRetries = 5000;
    
    for (let i = 0; i < maxRetries; i++) {
        iterations++;
        const fuzzed = fuzzData({}, schema, {});
        const candidate = pruneToSchema(fuzzed, schema);
        try {
            const result = simulateWorkflow(candidate, wf, wfData);
            if (result === outcomeName) {
                console.log(`Success! Found on iteration ${iterations}`);
                console.log(JSON.stringify(candidate, null, 2));
                success = true;
                break;
            }
        } catch (e: any) {
             console.log(`Error on iteration ${iterations}: ${e.message}`);
             break;
        }
    }
    if (!success) {
        console.log(`Failed to reach ${outcomeName} after ${maxRetries} iterations`);
    }
}

testOutcome('Approve_without_equifax');
testOutcome('Approve');
