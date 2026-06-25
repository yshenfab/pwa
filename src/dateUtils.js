export const pad = (n) => String(n).padStart(2, "0");

export const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayKey = () => toKey(new Date());

export const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return toKey(new Date(y, m - 1, d + n));
};

const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export const formatDisplay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日 ${weekdayCN[dt.getDay()]}`;
};

export const dayIndex = (key, len) => {
  const [y, m, d] = key.split("-").map(Number);
  const epoch = Math.floor(new Date(y, m - 1, d).getTime() / 86400000);
  return ((epoch % len) + len) % len;
};
