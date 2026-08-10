/* Compatibility bridge. Phase 6 moved video feedback to fight-review-studio.js. */
(function(){
  'use strict';
  window.VideoFeedback = window.VideoFeedback || {
    open: async function(url,title){
      // Cross-origin technique videos remain supported by video-player.js.
      // Exact annotations are available for local HTML5 video via JudoFightReview.
      window.__JUDO_LAST_VIDEO_FEEDBACK = {url:url||'', title:title||''};
    },
    getState: function(){ return window.JudoFightReview?.getReview?.() || null; },
    refresh: function(){}
  };
})();
