// Quick test to verify PDF-to-image conversion works
import { pdf } from 'pdf-to-img';
import { readFileSync } from 'fs';

const testFile = process.argv[2] || 'test-showdown-schedule.pdf';

try {
  const buf = readFileSync(testFile);
  console.log(`Testing PDF conversion on: ${testFile} (${(buf.length / 1024).toFixed(0)}KB)`);

  const doc = await pdf(buf, { scale: 2.0 });
  console.log(`Total pages: ${doc.length}`);

  let pageNum = 0;
  for await (const page of doc) {
    pageNum++;
    console.log(`  Page ${pageNum}: ${(page.length / 1024).toFixed(0)}KB PNG`);
    if (pageNum >= 5) {
      console.log('  (stopping at 5 pages for test)');
      break;
    }
  }

  console.log('\nPDF conversion: OK');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
