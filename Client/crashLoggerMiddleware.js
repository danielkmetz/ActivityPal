export const crashLoggerMiddleware = _store => next => action => {
  try {
    return next(action);
  } catch (e) {
    console.error('[ReduxCrash]', {
      type: action?.type,                // ✅ include action type
      hasPayload: !!action?.payload,
      hasMeta: !!action?.meta,
      metaArg: action?.meta?.arg ? { ...action.meta.arg } : null,
      errorMessage: e?.message,
      stack: e?.stack,
    });
    throw e;
  }
};
