// 本地存储层：用 IndexedDB（通过 idb-keyval 简化）替代 Claude artifact 专属的 window.storage。
// API 形态保持相似，方便从原 artifact 代码迁移过来。
//
// 注意：这是"设备本地"存储，换手机/换浏览器不会同步。
// 如果以后想要多设备同步，把这个文件换成调用云端数据库（如 Supabase）即可，
// 上层组件的调用方式不需要改变。

import { get, set, del, keys } from "idb-keyval";

// 导出全部数据为一个普通对象（用于备份）
export async function storageExportAll() {
  const out = {};
  const all = await keys();
  for (const k of all) out[String(k)] = await get(k);
  return out;
}

// 从备份对象恢复（覆盖同名键）
export async function storageImportAll(obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    await set(k, v);
  }
}

export async function storageGet(key) {
  try {
    const value = await get(key);
    return value === undefined ? null : { key, value };
  } catch (e) {
    console.error("storage get failed", e);
    return null;
  }
}

export async function storageSet(key, value) {
  try {
    await set(key, value);
    return { key, value };
  } catch (e) {
    console.error("storage set failed", e);
    return null;
  }
}

export async function storageDelete(key) {
  try {
    await del(key);
    return { key, deleted: true };
  } catch (e) {
    console.error("storage delete failed", e);
    return null;
  }
}

export async function storageList(prefix = "") {
  try {
    const all = await keys();
    const filtered = prefix ? all.filter((k) => String(k).startsWith(prefix)) : all;
    return { keys: filtered, prefix };
  } catch (e) {
    console.error("storage list failed", e);
    return null;
  }
}
