const APP_ID = 'YOUR_CAST_APP_ID_HERE';

window['__onGCastApiAvailable'] = function (isAvailable) {
  if (!isAvailable) return;

  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  const ctx = cast.framework.CastContext.getInstance();
  ctx.addEventListener(
    cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
    (e) => {
      const s = e.sessionState;
      const status = document.getElementById('status');
      if (s === cast.framework.SessionState.SESSION_STARTED) {
        const name = ctx.getCurrentSession().getCastDevice().friendlyName;
        status.textContent = `Casting to ${name}`;
      } else if (s === cast.framework.SessionState.SESSION_ENDED) {
        status.textContent = 'Cast session ended.';
      }
    }
  );
};
