import fs from 'fs';
import path from 'path';

const FILE = path.resolve(process.cwd(), 'gdrive_tokens_global.json');

export function loadGlobalTokens(){
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}
export function saveGlobalTokens(tokens){
  const cur = loadGlobalTokens() || {};
  fs.writeFileSync(FILE, JSON.stringify({ ...cur, ...tokens }, null, 2));
}
export function isConnectedGlobally(){
  return !!loadGlobalTokens();
}
