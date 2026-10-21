(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins = cap.Plugins = cap.Plugins || {};
        const getPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const isNativePlatform = () => getPlatform() !== "web";
        const isPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const getPluginHeader = (pluginName) => {
          var _a;
          return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
        };
        const handleError = (err) => win.console.error(err);
        const registeredPlugins = /* @__PURE__ */ new Map();
        const registerPlugin2 = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a, _b;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
              }
            } else if (impl) {
              return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve) => call.then(() => resolve({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
          });
          return proxy;
        };
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      WebPlugin = class {
        constructor() {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          var _a;
          return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          this.listeners[eventName].splice(index, 1);
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = `; expires=${(options.expires || "").replace("expires=", "")}`;
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
      (function(SystemBarsStyle2) {
        SystemBarsStyle2["Dark"] = "DARK";
        SystemBarsStyle2["Light"] = "LIGHT";
        SystemBarsStyle2["Default"] = "DEFAULT";
      })(SystemBarsStyle || (SystemBarsStyle = {}));
      (function(SystemBarType2) {
        SystemBarType2["StatusBar"] = "StatusBar";
        SystemBarType2["NavigationBar"] = "NavigationBar";
      })(SystemBarType || (SystemBarType = {}));
      SystemBarsPluginWeb = class extends WebPlugin {
        async setStyle() {
          this.unavailable("not available for web");
        }
        async setAnimation() {
          this.unavailable("not available for web");
        }
        async show() {
          this.unavailable("not available for web");
        }
        async hide() {
          this.unavailable("not available for web");
        }
      };
      SystemBars = registerPlugin("SystemBars", {
        web: () => new SystemBarsPluginWeb()
      });
    }
  });

  // node_modules/@capacitor/device/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    DeviceWeb: () => DeviceWeb
  });
  var DeviceWeb;
  var init_web = __esm({
    "node_modules/@capacitor/device/dist/esm/web.js"() {
      init_dist();
      DeviceWeb = class extends WebPlugin {
        async getId() {
          return {
            identifier: this.getUid()
          };
        }
        async getInfo() {
          if (typeof navigator === "undefined" || !navigator.userAgent) {
            throw this.unavailable("Device API not available in this browser");
          }
          const ua = navigator.userAgent;
          const uaFields = this.parseUa(ua);
          return {
            model: uaFields.model,
            platform: "web",
            operatingSystem: uaFields.operatingSystem,
            osVersion: uaFields.osVersion,
            manufacturer: navigator.vendor,
            isVirtual: false,
            webViewVersion: uaFields.browserVersion
          };
        }
        async getBatteryInfo() {
          if (typeof navigator === "undefined" || !navigator.getBattery) {
            throw this.unavailable("Device API not available in this browser");
          }
          let battery = {};
          try {
            battery = await navigator.getBattery();
          } catch (e) {
          }
          return {
            batteryLevel: battery.level,
            isCharging: battery.charging
          };
        }
        async getLanguageCode() {
          return {
            value: navigator.language.split("-")[0].toLowerCase()
          };
        }
        async getLanguageTag() {
          return {
            value: navigator.language
          };
        }
        parseUa(ua) {
          const uaFields = {};
          const start = ua.indexOf("(") + 1;
          let end = ua.indexOf(") AppleWebKit");
          if (ua.indexOf(") Gecko") !== -1) {
            end = ua.indexOf(") Gecko");
          }
          const fields = ua.substring(start, end);
          if (ua.indexOf("Android") !== -1) {
            const tmpFields = fields.replace("; wv", "").split("; ").pop();
            if (tmpFields) {
              uaFields.model = tmpFields.split(" Build")[0];
            }
            uaFields.osVersion = fields.split("; ")[1];
          } else {
            uaFields.model = fields.split("; ")[0];
            if (typeof navigator !== "undefined" && navigator.oscpu) {
              uaFields.osVersion = navigator.oscpu;
            } else {
              if (ua.indexOf("Windows") !== -1) {
                uaFields.osVersion = fields;
              } else {
                const tmpFields = fields.split("; ").pop();
                if (tmpFields) {
                  const lastParts = tmpFields.replace(" like Mac OS X", "").split(" ");
                  uaFields.osVersion = lastParts[lastParts.length - 1].replace(/_/g, ".");
                }
              }
            }
          }
          if (/android/i.test(ua)) {
            uaFields.operatingSystem = "android";
          } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
            uaFields.operatingSystem = "ios";
          } else if (/Win/.test(ua)) {
            uaFields.operatingSystem = "windows";
          } else if (/Mac/i.test(ua)) {
            uaFields.operatingSystem = "mac";
          } else {
            uaFields.operatingSystem = "unknown";
          }
          const isSafari = !!window.ApplePaySession;
          const isChrome = !!window.chrome;
          const isFirefox = /Firefox/.test(ua);
          const isEdge = /Edg/.test(ua);
          const isFirefoxIOS = /FxiOS/.test(ua);
          const isChromeIOS = /CriOS/.test(ua);
          const isEdgeIOS = /EdgiOS/.test(ua);
          if (isSafari || isChrome && !isEdge || isFirefoxIOS || isChromeIOS || isEdgeIOS) {
            let searchWord;
            if (isFirefoxIOS) {
              searchWord = "FxiOS";
            } else if (isChromeIOS) {
              searchWord = "CriOS";
            } else if (isEdgeIOS) {
              searchWord = "EdgiOS";
            } else if (isSafari) {
              searchWord = "Version";
            } else {
              searchWord = "Chrome";
            }
            const words = ua.split(" ");
            for (const word of words) {
              if (word.includes(searchWord)) {
                const version = word.split("/")[1];
                uaFields.browserVersion = version;
              }
            }
          } else if (isFirefox || isEdge) {
            const reverseUA = ua.split("").reverse().join("");
            const reverseVersion = reverseUA.split("/")[0];
            const version = reverseVersion.split("").reverse().join("");
            uaFields.browserVersion = version;
          }
          return uaFields;
        }
        getUid() {
          if (typeof window !== "undefined" && window.localStorage) {
            let uid = window.localStorage.getItem("_capuid");
            if (uid) {
              return uid;
            }
            uid = this.uuid4();
            window.localStorage.setItem("_capuid", uid);
            return uid;
          }
          return this.uuid4();
        }
        uuid4() {
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === "x" ? r : r & 3 | 8;
            return v.toString(16);
          });
        }
      };
    }
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/events.enum.js
  var TerminalEventsEnum;
  var init_events_enum = __esm({
    "node_modules/@capacitor-community/stripe-terminal/dist/esm/events.enum.js"() {
      (function(TerminalEventsEnum2) {
        TerminalEventsEnum2["Loaded"] = "terminalLoaded";
        TerminalEventsEnum2["DiscoveredReaders"] = "terminalDiscoveredReaders";
        TerminalEventsEnum2["DiscoveringReaders"] = "terminalDiscoveringReaders";
        TerminalEventsEnum2["CancelDiscoveredReaders"] = "terminalCancelDiscoveredReaders";
        TerminalEventsEnum2["ConnectedReader"] = "terminalConnectedReader";
        TerminalEventsEnum2["DisconnectedReader"] = "terminalDisconnectedReader";
        TerminalEventsEnum2["ConnectionStatusChange"] = "terminalConnectionStatusChange";
        TerminalEventsEnum2["UnexpectedReaderDisconnect"] = "terminalUnexpectedReaderDisconnect";
        TerminalEventsEnum2["ConfirmedPaymentIntent"] = "terminalConfirmedPaymentIntent";
        TerminalEventsEnum2["CollectedPaymentIntent"] = "terminalCollectedPaymentIntent";
        TerminalEventsEnum2["Canceled"] = "terminalCanceled";
        TerminalEventsEnum2["Failed"] = "terminalFailed";
        TerminalEventsEnum2["RequestedConnectionToken"] = "terminalRequestedConnectionToken";
        TerminalEventsEnum2["ReportAvailableUpdate"] = "terminalReportAvailableUpdate";
        TerminalEventsEnum2["StartInstallingUpdate"] = "terminalStartInstallingUpdate";
        TerminalEventsEnum2["ReaderSoftwareUpdateProgress"] = "terminalReaderSoftwareUpdateProgress";
        TerminalEventsEnum2["FinishInstallingUpdate"] = "terminalFinishInstallingUpdate";
        TerminalEventsEnum2["BatteryLevel"] = "terminalBatteryLevel";
        TerminalEventsEnum2["ReaderEvent"] = "terminalReaderEvent";
        TerminalEventsEnum2["RequestDisplayMessage"] = "terminalRequestDisplayMessage";
        TerminalEventsEnum2["RequestReaderInput"] = "terminalRequestReaderInput";
        TerminalEventsEnum2["PaymentStatusChange"] = "terminalPaymentStatusChange";
        TerminalEventsEnum2["ReaderReconnectStarted"] = "terminalReaderReconnectStarted";
        TerminalEventsEnum2["ReaderReconnectSucceeded"] = "terminalReaderReconnectSucceeded";
        TerminalEventsEnum2["ReaderReconnectFailed"] = "terminalReaderReconnectFailed";
      })(TerminalEventsEnum || (TerminalEventsEnum = {}));
    }
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/stripe.enum.js
  var TerminalConnectTypes, DeviceType, DeviceGroup, UpdateTimeEstimate, SimulateReaderUpdate, SimulatedCardType, BatteryStatus, LocationStatus, NetworkStatus, ReaderEvent, ReaderDisplayMessage, ReaderInputOption, PaymentStatus, DisconnectReason, ConnectionStatus;
  var init_stripe_enum = __esm({
    "node_modules/@capacitor-community/stripe-terminal/dist/esm/stripe.enum.js"() {
      (function(TerminalConnectTypes2) {
        TerminalConnectTypes2["Simulated"] = "simulated";
        TerminalConnectTypes2["Internet"] = "internet";
        TerminalConnectTypes2["Bluetooth"] = "bluetooth";
        TerminalConnectTypes2["Usb"] = "usb";
        TerminalConnectTypes2["TapToPay"] = "tap-to-pay";
        TerminalConnectTypes2["HandOff"] = "hand-off";
      })(TerminalConnectTypes || (TerminalConnectTypes = {}));
      (function(DeviceType2) {
        DeviceType2["tapToPayDevice"] = "tapToPayDevice";
        DeviceType2["wisePad3s"] = "wisePad3s";
        DeviceType2["appleBuiltIn"] = "appleBuiltIn";
        DeviceType2["chipper1X"] = "chipper1X";
        DeviceType2["chipper2X"] = "chipper2X";
        DeviceType2["etna"] = "etna";
        DeviceType2["stripeM2"] = "stripeM2";
        DeviceType2["stripeS700"] = "stripeS700";
        DeviceType2["stripeS700DevKit"] = "stripeS700Devkit";
        DeviceType2["wiseCube"] = "wiseCube";
        DeviceType2["wisePad3"] = "wisePad3";
        DeviceType2["wisePosE"] = "wisePosE";
        DeviceType2["wisePosEDevKit"] = "wisePosEDevkit";
        DeviceType2["unknown"] = "unknown";
      })(DeviceType || (DeviceType = {}));
      (function(DeviceGroup2) {
        DeviceGroup2["stripeM2"] = "stripe_m2";
        DeviceGroup2["chipper1X"] = "chipper";
        DeviceGroup2["chipper2X"] = "chipper";
        DeviceGroup2["wiseCube"] = "chipper";
        DeviceGroup2["wisePad3s"] = "wisepad";
        DeviceGroup2["wisePad3"] = "wisepad";
        DeviceGroup2["wisePosEDevKit"] = "wisepose";
        DeviceGroup2["etna"] = "wisepose";
        DeviceGroup2["wisePosE"] = "wisepose";
        DeviceGroup2["stripeS700DevKit"] = "s700";
        DeviceGroup2["stripeS700"] = "s700";
        DeviceGroup2["appleBuiltIn"] = "apple";
        DeviceGroup2["tapToPayDevice"] = "tapToPayDevice";
        DeviceGroup2["unknown"] = "unknown";
      })(DeviceGroup || (DeviceGroup = {}));
      (function(UpdateTimeEstimate2) {
        UpdateTimeEstimate2["LessThanOneMinute"] = "LESS_THAN_ONE_MINUTE";
        UpdateTimeEstimate2["OneToTwoMinutes"] = "ONE_TO_TWO_MINUTES";
        UpdateTimeEstimate2["TwoToFiveMinutes"] = "TWO_TO_FIVE_MINUTES";
        UpdateTimeEstimate2["FiveToFifteenMinutes"] = "FIVE_TO_FIFTEEN_MINUTES";
      })(UpdateTimeEstimate || (UpdateTimeEstimate = {}));
      (function(SimulateReaderUpdate2) {
        SimulateReaderUpdate2["UpdateAvailable"] = "UPDATE_AVAILABLE";
        SimulateReaderUpdate2["None"] = "NONE";
        SimulateReaderUpdate2["Required"] = "REQUIRED";
        SimulateReaderUpdate2["Random"] = "RANDOM";
        SimulateReaderUpdate2["LowBattery"] = "LOW_BATTERY";
        SimulateReaderUpdate2["LowBatterySucceedConnect"] = "LOW_BATTERY_SUCCEED_CONNECT";
      })(SimulateReaderUpdate || (SimulateReaderUpdate = {}));
      (function(SimulatedCardType2) {
        SimulatedCardType2["Visa"] = "VISA";
        SimulatedCardType2["VisaDebit"] = "VISA_DEBIT";
        SimulatedCardType2["Mastercard"] = "MASTERCARD";
        SimulatedCardType2["MastercardDebit"] = "MASTERCARD_DEBIT";
        SimulatedCardType2["MastercardPrepaid"] = "MASTERCARD_PREPAID";
        SimulatedCardType2["Amex"] = "AMEX";
        SimulatedCardType2["Amex2"] = "AMEX_2";
        SimulatedCardType2["Discover"] = "DISCOVER";
        SimulatedCardType2["Discover2"] = "DISCOVER_2";
        SimulatedCardType2["DinersClub"] = "DINERS";
        SimulatedCardType2["DinersClulb14Digits"] = "DINERS_14_DIGITS";
        SimulatedCardType2["JCB"] = "JCB";
        SimulatedCardType2["UnionPay"] = "UNION_PAY";
        SimulatedCardType2["Interac"] = "INTERAC";
        SimulatedCardType2["EftposAustraliaDebit"] = "EFTPOS_AU_DEBIT";
        SimulatedCardType2["VisaUsCommonDebit"] = "VISA_US_COMMON_DEBIT";
        SimulatedCardType2["ChargeDeclined"] = "CHARGE_DECLINED";
        SimulatedCardType2["ChargeDeclinedInsufficientFunds"] = "CHARGE_DECLINED_INSUFFICIENT_FUNDS";
        SimulatedCardType2["ChargeDeclinedLostCard"] = "CHARGE_DECLINED_LOST_CARD";
        SimulatedCardType2["ChargeDeclinedStolenCard"] = "CHARGE_DECLINED_STOLEN_CARD";
        SimulatedCardType2["ChargeDeclinedExpiredCard"] = "CHARGE_DECLINED_EXPIRED_CARD";
        SimulatedCardType2["ChargeDeclinedProcessingError"] = "CHARGE_DECLINED_PROCESSING_ERROR";
        SimulatedCardType2["EftposAustraliaVisaDebit"] = "EFTPOS_AU_VISA_DEBIT";
        SimulatedCardType2["EftposAustraliaMastercardDebit"] = "EFTPOS_AU_DEBIT_MASTERCARD";
        SimulatedCardType2["OfflinePinCVM"] = "OFFLINE_PIN_CVM";
        SimulatedCardType2["OfflinePinSCARetry"] = "OFFLINE_PIN_SCA_RETRY";
        SimulatedCardType2["OnlinePinCVM"] = "ONLINE_PIN_CVM";
        SimulatedCardType2["OnlinePinSCARetry"] = "ONLINE_PIN_SCA_RETRY";
      })(SimulatedCardType || (SimulatedCardType = {}));
      (function(BatteryStatus2) {
        BatteryStatus2["Unknown"] = "UNKNOWN";
        BatteryStatus2["Critical"] = "CRITICAL";
        BatteryStatus2["Low"] = "LOW";
        BatteryStatus2["Nominal"] = "NOMINAL";
      })(BatteryStatus || (BatteryStatus = {}));
      (function(LocationStatus2) {
        LocationStatus2["NotSet"] = "NOT_SET";
        LocationStatus2["Set"] = "SET";
        LocationStatus2["Unknown"] = "UNKNOWN";
      })(LocationStatus || (LocationStatus = {}));
      (function(NetworkStatus2) {
        NetworkStatus2["Unknown"] = "UNKNOWN";
        NetworkStatus2["Online"] = "ONLINE";
        NetworkStatus2["Offline"] = "OFFLINE";
      })(NetworkStatus || (NetworkStatus = {}));
      (function(ReaderEvent2) {
        ReaderEvent2["Unknown"] = "UNKNOWN";
        ReaderEvent2["CardInserted"] = "CARD_INSERTED";
        ReaderEvent2["CardRemoved"] = "CARD_REMOVED";
      })(ReaderEvent || (ReaderEvent = {}));
      (function(ReaderDisplayMessage2) {
        ReaderDisplayMessage2["CheckMobileDevice"] = "CHECK_MOBILE_DEVICE";
        ReaderDisplayMessage2["RetryCard"] = "RETRY_CARD";
        ReaderDisplayMessage2["InsertCard"] = "INSERT_CARD";
        ReaderDisplayMessage2["InsertOrSwipeCard"] = "INSERT_OR_SWIPE_CARD";
        ReaderDisplayMessage2["SwipeCard"] = "SWIPE_CARD";
        ReaderDisplayMessage2["RemoveCard"] = "REMOVE_CARD";
        ReaderDisplayMessage2["MultipleContactlessCardsDetected"] = "MULTIPLE_CONTACTLESS_CARDS_DETECTED";
        ReaderDisplayMessage2["TryAnotherReadMethod"] = "TRY_ANOTHER_READ_METHOD";
        ReaderDisplayMessage2["TryAnotherCard"] = "TRY_ANOTHER_CARD";
        ReaderDisplayMessage2["CardRemovedTooEarly"] = "CARD_REMOVED_TOO_EARLY";
      })(ReaderDisplayMessage || (ReaderDisplayMessage = {}));
      (function(ReaderInputOption2) {
        ReaderInputOption2["None"] = "NONE";
        ReaderInputOption2["Insert"] = "INSERT";
        ReaderInputOption2["Swipe"] = "SWIPE";
        ReaderInputOption2["Tap"] = "TAP";
        ReaderInputOption2["ManualEntry"] = "MANUAL_ENTRY";
      })(ReaderInputOption || (ReaderInputOption = {}));
      (function(PaymentStatus3) {
        PaymentStatus3["Unknown"] = "UNKNOWN";
        PaymentStatus3["NotReady"] = "NOT_READY";
        PaymentStatus3["Ready"] = "READY";
        PaymentStatus3["WaitingForInput"] = "WAITING_FOR_INPUT";
        PaymentStatus3["Processing"] = "PROCESSING";
      })(PaymentStatus || (PaymentStatus = {}));
      (function(DisconnectReason2) {
        DisconnectReason2["Unknown"] = "UNKNOWN";
        DisconnectReason2["DisconnectRequested"] = "DISCONNECT_REQUESTED";
        DisconnectReason2["RebootRequested"] = "REBOOT_REQUESTED";
        DisconnectReason2["SecurityReboot"] = "SECURITY_REBOOT";
        DisconnectReason2["CriticallyLowBattery"] = "CRITICALLY_LOW_BATTERY";
        DisconnectReason2["PoweredOff"] = "POWERED_OFF";
        DisconnectReason2["BluetoothDisabled"] = "BLUETOOTH_DISABLED";
      })(DisconnectReason || (DisconnectReason = {}));
      (function(ConnectionStatus3) {
        ConnectionStatus3["Unknown"] = "UNKNOWN";
        ConnectionStatus3["NotConnected"] = "NOT_CONNECTED";
        ConnectionStatus3["Connecting"] = "CONNECTING";
        ConnectionStatus3["Connected"] = "CONNECTED";
      })(ConnectionStatus || (ConnectionStatus = {}));
    }
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/definitions.js
  var TapToPayDarkMode;
  var init_definitions = __esm({
    "node_modules/@capacitor-community/stripe-terminal/dist/esm/definitions.js"() {
      init_events_enum();
      init_stripe_enum();
      (function(TapToPayDarkMode2) {
        TapToPayDarkMode2["System"] = "SYSTEM";
        TapToPayDarkMode2["Dark"] = "DARK";
        TapToPayDarkMode2["Light"] = "LIGHT";
      })(TapToPayDarkMode || (TapToPayDarkMode = {}));
    }
  });

  // node_modules/@stripe/terminal-js/dist/terminal.esm.js
  var V1_URL, injectScript, stripePromise$1, loadScript, stripePromise, loadCalled, loadStripeTerminal;
  var init_terminal_esm = __esm({
    "node_modules/@stripe/terminal-js/dist/terminal.esm.js"() {
      V1_URL = "https://js.stripe.com/terminal/v1";
      injectScript = function injectScript2() {
        var script = document.createElement("script");
        script.src = V1_URL;
        var headOrBody = document.head || document.body;
        if (!headOrBody) {
          throw new Error("Expected document.body not to be null. Terminal requires a <body> element.");
        }
        headOrBody.appendChild(script);
        return script;
      };
      stripePromise$1 = null;
      loadScript = function loadScript2() {
        if (stripePromise$1 !== null) {
          return stripePromise$1;
        }
        stripePromise$1 = new Promise(function(resolve, reject) {
          if (typeof window === "undefined") {
            resolve(null);
            return;
          }
          if (window.StripeTerminal) {
            resolve(window.StripeTerminal);
            return;
          }
          var script = document.querySelector('script[src="'.concat(V1_URL, '"], script[src="').concat(V1_URL, '/"]')) || injectScript();
          script.addEventListener("load", function() {
            if (window.StripeTerminal) {
              resolve(window.StripeTerminal);
            } else {
              reject(new Error("StripeTerminal not available"));
            }
          });
          script.addEventListener("error", function() {
            reject(new Error("Failed to load StripeTerminal"));
          });
        });
        return stripePromise$1;
      };
      stripePromise = Promise.resolve().then(loadScript);
      loadCalled = false;
      stripePromise["catch"](function(err) {
        if (!loadCalled) {
          console.warn(err);
        }
      });
      loadStripeTerminal = function loadStripeTerminal2() {
        loadCalled = true;
        return stripePromise;
      };
    }
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/terminal-mappers.js
  var mapFromCartToICart, mapFromConnectionStatus, mapFromPaymentStatus, convertReaderInterface, mapFromDeviceType, mapFromReaderNetworkStatus, PaymentStatus2, ConnectionStatus2;
  var init_terminal_mappers = __esm({
    "node_modules/@capacitor-community/stripe-terminal/dist/esm/terminal-mappers.js"() {
      init_definitions();
      mapFromCartToICart = (cart) => {
        return {
          line_items: cart.lineItems.map((item) => ({
            description: item.displayName,
            quantity: item.quantity,
            amount: item.amount
          })),
          tax: cart.tax,
          total: cart.total,
          currency: cart.currency
        };
      };
      mapFromConnectionStatus = (connectionStatus) => {
        switch (connectionStatus) {
          case ConnectionStatus2.CONNECTED:
            return "CONNECTED";
          case ConnectionStatus2.CONNECTING:
            return "CONNECTING";
          case ConnectionStatus2.NOT_CONNECTED:
            return "NOT_CONNECTED";
          case ConnectionStatus2.RECONNECTING:
            return "RECONNECTING";
          default:
            return "UNKNOWN";
        }
      };
      mapFromPaymentStatus = (paymentStatus) => {
        switch (paymentStatus) {
          case PaymentStatus2.NOT_READY:
            return "NOT_READY";
          case PaymentStatus2.READY:
            return "READY";
          case PaymentStatus2.PROCESSING:
            return "PROCESSING";
          case PaymentStatus2.WAITING_FOR_INPUT:
            return "WAITING_FOR_INPUT";
          default:
            return "UNKNOWN";
        }
      };
      convertReaderInterface = (reader) => {
        let location = void 0;
        if (reader.location.id) {
          location = reader.location;
        }
        return {
          baseUrl: "",
          bootloaderVersion: "",
          configVersion: "",
          emvKeyProfileId: "",
          firmwareVersion: "",
          hardwareVersion: "",
          macKeyProfileId: "",
          pinKeyProfileId: "",
          pinKeysetId: "",
          settingsVersion: "",
          trackKeyProfileId: "",
          label: reader.label,
          batteryLevel: 0,
          batteryStatus: BatteryStatus.Unknown,
          simulated: !reader.livemode,
          serialNumber: reader.serial_number,
          isCharging: 0,
          id: 0,
          availableUpdate: void 0,
          locationId: reader.location.id,
          ipAddress: reader.ip_address || "",
          status: mapFromReaderNetworkStatus(reader.status),
          location: location || void 0,
          locationStatus: LocationStatus.Unknown,
          deviceType: mapFromDeviceType(reader.device_type),
          deviceSoftwareVersion: reader.device_sw_version
        };
      };
      mapFromDeviceType = (type) => {
        switch (type) {
          case "bbpos_chipper2x":
            return DeviceType.chipper2X;
          case "stripe_m2":
            return DeviceType.stripeM2;
          case "bbpos_wisepad3":
            return DeviceType.wisePad3;
          case "bbpos_wisepos_e":
            return DeviceType.wisePosE;
          case "stripe_s700":
            return DeviceType.stripeS700;
          default:
            return DeviceType.unknown;
        }
      };
      mapFromReaderNetworkStatus = (status) => {
        switch (status) {
          case "offline":
            return NetworkStatus.Offline;
          case "online":
            return NetworkStatus.Online;
          default:
            return NetworkStatus.Unknown;
        }
      };
      (function(PaymentStatus3) {
        PaymentStatus3["NOT_READY"] = "not_ready";
        PaymentStatus3["READY"] = "ready";
        PaymentStatus3["WAITING_FOR_INPUT"] = "waiting_for_input";
        PaymentStatus3["PROCESSING"] = "processing";
      })(PaymentStatus2 || (PaymentStatus2 = {}));
      (function(ConnectionStatus3) {
        ConnectionStatus3["CONNECTING"] = "connecting";
        ConnectionStatus3["CONNECTED"] = "connected";
        ConnectionStatus3["NOT_CONNECTED"] = "not_connected";
        ConnectionStatus3["RECONNECTING"] = "reconnecting";
      })(ConnectionStatus2 || (ConnectionStatus2 = {}));
    }
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/web.js
  var web_exports2 = {};
  __export(web_exports2, {
    StripeTerminalWeb: () => StripeTerminalWeb
  });
  var StripeTerminalWeb;
  var init_web2 = __esm({
    "node_modules/@capacitor-community/stripe-terminal/dist/esm/web.js"() {
      init_dist();
      init_terminal_esm();
      init_definitions();
      init_events_enum();
      init_terminal_mappers();
      StripeTerminalWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.stripeTerminal = void 0;
          this.tokenProviderPromiseResolve = [];
          this.discoveredReaders = [];
          this.cachedFindReaders = [];
          this.cachedPaymentIntent = void 0;
          this.isTest = false;
        }
        async initialize(options) {
          if (this.stripeTerminal !== void 0) {
            throw new Error("Stripe Terminal has already been initialized");
          }
          this.isTest = options.isTest;
          const stripeTerminal = await loadStripeTerminal();
          this.stripeTerminal = stripeTerminal === null || stripeTerminal === void 0 ? void 0 : stripeTerminal.create({
            onFetchConnectionToken: async () => {
              this.notifyListeners(TerminalEventsEnum.RequestedConnectionToken, null);
              if (options.tokenProviderEndpoint) {
                const response = await fetch(options.tokenProviderEndpoint, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  }
                });
                const data = await response.json();
                return data.secret;
              } else {
                return new Promise((resolve) => this.tokenProviderPromiseResolve.push(resolve));
              }
            },
            onConnectionStatusChange: (status) => {
              this.notifyListeners(TerminalEventsEnum.ConnectionStatusChange, {
                status: mapFromConnectionStatus(status.status)
              });
            },
            onPaymentStatusChange: (status) => {
              this.notifyListeners(TerminalEventsEnum.PaymentStatusChange, {
                status: mapFromPaymentStatus(status.status)
              });
            },
            onUnexpectedReaderDisconnect: () => {
              this.notifyListeners(TerminalEventsEnum.UnexpectedReaderDisconnect, {
                reader: null
              });
            }
          });
          this.notifyListeners(TerminalEventsEnum.Loaded, null);
        }
        async discoverReaders(options) {
          if (this.stripeTerminal === void 0) {
            throw new Error("Stripe Terminal has not been initialized");
          }
          if (options.type !== TerminalConnectTypes.Internet) {
            throw this.unavailable(`${options.type} is selected. Web platform is supported only internet connection.`);
          }
          const discoverResult = await this.stripeTerminal.discoverReaders({
            simulated: this.isTest,
            location: options.locationId
          });
          if (discoverResult.error) {
            throw new Error(discoverResult.error.message);
          }
          this.cachedFindReaders = discoverResult.discoveredReaders;
          this.discoveredReaders = discoverResult.discoveredReaders.map((reader) => convertReaderInterface(reader));
          this.notifyListeners(TerminalEventsEnum.DiscoveredReaders, {
            readers: this.discoveredReaders
          });
          return {
            readers: this.discoveredReaders
          };
        }
        /**
         * This method is not supported in the web platform.
         */
        async cancelDiscoverReaders() {
          console.log("cancelDiscoverReaders");
        }
        async setConnectionToken(options) {
          if (this.tokenProviderPromiseResolve.length === 0) {
            return;
          }
          console.log("setConnectionToken", options);
          const resolve = this.tokenProviderPromiseResolve.shift();
          if (resolve === void 0) {
            throw new Error("tokenProviderPromiseResolve is empty.");
          }
          resolve(options.token);
        }
        async setSimulatorConfiguration(options) {
          console.log("setSimulatorConfiguration", options);
        }
        async connectReader(options) {
          var _a;
          const reader = this.cachedFindReaders.find((reader2) => reader2.serial_number === options.reader.serialNumber);
          if (reader === void 0) {
            throw new Error("reader is not match from descovered readers.");
          }
          const connectedResult = await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.connectReader(reader));
          if (connectedResult.error) {
            throw new Error(connectedResult.error.message);
          }
          this.notifyListeners(TerminalEventsEnum.ConnectedReader, null);
        }
        async getConnectedReader() {
          var _a;
          const reader = (_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.getConnectedReader();
          if (reader === void 0) {
            return {
              reader: null
            };
          }
          return {
            reader: convertReaderInterface(reader)
          };
        }
        async disconnectReader() {
          var _a;
          await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.disconnectReader());
          this.notifyListeners(TerminalEventsEnum.DisconnectedReader, null);
        }
        async collectPaymentMethod(options) {
          var _a;
          const collectResult = await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.collectPaymentMethod(options.paymentIntent));
          if (collectResult.error) {
            throw new Error(collectResult.error.message);
          }
          this.cachedPaymentIntent = collectResult.paymentIntent;
          this.notifyListeners(TerminalEventsEnum.CollectedPaymentIntent, null);
        }
        async cancelCollectPaymentMethod() {
          var _a;
          await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.cancelCollectPaymentMethod());
          this.notifyListeners(TerminalEventsEnum.Canceled, null);
        }
        async confirmPaymentIntent() {
          var _a;
          if (this.cachedPaymentIntent === void 0) {
            throw new Error("PaymentIntent is not cached.");
          }
          const processResult = await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.processPayment(this.cachedPaymentIntent));
          if (processResult.error) {
            throw new Error(processResult.error.message);
          }
          this.notifyListeners(TerminalEventsEnum.ConfirmedPaymentIntent, null);
        }
        async installAvailableUpdate() {
          console.log("installAvailableUpdate");
        }
        async cancelInstallUpdate() {
          console.log("cancelInstallUpdate");
        }
        async setReaderDisplay(options) {
          var _a;
          await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.setReaderDisplay({
            type: "cart",
            cart: mapFromCartToICart(options)
          }));
          console.log("setReaderDisplay", options);
        }
        async clearReaderDisplay() {
          var _a;
          await ((_a = this.stripeTerminal) === null || _a === void 0 ? void 0 : _a.clearReaderDisplay());
        }
        async rebootReader() {
          console.log("rebootReader");
        }
        async cancelReaderReconnection() {
          console.log("cancelReaderReconnection");
        }
        async setTapToPayUxConfiguration(_options) {
          console.log("setTapToPayUxConfiguration is only supported on Android");
        }
        async isTapToPayAccountLinked(_options) {
          throw this.unavailable("isTapToPayAccountLinked is only supported on iOS.");
        }
      };
    }
  });

  // native/tap-to-pay.js
  init_dist();

  // node_modules/@capacitor/device/dist/esm/index.js
  init_dist();
  var Device = registerPlugin("Device", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.DeviceWeb())
  });

  // node_modules/@capacitor-community/stripe-terminal/dist/esm/index.js
  init_dist();
  init_definitions();
  var StripeTerminal = registerPlugin("StripeTerminal", {
    web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.StripeTerminalWeb())
  });

  // native/tap-to-pay.js
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("StripeTerminal")) {
    let consent = function(amount) {
      return new Promise((resolve) => {
        const d = document.createElement("dialog");
        d.style.cssText = "max-width:480px;width:calc(100% - 32px);box-sizing:border-box;border:0;border-radius:14px;padding:20px";
        d.dataset.lrPaymentDialog = "1";
        d.innerHTML = '<h3>Cobrar con Tap to Pay</h3><p style="font-size:24px;font-weight:bold">' + (amount / 100).toFixed(2).replace(".", ",") + ' \u20AC</p><label style="display:flex;gap:10px"><input type="checkbox" style="width:24px;height:24px;flex-shrink:0"><span>Autorizo a Larios Rental a cobrar este importe y guardar mi tarjeta en Stripe para cargos posteriores justificados del contrato: ampliaciones, combustible y aparcamiento conforme a las condiciones aceptadas.<br><br>I authorize this payment and the secure storage of my card for justified rental charges under the agreed rental terms.</span></label><div class="actions"><button type="button" class="secondary">Cancelar</button><button type="button" class="primary" disabled>Cobrar y guardar tarjeta</button></div>';
        document.body.appendChild(d);
        const check = d.querySelector("input"), buttons = d.querySelectorAll("button");
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          d.close();
          d.remove();
          resolve(value);
        };
        check.onchange = () => buttons[1].disabled = !check.checked;
        buttons[0].onclick = () => finish(false);
        buttons[1].onclick = () => finish(check.checked);
        d.addEventListener("cancel", (event) => {
          event.preventDefault();
          finish(false);
        });
        d.showModal();
      });
    };
    let initialized = false, initializing = null, activeContract = "", connected = false, working = false;
    const pendingKey = "lr_native_tap_pending";
    const context = () => window.LariosPayments?.nativeContext?.();
    async function call(action, extra = {}) {
      const c = context();
      if (!c?.token) throw Error("Inicia sesi\xF3n en Larios Rental.");
      const response = await fetch(c.url + "/functions/v1/stripe-checkout", { method: "POST", headers: { apikey: c.key, Authorization: "Bearer " + c.token, "Content-Type": "application/json" }, body: JSON.stringify({ action, contract_id: activeContract, ...extra }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "No se pudo completar el cobro");
      return data;
    }
    const message = (text) => window.LariosPayments?.nativeStatus?.(text);
    async function initialize(mode) {
      if (initialized) return;
      if (initializing) return initializing;
      initializing = (async () => {
        await StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
          try {
            const d = await call("native_connection_token");
            await StripeTerminal.setConnectionToken({ token: d.secret });
          } catch (error) {
            await StripeTerminal.setConnectionToken({ token: "" }).catch(() => {
            });
            message(error.message);
          }
        });
        await StripeTerminal.addListener(TerminalEventsEnum.UnexpectedReaderDisconnect, () => {
          connected = false;
        });
        await StripeTerminal.initialize({ isTest: mode === "test" });
        initialized = true;
      })().finally(() => {
        initializing = null;
      });
      return initializing;
    }
    async function connect(config) {
      if (connected) return;
      message("Comprobando el lector contactless del dispositivo\u2026");
      const info = await Device.getInfo();
      if (info.platform === "android" && Number(info.osVersion.split(".")[0]) < 13) throw Error("Tap to Pay necesita Android 13 o posterior y un dispositivo NFC compatible.");
      await initialize(config.mode);
      const found = await StripeTerminal.discoverReaders({ type: TerminalConnectTypes.TapToPay, locationId: config.location_id });
      const reader = found.readers?.[0];
      if (!reader) throw Error("Stripe no reconoce este dispositivo como lector Tap to Pay compatible.");
      await StripeTerminal.connectReader({ reader, locationId: config.location_id, merchantDisplayName: "Larios Rental", autoReconnectOnUnexpectedDisconnect: true });
      connected = true;
    }
    async function verifyPending() {
      const saved = JSON.parse(localStorage.getItem(pendingKey) || "null");
      if (!saved || !context()?.token) return null;
      activeContract = saved.contract_id;
      const d = await call("native_verify", { payment_intent_id: saved.payment_intent_id });
      if (d.paid) {
        localStorage.removeItem(pendingKey);
        message(d.reusable ? "Pago confirmado y tarjeta registrada." : "Pago confirmado. Esta tarjeta necesita registro adicional para cargos posteriores.");
        window.dispatchEvent(new CustomEvent("larios:native-payment-completed", { detail: d }));
      }
      return d;
    }
    async function tapToPay({ contract_id, amount }) {
      if (working) throw Error("Ya hay un cobro en curso.");
      working = true;
      activeContract = contract_id;
      try {
        const pending = JSON.parse(localStorage.getItem(pendingKey) || "null");
        if (pending) {
          const verified = await verifyPending();
          if (verified?.paid && pending.contract_id === contract_id) return verified;
          if (!verified?.paid && pending.contract_id !== contract_id) throw Error("Comprueba o cancela el cobro pendiente antes de cobrar otro contrato.");
          activeContract = contract_id;
        }
        const cents = Math.round(Number(amount) * 100);
        if (!Number.isSafeInteger(cents) || cents < 50) throw Error("Importe de cobro no v\xE1lido.");
        const config = await call("native_config");
        if (config.mode === "live" && window.LariosNativeBuild?.debug) throw Error("Tap to Pay real necesita el APK de producci\xF3n firmado. Esta instalaci\xF3n es solo de prueba.");
        await connect(config);
        if (!await consent(cents)) return { canceled: true, paid: false };
        message("Preparando el cobro del contrato\u2026");
        const intent = await call("native_create", { amount_cents: cents, consent_confirmed: true });
        if (intent.paid) return intent;
        localStorage.setItem(pendingKey, JSON.stringify({ contract_id, payment_intent_id: intent.payment_intent_id }));
        try {
          message("Acerca la tarjeta o el m\xF3vil del cliente al lector NFC.");
          await StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
          message("Confirmando el cobro con Stripe\u2026");
          await StripeTerminal.confirmPaymentIntent();
        } catch (error) {
          const d = await call("native_verify", { payment_intent_id: intent.payment_intent_id }).catch(() => null);
          if (d?.paid) {
            localStorage.removeItem(pendingKey);
            return d;
          }
          throw Error("El cobro no est\xE1 confirmado. Pulsa Comprobar cobro antes de repetirlo. " + error.message);
        }
        const result = await call("native_verify", { payment_intent_id: intent.payment_intent_id });
        if (!result.paid) throw Error("Stripe sigue procesando el pago. Pulsa Comprobar cobro; no vuelvas a cobrar.");
        localStorage.removeItem(pendingKey);
        return result;
      } finally {
        working = false;
      }
    }
    async function cancel() {
      if (working) await StripeTerminal.cancelCollectPaymentMethod().catch(() => {
      });
      const saved = JSON.parse(localStorage.getItem(pendingKey) || "null");
      if (!saved) return { canceled: true };
      activeContract = saved.contract_id;
      const result = await call("native_cancel", { payment_intent_id: saved.payment_intent_id });
      if (result.canceled || result.paid) localStorage.removeItem(pendingKey);
      return result;
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !working) void verifyPending().catch((e) => message(e.message));
    });
    window.addEventListener("larios:access-ready", () => {
      void verifyPending().catch(() => {
      });
    });
    window.LariosNativeStripeTerminal = { tapToPay, verifyPending, cancel };
  }
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
