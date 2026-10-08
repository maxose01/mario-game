'use strict';
// When the game is served by server.js this file is replaced on the fly with
// `window.CLAYKART_SERVER = true;`, which tells the big screen and the phones that the local
// party relay is available. From a static host or from disk it stays false (online mode).
// Sandboxed previews that can't use WebRTC also set `window.CLAYKART_EMBED = true;` here.
window.CLAYKART_SERVER = false;
