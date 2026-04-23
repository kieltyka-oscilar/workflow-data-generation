import fs from 'fs';
import { simulateWorkflow } from './app/src/utils/engine';

const wf = JSON.parse(fs.readFileSync('./rpapprovewithoutequifax.json', 'utf-8'));
const record = {
  equifaxDecision: 'review',
  telesign_verified: true,
  emailage: { risk_rating: 'low', review_status: 'pass' },
  sentilink_score: 800
};

console.log(simulateWorkflow(record, wf));
