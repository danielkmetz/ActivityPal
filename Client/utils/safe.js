export const safeEntries = (obj) => {
  if (obj == null || typeof obj !== 'object') return [];
  return Object.entries(obj);
};

export const devLog = (...args) => {
  if (typeof __DEV__ === 'boolean' ? __DEV__ : process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};

// store/actionTracerMiddleware.js
export const actionTracerMiddleware = _store => next => action => {
  console.log('[Action->]', action?.type);
  const out = next(action);
  console.log('[Action<-]', action?.type);
  return out;
};
