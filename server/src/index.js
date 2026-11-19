import { parseArgs } from 'node:util';
import { createApp } from './app.js';
import { createDb } from './db.js';

// --port ima prednost pred PORT (u razvoju PORT može biti postavljen za frontend).
const { values } = parseArgs({ options: { port: { type: 'string' } } });
const port = Number(values.port ?? process.env.PORT ?? 3001);
const db = await createDb();

if (db.inMemory) {
  console.warn('DATABASE_URL nije postavljen – koristi se baza u memoriji (podaci se gube pri ponovnom pokretanju).');
}

createApp(db).listen(port, () => {
  console.log(`StudyFlow API radi na http://localhost:${port}`);
});
