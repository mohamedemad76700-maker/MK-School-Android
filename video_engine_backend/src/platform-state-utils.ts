export type StateRecord = Record<string, any>;
export interface StateDeltaEntry { key: string; value: any; ordinal?: number }
export interface StateDeltaChange {
  kind: 'array' | 'object' | 'scalar';
  replace?: boolean;
  remove?: boolean;
  value?: any;
  upsert?: StateDeltaEntry[];
  delete?: string[];
}
export type StateDelta = Record<string, StateDeltaChange>;

const plainObject = (value: any): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const itemKey = (value: any, index: number): string => plainObject(value) && value.id != null && String(value.id) ? String(value.id).slice(0, 255) : `@${index}`;

/** Apply a bounded collection-level change set without replacing unrelated school records. */
export function applyPlatformStateChanges(currentInput: unknown, changesInput: unknown): StateRecord {
  const current: StateRecord = plainObject(currentInput) ? structuredClone(currentInput) : {};
  if (!plainObject(changesInput)) throw new Error('changes must be an object');
  const keys = Object.keys(changesInput);
  if (keys.length > 256) throw new Error('too many changed collections');
  let operations = 0;
  for (const rawKey of keys) {
    const key = rawKey.slice(0, 255);
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('invalid collection key');
    const change = changesInput[rawKey] as StateDeltaChange;
    if (!change || !['array','object','scalar'].includes(change.kind)) throw new Error('invalid change kind');
    if (change.remove === true) { delete current[key]; operations++; continue; }
    if (change.replace === true) {
      current[key] = structuredClone(change.value);
      operations++;
      continue;
    }
    if (change.kind === 'scalar') throw new Error('scalar changes must replace the value');
    const upsert = Array.isArray(change.upsert) ? change.upsert : [];
    const deleted = Array.isArray(change.delete) ? change.delete.map(String) : [];
    operations += upsert.length + deleted.length;
    if (operations > 20000) throw new Error('too many changed records');
    if (change.kind === 'array') {
      const input = Array.isArray(current[key]) ? current[key] : [];
      const map = new Map<string, {value:any; ordinal:number}>();
      input.forEach((value:any,index:number)=>map.set(itemKey(value,index),{value,ordinal:index}));
      for (const id of deleted) map.delete(id);
      for (const row of upsert) {
        if (!row || typeof row.key !== 'string' || !row.key || row.key.length > 255) throw new Error('invalid array record key');
        const ordinal = Number.isSafeInteger(row.ordinal) && Number(row.ordinal) >= 0 ? Number(row.ordinal) : map.size;
        map.set(row.key,{value:structuredClone(row.value),ordinal});
      }
      current[key] = [...map.entries()].sort((a,b)=>a[1].ordinal-b[1].ordinal || a[0].localeCompare(b[0])).map(([,row])=>row.value);
    } else {
      const input = plainObject(current[key]) ? current[key] : {};
      for (const k of deleted) if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') delete input[k];
      for (const row of upsert) {
        if (!row || typeof row.key !== 'string' || !row.key || row.key.length > 255 || ['__proto__','constructor','prototype'].includes(row.key)) throw new Error('invalid object property key');
        input[row.key] = structuredClone(row.value);
      }
      current[key] = input;
    }
  }
  return current;
}

export function diffPlatformState(baseInput: unknown, localInput: unknown, allowedKeys?: Set<string>): StateDelta {
  const base: StateRecord = plainObject(baseInput) ? baseInput : {};
  const local: StateRecord = plainObject(localInput) ? localInput : {};
  const keySet = allowedKeys ?? new Set([...Object.keys(base), ...Object.keys(local)]);
  const delta: StateDelta = {};
  for (const key of keySet) {
    if (key === 'users' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const before = base[key], after = local[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!(key in local)) { delta[key] = {kind:'scalar',remove:true}; continue; }
    if (Array.isArray(after) && Array.isArray(before)) {
      const beforeMap = new Map<string,{value:any;ordinal:number}>();
      before.forEach((value,index)=>beforeMap.set(itemKey(value,index),{value,ordinal:index}));
      const afterMap = new Map<string,{value:any;ordinal:number}>();
      after.forEach((value,index)=>afterMap.set(itemKey(value,index),{value,ordinal:index}));
      const upsert: StateDeltaEntry[] = [];
      for (const [id,row] of afterMap) {
        const previous = beforeMap.get(id);
        if (!previous || previous.ordinal !== row.ordinal || JSON.stringify(previous.value) !== JSON.stringify(row.value)) upsert.push({key:id,ordinal:row.ordinal,value:row.value});
      }
      const removed = [...beforeMap.keys()].filter(id=>!afterMap.has(id));
      delta[key] = {kind:'array',upsert,delete:removed};
    } else if (plainObject(after) && plainObject(before)) {
      const upsert = Object.entries(after).filter(([k,v])=>JSON.stringify(before[k])!==JSON.stringify(v)).map(([k,value])=>({key:k,value}));
      const removed = Object.keys(before).filter(k=>!(k in after));
      delta[key] = {kind:'object',upsert,delete:removed};
    } else {
      const kind = Array.isArray(after) ? 'array' : plainObject(after) ? 'object' : 'scalar';
      delta[key] = {kind,replace:true,value:after};
    }
  }
  return delta;
}

/** Three-way merge keyed school data. Server wins same-field conflicts; disjoint edits are kept. */
export function mergePlatformState(baseInput: unknown, localInput: unknown, remoteInput: unknown): StateRecord {
  const base: StateRecord = plainObject(baseInput) ? baseInput : {};
  const local: StateRecord = plainObject(localInput) ? localInput : {};
  const remote: StateRecord = plainObject(remoteInput) ? remoteInput : {};
  const output: StateRecord = structuredClone(remote);
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (key === 'users' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (JSON.stringify(base[key]) === JSON.stringify(local[key])) continue;
    if (JSON.stringify(base[key]) === JSON.stringify(remote[key])) { if (key in local) output[key] = structuredClone(local[key]); else delete output[key]; continue; }
    if (Array.isArray(base[key]) && Array.isArray(local[key]) && Array.isArray(remote[key])) {
      const identity = (value:any,index:number)=>itemKey(value,index);
      const b = new Map(base[key].map((value:any,index:number)=>[identity(value,index),value]));
      const l = new Map(local[key].map((value:any,index:number)=>[identity(value,index),value]));
      const r = new Map(remote[key].map((value:any,index:number)=>[identity(value,index),value]));
      const merged = new Map(r);
      for (const id of new Set([...b.keys(),...l.keys()])) {
        const old=b.get(id), mine=l.get(id), theirs=r.get(id);
        if (JSON.stringify(old)===JSON.stringify(mine)) continue;
        if (JSON.stringify(old)===JSON.stringify(theirs)) { if (l.has(id)) merged.set(id,mine); else merged.delete(id); }
      }
      output[key] = [...merged.values()];
    } else if (plainObject(base[key]) && plainObject(local[key]) && plainObject(remote[key])) {
      const merged = structuredClone(remote[key]);
      for (const prop of new Set([...Object.keys(base[key]),...Object.keys(local[key]),...Object.keys(remote[key])])) {
        if (JSON.stringify(base[key][prop])===JSON.stringify(local[key][prop])) continue;
        if (JSON.stringify(base[key][prop])===JSON.stringify(remote[key][prop])) { if (prop in local[key]) merged[prop]=structuredClone(local[key][prop]); else delete merged[prop]; }
      }
      output[key]=merged;
    }
    // Scalar or same-record conflicts intentionally leave the remote value untouched.
  }
  return output;
}
