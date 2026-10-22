import { transformFileSync, transformSync } from '@babel/core';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
const configFile = path.join(projectRoot, 'babel.config.js');

it('loads the installed Realm SDK instead of circularly importing the app Realm module', () => {
  const result = transformFileSync(
    path.join(projectRoot, 'src/realm/database.ts'),
    { configFile, babelrc: false },
  );
  expect(result?.code).toMatch(/require\(["']realm["']\)/);
  expect(result?.code).not.toMatch(/require\(["']\.\/index["']\)/);
});

it('continues resolving explicit app aliases to their source modules', () => {
  const result = transformSync(
    "import { realmDB } from '@/realm'; export const database = realmDB;",
    { filename: path.join(projectRoot, 'App.tsx'), configFile, babelrc: false },
  );
  expect(result?.code).toMatch(/require\(["']\.\/src\/realm["']\)/);
});
