// import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

async function testSystem() {
  console.log('🧪 Testing Crypto-Ledger System\n');
  console.log('=' .repeat(50));

  try {
    // 1. Health Check
    console.log('\n1️⃣  Testing health endpoint...');
    const health = await axios.get(`${API_URL}/health`);
    console.log('✅ Health:', health.data.status);

    // 2. Create Entry
    console.log('\n2️⃣  Creating journal entry...');
    const entry = await axios.post(`${API_URL}/entries`, {
      date: new Date().toISOString().split('T')[0],
      description: 'Automated test entry',
      postings: [
        { accountCode: '1000', debit: 500, credit: 0 },
        { accountCode: '4000', debit: 0, credit: 500 },
      ],
    });
    console.log('✅ Entry created:', entry.data.id);
    console.log('   Hash:', entry.data.hash.substring(0, 16) + '...');

    // 3. List Entries
    console.log('\n3️⃣  Listing entries...');
    const entries = await axios.get(`${API_URL}/entries`);
    console.log('✅ Total entries:', entries.data.pagination.total);

    // 4. Verify Chain
    console.log('\n4️⃣  Verifying hash chain...');
    const chain = await axios.get(`${API_URL}/entries/verify/chain`);
    console.log('✅ Chain valid:', chain.data.isValid);
    console.log('   Total entries:', chain.data.totalEntries);

    // 5. Get Accounts
    console.log('\n5️⃣  Getting accounts...');
    const accounts = await axios.get(`${API_URL}/accounts`);
    console.log('✅ Total accounts:', accounts.data.length);

    // 6. Get Dimensions
    console.log('\n6️⃣  Getting dimensions...');
    const dimensions = await axios.get(`${API_URL}/dimensions`);
    console.log('✅ Total dimensions:', dimensions.data.length);

    console.log('\n' + '='.repeat(50));
    console.log('🎉 All tests passed!');
    console.log('=' .repeat(50));
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testSystem();
