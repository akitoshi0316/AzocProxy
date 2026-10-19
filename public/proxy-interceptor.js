/* AzocProxy request interceptor.
   Runs inside the sandboxed proxied document and forces dynamic requests
   (fetch, XHR, beacons, EventSource) back through the proxy so third-party
   pages never talk to the network directly. WebSocket and Worker are
   disabled. The page's CSP is the hard backstop: even if a request path is
   missed here, connect-src/media-src/etc. only allow the proxy origin. */
(function () {
  "use strict";
  var PROXY = "/public/proxy";
  var baseMeta = document.querySelector('meta[name="azoc-base"]');
  var BASE = baseMeta ? baseMeta.content : "/";

  function encodeTarget(value) {
    var bytes = new TextEncoder().encode(value);
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(2).padStart(8, "0");
    }
    return out;
  }

  function toProxy(input) {
    if (typeof input !== "string") {
      try {
        input = String(input);
      } catch (e) {
        return "about:blank";
      }
    }
    var trimmed = input.trim();
    if (/^(#|data:|blob:|mailto:|tel:|about:)/i.test(trimmed)) return input;
    if (trimmed.indexOf(PROXY + "?") === 0) return input;
    try {
      return PROXY + "?url=" + encodeTarget(new URL(trimmed, BASE).toString());
    } catch (e) {
      return "about:blank";
    }
  }

  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string" || input instanceof URL) {
          input = toProxy(String(input));
        } else if (input && input.url) {
          input = new Request(toProxy(input.url), input);
        }
      } catch (e) {
        /* fall through with the original input; CSP blocks direct egress */
      }
      return originalFetch.call(this, input, init);
    };
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      url = toProxy(url);
    } catch (e) {
      /* CSP backstop */
    }
    var args = [method, url];
    for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
    return originalOpen.apply(this, args);
  };

  if (navigator.sendBeacon) {
    var originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try {
        url = toProxy(url);
      } catch (e) {
        /* CSP backstop */
      }
      return originalBeacon(url, data);
    };
  }

  if (window.EventSource) {
    var OriginalEventSource = window.EventSource;
    window.EventSource = function (url, config) {
      return new OriginalEventSource(toProxy(url), config);
    };
    window.EventSource.prototype = OriginalEventSource.prototype;
  }

  window.WebSocket = function () {
    throw new Error("WebSocket is disabled on this proxy");
  };
  window.Worker = function () {
    throw new Error("Worker is disabled on this proxy");
  };
  if (window.SharedWorker) {
    window.SharedWorker = function () {
      throw new Error("SharedWorker is disabled on this proxy");
    };
  }
})();
