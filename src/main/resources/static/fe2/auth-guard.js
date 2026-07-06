(function () {
  function getToken() {
    return localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
  }

  function clearAuth() {
    localStorage.removeItem("smoke_token");
    localStorage.removeItem("smartSmokeToken");
    localStorage.removeItem("token");
    localStorage.removeItem("smoke_user");
  }

  function goLogin() {
    clearAuth();
    if (!location.pathname.endsWith("/index.html") && location.pathname !== "/") {
      location.replace("/");
    }
  }

  function isAuthErrorPayload(payload) {
    var message = String((payload && (payload.msg || payload.message)) || "").toLowerCase();
    return message.indexOf("token") >= 0 ||
      message.indexOf("login") >= 0 ||
      message.indexOf("auth") >= 0 ||
      message.indexOf("expired") >= 0 ||
      message.indexOf("invalid") >= 0;
  }

  var token = getToken();
  if (!token) {
    goLogin();
    return;
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = async function () {
    var response = await originalFetch.apply(window, arguments);
    if (response.status === 401) {
      goLogin();
      return response;
    }
    try {
      var cloned = response.clone();
      var body = await cloned.json();
      if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "code")) {
        if (body.code !== 200 && isAuthErrorPayload(body)) {
          goLogin();
        }
      }
    } catch (error) {
    }
    return response;
  };
})();
