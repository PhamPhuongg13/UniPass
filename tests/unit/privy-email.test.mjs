import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSchoolEmail } from '../../src/lib/eligibility/privy-email.mjs';

test('selects school email over gmail', () => {
  assert.deepEqual(selectSchoolEmail([{ type: 'email', address: 'user@gmail.com', verified_at: 1 }, { type: 'email', address: 'Student@UIT.edu.vn', verified_at: 1 }]), { email: 'student@uit.edu.vn', domain: 'uit.edu.vn' });
});
test('accepts Google Workspace subdomain', () => {
  assert.deepEqual(selectSchoolEmail([{ type: 'google_oauth', email: 'student@gm.uit.edu.vn', verified_at: 1 }]), { email: 'student@gm.uit.edu.vn', domain: 'gm.uit.edu.vn' });
});
test('rejects lookalike and unverified accounts', () => {
  assert.equal(selectSchoolEmail([{ type: 'email', address: 'x@evil-edu.vn', verified_at: 1 }, { type: 'email', address: 'x@uit.edu.vn', verified_at: 0 }]), null);
});
