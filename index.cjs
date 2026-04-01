"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const require$$1 = require("path");
const fs$l = require("fs");
const require$$0 = require("constants");
const require$$0$1 = require("stream");
const require$$4 = require("util");
const require$$5 = require("assert");
const require$$1$1 = require("os");
const fs$m = require("fs/promises");
const events = require("events");
const http = require("http");
const crypto = require("crypto");
const url = require("url");
const electronUpdater = require("electron-updater");
const https = require("https");
const child_process = require("child_process");
const AdmZip = require("adm-zip");
const express = require("express");
const node_stream = require("node:stream");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const require$$1__namespace$1 = /* @__PURE__ */ _interopNamespaceDefault(require$$1);
const fs__namespace$1 = /* @__PURE__ */ _interopNamespaceDefault(fs$l);
const require$$1__namespace = /* @__PURE__ */ _interopNamespaceDefault(require$$1$1);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs$m);
const is = {
  dev: !electron.app.isPackaged
};
const electronApp = {
  setAppUserModelId(id) {
    if (process.platform === "win32") {
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
    }
  }
};
const optimizer = {
  watchWindowShortcuts(window2, shortcutOptions) {
    const { webContents } = window2;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") {
        return;
      }
      if (!is.dev) {
        if (input.code === "KeyR" && (input.control || input.meta)) {
          event.preventDefault();
        }
      } else if (input.code === "F12") {
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools();
        } else {
          webContents.openDevTools({ mode: "undocked" });
          console.log("Open dev tool...");
        }
      }
      if (escToCloseWindow && input.code === "Escape" && input.key !== "Process") {
        window2.close();
        event.preventDefault();
      }
      if (!zoom) {
        if (input.code === "Minus" && (input.control || input.meta)) {
          event.preventDefault();
        }
        if (input.code === "Equal" && input.shift && (input.control || input.meta)) {
          event.preventDefault();
        }
      }
    });
  }
};
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var lib = { exports: {} };
var fs$k = {};
var universalify = {};
universalify.fromCallback = function(fn) {
  return Object.defineProperty(function() {
    if (typeof arguments[arguments.length - 1] === "function") fn.apply(this, arguments);
    else {
      return new Promise((resolve, reject) => {
        arguments[arguments.length] = (err, res) => {
          if (err) return reject(err);
          resolve(res);
        };
        arguments.length++;
        fn.apply(this, arguments);
      });
    }
  }, "name", { value: fn.name });
};
universalify.fromPromise = function(fn) {
  return Object.defineProperty(function() {
    const cb = arguments[arguments.length - 1];
    if (typeof cb !== "function") return fn.apply(this, arguments);
    else fn.apply(this, arguments).then((r) => cb(null, r), cb);
  }, "name", { value: fn.name });
};
var constants = require$$0;
var origCwd = process.cwd;
var cwd = null;
var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
process.cwd = function() {
  if (!cwd)
    cwd = origCwd.call(process);
  return cwd;
};
try {
  process.cwd();
} catch (er) {
}
if (typeof process.chdir === "function") {
  var chdir = process.chdir;
  process.chdir = function(d) {
    cwd = null;
    chdir.call(process, d);
  };
  if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
}
var polyfills$1 = patch$1;
function patch$1(fs2) {
  if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
    patchLchmod(fs2);
  }
  if (!fs2.lutimes) {
    patchLutimes(fs2);
  }
  fs2.chown = chownFix(fs2.chown);
  fs2.fchown = chownFix(fs2.fchown);
  fs2.lchown = chownFix(fs2.lchown);
  fs2.chmod = chmodFix(fs2.chmod);
  fs2.fchmod = chmodFix(fs2.fchmod);
  fs2.lchmod = chmodFix(fs2.lchmod);
  fs2.chownSync = chownFixSync(fs2.chownSync);
  fs2.fchownSync = chownFixSync(fs2.fchownSync);
  fs2.lchownSync = chownFixSync(fs2.lchownSync);
  fs2.chmodSync = chmodFixSync(fs2.chmodSync);
  fs2.fchmodSync = chmodFixSync(fs2.fchmodSync);
  fs2.lchmodSync = chmodFixSync(fs2.lchmodSync);
  fs2.stat = statFix(fs2.stat);
  fs2.fstat = statFix(fs2.fstat);
  fs2.lstat = statFix(fs2.lstat);
  fs2.statSync = statFixSync(fs2.statSync);
  fs2.fstatSync = statFixSync(fs2.fstatSync);
  fs2.lstatSync = statFixSync(fs2.lstatSync);
  if (fs2.chmod && !fs2.lchmod) {
    fs2.lchmod = function(path2, mode, cb) {
      if (cb) process.nextTick(cb);
    };
    fs2.lchmodSync = function() {
    };
  }
  if (fs2.chown && !fs2.lchown) {
    fs2.lchown = function(path2, uid, gid, cb) {
      if (cb) process.nextTick(cb);
    };
    fs2.lchownSync = function() {
    };
  }
  if (platform === "win32") {
    fs2.rename = typeof fs2.rename !== "function" ? fs2.rename : function(fs$rename) {
      function rename2(from, to, cb) {
        var start = Date.now();
        var backoff = 0;
        fs$rename(from, to, function CB(er) {
          if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
            setTimeout(function() {
              fs2.stat(to, function(stater, st) {
                if (stater && stater.code === "ENOENT")
                  fs$rename(from, to, CB);
                else
                  cb(er);
              });
            }, backoff);
            if (backoff < 100)
              backoff += 10;
            return;
          }
          if (cb) cb(er);
        });
      }
      if (Object.setPrototypeOf) Object.setPrototypeOf(rename2, fs$rename);
      return rename2;
    }(fs2.rename);
  }
  fs2.read = typeof fs2.read !== "function" ? fs2.read : function(fs$read) {
    function read(fd, buffer2, offset, length, position, callback_) {
      var callback;
      if (callback_ && typeof callback_ === "function") {
        var eagCounter = 0;
        callback = function(er, _, __) {
          if (er && er.code === "EAGAIN" && eagCounter < 10) {
            eagCounter++;
            return fs$read.call(fs2, fd, buffer2, offset, length, position, callback);
          }
          callback_.apply(this, arguments);
        };
      }
      return fs$read.call(fs2, fd, buffer2, offset, length, position, callback);
    }
    if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
    return read;
  }(fs2.read);
  fs2.readSync = typeof fs2.readSync !== "function" ? fs2.readSync : /* @__PURE__ */ function(fs$readSync) {
    return function(fd, buffer2, offset, length, position) {
      var eagCounter = 0;
      while (true) {
        try {
          return fs$readSync.call(fs2, fd, buffer2, offset, length, position);
        } catch (er) {
          if (er.code === "EAGAIN" && eagCounter < 10) {
            eagCounter++;
            continue;
          }
          throw er;
        }
      }
    };
  }(fs2.readSync);
  function patchLchmod(fs22) {
    fs22.lchmod = function(path2, mode, callback) {
      fs22.open(
        path2,
        constants.O_WRONLY | constants.O_SYMLINK,
        mode,
        function(err, fd) {
          if (err) {
            if (callback) callback(err);
            return;
          }
          fs22.fchmod(fd, mode, function(err2) {
            fs22.close(fd, function(err22) {
              if (callback) callback(err2 || err22);
            });
          });
        }
      );
    };
    fs22.lchmodSync = function(path2, mode) {
      var fd = fs22.openSync(path2, constants.O_WRONLY | constants.O_SYMLINK, mode);
      var threw = true;
      var ret;
      try {
        ret = fs22.fchmodSync(fd, mode);
        threw = false;
      } finally {
        if (threw) {
          try {
            fs22.closeSync(fd);
          } catch (er) {
          }
        } else {
          fs22.closeSync(fd);
        }
      }
      return ret;
    };
  }
  function patchLutimes(fs22) {
    if (constants.hasOwnProperty("O_SYMLINK") && fs22.futimes) {
      fs22.lutimes = function(path2, at, mt, cb) {
        fs22.open(path2, constants.O_SYMLINK, function(er, fd) {
          if (er) {
            if (cb) cb(er);
            return;
          }
          fs22.futimes(fd, at, mt, function(er2) {
            fs22.close(fd, function(er22) {
              if (cb) cb(er2 || er22);
            });
          });
        });
      };
      fs22.lutimesSync = function(path2, at, mt) {
        var fd = fs22.openSync(path2, constants.O_SYMLINK);
        var ret;
        var threw = true;
        try {
          ret = fs22.futimesSync(fd, at, mt);
          threw = false;
        } finally {
          if (threw) {
            try {
              fs22.closeSync(fd);
            } catch (er) {
            }
          } else {
            fs22.closeSync(fd);
          }
        }
        return ret;
      };
    } else if (fs22.futimes) {
      fs22.lutimes = function(_a, _b, _c, cb) {
        if (cb) process.nextTick(cb);
      };
      fs22.lutimesSync = function() {
      };
    }
  }
  function chmodFix(orig) {
    if (!orig) return orig;
    return function(target, mode, cb) {
      return orig.call(fs2, target, mode, function(er) {
        if (chownErOk(er)) er = null;
        if (cb) cb.apply(this, arguments);
      });
    };
  }
  function chmodFixSync(orig) {
    if (!orig) return orig;
    return function(target, mode) {
      try {
        return orig.call(fs2, target, mode);
      } catch (er) {
        if (!chownErOk(er)) throw er;
      }
    };
  }
  function chownFix(orig) {
    if (!orig) return orig;
    return function(target, uid, gid, cb) {
      return orig.call(fs2, target, uid, gid, function(er) {
        if (chownErOk(er)) er = null;
        if (cb) cb.apply(this, arguments);
      });
    };
  }
  function chownFixSync(orig) {
    if (!orig) return orig;
    return function(target, uid, gid) {
      try {
        return orig.call(fs2, target, uid, gid);
      } catch (er) {
        if (!chownErOk(er)) throw er;
      }
    };
  }
  function statFix(orig) {
    if (!orig) return orig;
    return function(target, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = null;
      }
      function callback(er, stats) {
        if (stats) {
          if (stats.uid < 0) stats.uid += 4294967296;
          if (stats.gid < 0) stats.gid += 4294967296;
        }
        if (cb) cb.apply(this, arguments);
      }
      return options ? orig.call(fs2, target, options, callback) : orig.call(fs2, target, callback);
    };
  }
  function statFixSync(orig) {
    if (!orig) return orig;
    return function(target, options) {
      var stats = options ? orig.call(fs2, target, options) : orig.call(fs2, target);
      if (stats) {
        if (stats.uid < 0) stats.uid += 4294967296;
        if (stats.gid < 0) stats.gid += 4294967296;
      }
      return stats;
    };
  }
  function chownErOk(er) {
    if (!er)
      return true;
    if (er.code === "ENOSYS")
      return true;
    var nonroot = !process.getuid || process.getuid() !== 0;
    if (nonroot) {
      if (er.code === "EINVAL" || er.code === "EPERM")
        return true;
    }
    return false;
  }
}
var Stream = require$$0$1.Stream;
var legacyStreams = legacy$1;
function legacy$1(fs2) {
  return {
    ReadStream,
    WriteStream
  };
  function ReadStream(path2, options) {
    if (!(this instanceof ReadStream)) return new ReadStream(path2, options);
    Stream.call(this);
    var self2 = this;
    this.path = path2;
    this.fd = null;
    this.readable = true;
    this.paused = false;
    this.flags = "r";
    this.mode = 438;
    this.bufferSize = 64 * 1024;
    options = options || {};
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }
    if (this.encoding) this.setEncoding(this.encoding);
    if (this.start !== void 0) {
      if ("number" !== typeof this.start) {
        throw TypeError("start must be a Number");
      }
      if (this.end === void 0) {
        this.end = Infinity;
      } else if ("number" !== typeof this.end) {
        throw TypeError("end must be a Number");
      }
      if (this.start > this.end) {
        throw new Error("start must be <= end");
      }
      this.pos = this.start;
    }
    if (this.fd !== null) {
      process.nextTick(function() {
        self2._read();
      });
      return;
    }
    fs2.open(this.path, this.flags, this.mode, function(err, fd) {
      if (err) {
        self2.emit("error", err);
        self2.readable = false;
        return;
      }
      self2.fd = fd;
      self2.emit("open", fd);
      self2._read();
    });
  }
  function WriteStream(path2, options) {
    if (!(this instanceof WriteStream)) return new WriteStream(path2, options);
    Stream.call(this);
    this.path = path2;
    this.fd = null;
    this.writable = true;
    this.flags = "w";
    this.encoding = "binary";
    this.mode = 438;
    this.bytesWritten = 0;
    options = options || {};
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }
    if (this.start !== void 0) {
      if ("number" !== typeof this.start) {
        throw TypeError("start must be a Number");
      }
      if (this.start < 0) {
        throw new Error("start must be >= zero");
      }
      this.pos = this.start;
    }
    this.busy = false;
    this._queue = [];
    if (this.fd === null) {
      this._open = fs2.open;
      this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
      this.flush();
    }
  }
}
var clone_1 = clone$1;
var getPrototypeOf = Object.getPrototypeOf || function(obj) {
  return obj.__proto__;
};
function clone$1(obj) {
  if (obj === null || typeof obj !== "object")
    return obj;
  if (obj instanceof Object)
    var copy2 = { __proto__: getPrototypeOf(obj) };
  else
    var copy2 = /* @__PURE__ */ Object.create(null);
  Object.getOwnPropertyNames(obj).forEach(function(key) {
    Object.defineProperty(copy2, key, Object.getOwnPropertyDescriptor(obj, key));
  });
  return copy2;
}
var fs$j = fs$l;
var polyfills = polyfills$1;
var legacy = legacyStreams;
var clone = clone_1;
var util = require$$4;
var gracefulQueue;
var previousSymbol;
if (typeof Symbol === "function" && typeof Symbol.for === "function") {
  gracefulQueue = Symbol.for("graceful-fs.queue");
  previousSymbol = Symbol.for("graceful-fs.previous");
} else {
  gracefulQueue = "___graceful-fs.queue";
  previousSymbol = "___graceful-fs.previous";
}
function noop() {
}
function publishQueue(context, queue2) {
  Object.defineProperty(context, gracefulQueue, {
    get: function() {
      return queue2;
    }
  });
}
var debug = noop;
if (util.debuglog)
  debug = util.debuglog("gfs4");
else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
  debug = function() {
    var m = util.format.apply(util, arguments);
    m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
    console.error(m);
  };
if (!fs$j[gracefulQueue]) {
  var queue = commonjsGlobal[gracefulQueue] || [];
  publishQueue(fs$j, queue);
  fs$j.close = function(fs$close) {
    function close(fd, cb) {
      return fs$close.call(fs$j, fd, function(err) {
        if (!err) {
          resetQueue();
        }
        if (typeof cb === "function")
          cb.apply(this, arguments);
      });
    }
    Object.defineProperty(close, previousSymbol, {
      value: fs$close
    });
    return close;
  }(fs$j.close);
  fs$j.closeSync = function(fs$closeSync) {
    function closeSync(fd) {
      fs$closeSync.apply(fs$j, arguments);
      resetQueue();
    }
    Object.defineProperty(closeSync, previousSymbol, {
      value: fs$closeSync
    });
    return closeSync;
  }(fs$j.closeSync);
  if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
    process.on("exit", function() {
      debug(fs$j[gracefulQueue]);
      require$$5.equal(fs$j[gracefulQueue].length, 0);
    });
  }
}
if (!commonjsGlobal[gracefulQueue]) {
  publishQueue(commonjsGlobal, fs$j[gracefulQueue]);
}
var gracefulFs = patch(clone(fs$j));
if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs$j.__patched) {
  gracefulFs = patch(fs$j);
  fs$j.__patched = true;
}
function patch(fs2) {
  polyfills(fs2);
  fs2.gracefulify = patch;
  fs2.createReadStream = createReadStream;
  fs2.createWriteStream = createWriteStream;
  var fs$readFile = fs2.readFile;
  fs2.readFile = readFile2;
  function readFile2(path2, options, cb) {
    if (typeof options === "function")
      cb = options, options = null;
    return go$readFile(path2, options, cb);
    function go$readFile(path22, options2, cb2, startTime) {
      return fs$readFile(path22, options2, function(err) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([go$readFile, [path22, options2, cb2], err, startTime || Date.now(), Date.now()]);
        else {
          if (typeof cb2 === "function")
            cb2.apply(this, arguments);
        }
      });
    }
  }
  var fs$writeFile = fs2.writeFile;
  fs2.writeFile = writeFile2;
  function writeFile2(path2, data, options, cb) {
    if (typeof options === "function")
      cb = options, options = null;
    return go$writeFile(path2, data, options, cb);
    function go$writeFile(path22, data2, options2, cb2, startTime) {
      return fs$writeFile(path22, data2, options2, function(err) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([go$writeFile, [path22, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
        else {
          if (typeof cb2 === "function")
            cb2.apply(this, arguments);
        }
      });
    }
  }
  var fs$appendFile = fs2.appendFile;
  if (fs$appendFile)
    fs2.appendFile = appendFile;
  function appendFile(path2, data, options, cb) {
    if (typeof options === "function")
      cb = options, options = null;
    return go$appendFile(path2, data, options, cb);
    function go$appendFile(path22, data2, options2, cb2, startTime) {
      return fs$appendFile(path22, data2, options2, function(err) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([go$appendFile, [path22, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
        else {
          if (typeof cb2 === "function")
            cb2.apply(this, arguments);
        }
      });
    }
  }
  var fs$copyFile = fs2.copyFile;
  if (fs$copyFile)
    fs2.copyFile = copyFile2;
  function copyFile2(src, dest, flags, cb) {
    if (typeof flags === "function") {
      cb = flags;
      flags = 0;
    }
    return go$copyFile(src, dest, flags, cb);
    function go$copyFile(src2, dest2, flags2, cb2, startTime) {
      return fs$copyFile(src2, dest2, flags2, function(err) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
        else {
          if (typeof cb2 === "function")
            cb2.apply(this, arguments);
        }
      });
    }
  }
  var fs$readdir = fs2.readdir;
  fs2.readdir = readdir;
  var noReaddirOptionVersions = /^v[0-5]\./;
  function readdir(path2, options, cb) {
    if (typeof options === "function")
      cb = options, options = null;
    var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path22, options2, cb2, startTime) {
      return fs$readdir(path22, fs$readdirCallback(
        path22,
        options2,
        cb2,
        startTime
      ));
    } : function go$readdir2(path22, options2, cb2, startTime) {
      return fs$readdir(path22, options2, fs$readdirCallback(
        path22,
        options2,
        cb2,
        startTime
      ));
    };
    return go$readdir(path2, options, cb);
    function fs$readdirCallback(path22, options2, cb2, startTime) {
      return function(err, files) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([
            go$readdir,
            [path22, options2, cb2],
            err,
            startTime || Date.now(),
            Date.now()
          ]);
        else {
          if (files && files.sort)
            files.sort();
          if (typeof cb2 === "function")
            cb2.call(this, err, files);
        }
      };
    }
  }
  if (process.version.substr(0, 4) === "v0.8") {
    var legStreams = legacy(fs2);
    ReadStream = legStreams.ReadStream;
    WriteStream = legStreams.WriteStream;
  }
  var fs$ReadStream = fs2.ReadStream;
  if (fs$ReadStream) {
    ReadStream.prototype = Object.create(fs$ReadStream.prototype);
    ReadStream.prototype.open = ReadStream$open;
  }
  var fs$WriteStream = fs2.WriteStream;
  if (fs$WriteStream) {
    WriteStream.prototype = Object.create(fs$WriteStream.prototype);
    WriteStream.prototype.open = WriteStream$open;
  }
  Object.defineProperty(fs2, "ReadStream", {
    get: function() {
      return ReadStream;
    },
    set: function(val) {
      ReadStream = val;
    },
    enumerable: true,
    configurable: true
  });
  Object.defineProperty(fs2, "WriteStream", {
    get: function() {
      return WriteStream;
    },
    set: function(val) {
      WriteStream = val;
    },
    enumerable: true,
    configurable: true
  });
  var FileReadStream = ReadStream;
  Object.defineProperty(fs2, "FileReadStream", {
    get: function() {
      return FileReadStream;
    },
    set: function(val) {
      FileReadStream = val;
    },
    enumerable: true,
    configurable: true
  });
  var FileWriteStream = WriteStream;
  Object.defineProperty(fs2, "FileWriteStream", {
    get: function() {
      return FileWriteStream;
    },
    set: function(val) {
      FileWriteStream = val;
    },
    enumerable: true,
    configurable: true
  });
  function ReadStream(path2, options) {
    if (this instanceof ReadStream)
      return fs$ReadStream.apply(this, arguments), this;
    else
      return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
  }
  function ReadStream$open() {
    var that = this;
    open(that.path, that.flags, that.mode, function(err, fd) {
      if (err) {
        if (that.autoClose)
          that.destroy();
        that.emit("error", err);
      } else {
        that.fd = fd;
        that.emit("open", fd);
        that.read();
      }
    });
  }
  function WriteStream(path2, options) {
    if (this instanceof WriteStream)
      return fs$WriteStream.apply(this, arguments), this;
    else
      return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
  }
  function WriteStream$open() {
    var that = this;
    open(that.path, that.flags, that.mode, function(err, fd) {
      if (err) {
        that.destroy();
        that.emit("error", err);
      } else {
        that.fd = fd;
        that.emit("open", fd);
      }
    });
  }
  function createReadStream(path2, options) {
    return new fs2.ReadStream(path2, options);
  }
  function createWriteStream(path2, options) {
    return new fs2.WriteStream(path2, options);
  }
  var fs$open = fs2.open;
  fs2.open = open;
  function open(path2, flags, mode, cb) {
    if (typeof mode === "function")
      cb = mode, mode = null;
    return go$open(path2, flags, mode, cb);
    function go$open(path22, flags2, mode2, cb2, startTime) {
      return fs$open(path22, flags2, mode2, function(err, fd) {
        if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
          enqueue([go$open, [path22, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
        else {
          if (typeof cb2 === "function")
            cb2.apply(this, arguments);
        }
      });
    }
  }
  return fs2;
}
function enqueue(elem) {
  debug("ENQUEUE", elem[0].name, elem[1]);
  fs$j[gracefulQueue].push(elem);
  retry();
}
var retryTimer;
function resetQueue() {
  var now = Date.now();
  for (var i = 0; i < fs$j[gracefulQueue].length; ++i) {
    if (fs$j[gracefulQueue][i].length > 2) {
      fs$j[gracefulQueue][i][3] = now;
      fs$j[gracefulQueue][i][4] = now;
    }
  }
  retry();
}
function retry() {
  clearTimeout(retryTimer);
  retryTimer = void 0;
  if (fs$j[gracefulQueue].length === 0)
    return;
  var elem = fs$j[gracefulQueue].shift();
  var fn = elem[0];
  var args = elem[1];
  var err = elem[2];
  var startTime = elem[3];
  var lastTime = elem[4];
  if (startTime === void 0) {
    debug("RETRY", fn.name, args);
    fn.apply(null, args);
  } else if (Date.now() - startTime >= 6e4) {
    debug("TIMEOUT", fn.name, args);
    var cb = args.pop();
    if (typeof cb === "function")
      cb.call(null, err);
  } else {
    var sinceAttempt = Date.now() - lastTime;
    var sinceStart = Math.max(lastTime - startTime, 1);
    var desiredDelay = Math.min(sinceStart * 1.2, 100);
    if (sinceAttempt >= desiredDelay) {
      debug("RETRY", fn.name, args);
      fn.apply(null, args.concat([startTime]));
    } else {
      fs$j[gracefulQueue].push(elem);
    }
  }
  if (retryTimer === void 0) {
    retryTimer = setTimeout(retry, 0);
  }
}
(function(exports$1) {
  const u2 = universalify.fromCallback;
  const fs2 = gracefulFs;
  const api = [
    "access",
    "appendFile",
    "chmod",
    "chown",
    "close",
    "copyFile",
    "fchmod",
    "fchown",
    "fdatasync",
    "fstat",
    "fsync",
    "ftruncate",
    "futimes",
    "lchown",
    "lchmod",
    "link",
    "lstat",
    "mkdir",
    "mkdtemp",
    "open",
    "readFile",
    "readdir",
    "readlink",
    "realpath",
    "rename",
    "rmdir",
    "stat",
    "symlink",
    "truncate",
    "unlink",
    "utimes",
    "writeFile"
  ].filter((key) => {
    return typeof fs2[key] === "function";
  });
  Object.keys(fs2).forEach((key) => {
    if (key === "promises") {
      return;
    }
    exports$1[key] = fs2[key];
  });
  api.forEach((method) => {
    exports$1[method] = u2(fs2[method]);
  });
  exports$1.exists = function(filename, callback) {
    if (typeof callback === "function") {
      return fs2.exists(filename, callback);
    }
    return new Promise((resolve) => {
      return fs2.exists(filename, resolve);
    });
  };
  exports$1.read = function(fd, buffer2, offset, length, position, callback) {
    if (typeof callback === "function") {
      return fs2.read(fd, buffer2, offset, length, position, callback);
    }
    return new Promise((resolve, reject) => {
      fs2.read(fd, buffer2, offset, length, position, (err, bytesRead, buffer3) => {
        if (err) return reject(err);
        resolve({ bytesRead, buffer: buffer3 });
      });
    });
  };
  exports$1.write = function(fd, buffer2, ...args) {
    if (typeof args[args.length - 1] === "function") {
      return fs2.write(fd, buffer2, ...args);
    }
    return new Promise((resolve, reject) => {
      fs2.write(fd, buffer2, ...args, (err, bytesWritten, buffer3) => {
        if (err) return reject(err);
        resolve({ bytesWritten, buffer: buffer3 });
      });
    });
  };
  if (typeof fs2.realpath.native === "function") {
    exports$1.realpath.native = u2(fs2.realpath.native);
  }
})(fs$k);
const path$g = require$$1;
function getRootPath(p) {
  p = path$g.normalize(path$g.resolve(p)).split(path$g.sep);
  if (p.length > 0) return p[0];
  return null;
}
const INVALID_PATH_CHARS = /[<>:"|?*]/;
function invalidWin32Path$2(p) {
  const rp = getRootPath(p);
  p = p.replace(rp, "");
  return INVALID_PATH_CHARS.test(p);
}
var win32 = {
  invalidWin32Path: invalidWin32Path$2
};
const fs$i = gracefulFs;
const path$f = require$$1;
const invalidWin32Path$1 = win32.invalidWin32Path;
const o777$1 = parseInt("0777", 8);
function mkdirs$2(p, opts, callback, made) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  } else if (!opts || typeof opts !== "object") {
    opts = { mode: opts };
  }
  if (process.platform === "win32" && invalidWin32Path$1(p)) {
    const errInval = new Error(p + " contains invalid WIN32 path characters.");
    errInval.code = "EINVAL";
    return callback(errInval);
  }
  let mode = opts.mode;
  const xfs = opts.fs || fs$i;
  if (mode === void 0) {
    mode = o777$1 & ~process.umask();
  }
  if (!made) made = null;
  callback = callback || function() {
  };
  p = path$f.resolve(p);
  xfs.mkdir(p, mode, (er) => {
    if (!er) {
      made = made || p;
      return callback(null, made);
    }
    switch (er.code) {
      case "ENOENT":
        if (path$f.dirname(p) === p) return callback(er);
        mkdirs$2(path$f.dirname(p), opts, (er2, made2) => {
          if (er2) callback(er2, made2);
          else mkdirs$2(p, opts, callback, made2);
        });
        break;
      default:
        xfs.stat(p, (er2, stat2) => {
          if (er2 || !stat2.isDirectory()) callback(er, made);
          else callback(null, made);
        });
        break;
    }
  });
}
var mkdirs_1$1 = mkdirs$2;
const fs$h = gracefulFs;
const path$e = require$$1;
const invalidWin32Path = win32.invalidWin32Path;
const o777 = parseInt("0777", 8);
function mkdirsSync$2(p, opts, made) {
  if (!opts || typeof opts !== "object") {
    opts = { mode: opts };
  }
  let mode = opts.mode;
  const xfs = opts.fs || fs$h;
  if (process.platform === "win32" && invalidWin32Path(p)) {
    const errInval = new Error(p + " contains invalid WIN32 path characters.");
    errInval.code = "EINVAL";
    throw errInval;
  }
  if (mode === void 0) {
    mode = o777 & ~process.umask();
  }
  if (!made) made = null;
  p = path$e.resolve(p);
  try {
    xfs.mkdirSync(p, mode);
    made = made || p;
  } catch (err0) {
    if (err0.code === "ENOENT") {
      if (path$e.dirname(p) === p) throw err0;
      made = mkdirsSync$2(path$e.dirname(p), opts, made);
      mkdirsSync$2(p, opts, made);
    } else {
      let stat2;
      try {
        stat2 = xfs.statSync(p);
      } catch (err1) {
        throw err0;
      }
      if (!stat2.isDirectory()) throw err0;
    }
  }
  return made;
}
var mkdirsSync_1 = mkdirsSync$2;
const u$b = universalify.fromCallback;
const mkdirs$1 = u$b(mkdirs_1$1);
const mkdirsSync$1 = mkdirsSync_1;
var mkdirs_1 = {
  mkdirs: mkdirs$1,
  mkdirsSync: mkdirsSync$1,
  // alias
  mkdirp: mkdirs$1,
  mkdirpSync: mkdirsSync$1,
  ensureDir: mkdirs$1,
  ensureDirSync: mkdirsSync$1
};
const fs$g = gracefulFs;
function utimesMillis(path2, atime, mtime, callback) {
  fs$g.open(path2, "r+", (err, fd) => {
    if (err) return callback(err);
    fs$g.futimes(fd, atime, mtime, (futimesErr) => {
      fs$g.close(fd, (closeErr) => {
        if (callback) callback(futimesErr || closeErr);
      });
    });
  });
}
function utimesMillisSync(path2, atime, mtime) {
  const fd = fs$g.openSync(path2, "r+");
  fs$g.futimesSync(fd, atime, mtime);
  return fs$g.closeSync(fd);
}
var utimes$1 = {
  utimesMillis,
  utimesMillisSync
};
const fs$f = gracefulFs;
const path$d = require$$1;
const NODE_VERSION_MAJOR_WITH_BIGINT = 10;
const NODE_VERSION_MINOR_WITH_BIGINT = 5;
const NODE_VERSION_PATCH_WITH_BIGINT = 0;
const nodeVersion = process.versions.node.split(".");
const nodeVersionMajor = Number.parseInt(nodeVersion[0], 10);
const nodeVersionMinor = Number.parseInt(nodeVersion[1], 10);
const nodeVersionPatch = Number.parseInt(nodeVersion[2], 10);
function nodeSupportsBigInt() {
  if (nodeVersionMajor > NODE_VERSION_MAJOR_WITH_BIGINT) {
    return true;
  } else if (nodeVersionMajor === NODE_VERSION_MAJOR_WITH_BIGINT) {
    if (nodeVersionMinor > NODE_VERSION_MINOR_WITH_BIGINT) {
      return true;
    } else if (nodeVersionMinor === NODE_VERSION_MINOR_WITH_BIGINT) {
      if (nodeVersionPatch >= NODE_VERSION_PATCH_WITH_BIGINT) {
        return true;
      }
    }
  }
  return false;
}
function getStats$2(src, dest, cb) {
  if (nodeSupportsBigInt()) {
    fs$f.stat(src, { bigint: true }, (err, srcStat) => {
      if (err) return cb(err);
      fs$f.stat(dest, { bigint: true }, (err2, destStat) => {
        if (err2) {
          if (err2.code === "ENOENT") return cb(null, { srcStat, destStat: null });
          return cb(err2);
        }
        return cb(null, { srcStat, destStat });
      });
    });
  } else {
    fs$f.stat(src, (err, srcStat) => {
      if (err) return cb(err);
      fs$f.stat(dest, (err2, destStat) => {
        if (err2) {
          if (err2.code === "ENOENT") return cb(null, { srcStat, destStat: null });
          return cb(err2);
        }
        return cb(null, { srcStat, destStat });
      });
    });
  }
}
function getStatsSync(src, dest) {
  let srcStat, destStat;
  if (nodeSupportsBigInt()) {
    srcStat = fs$f.statSync(src, { bigint: true });
  } else {
    srcStat = fs$f.statSync(src);
  }
  try {
    if (nodeSupportsBigInt()) {
      destStat = fs$f.statSync(dest, { bigint: true });
    } else {
      destStat = fs$f.statSync(dest);
    }
  } catch (err) {
    if (err.code === "ENOENT") return { srcStat, destStat: null };
    throw err;
  }
  return { srcStat, destStat };
}
function checkPaths(src, dest, funcName, cb) {
  getStats$2(src, dest, (err, stats) => {
    if (err) return cb(err);
    const { srcStat, destStat } = stats;
    if (destStat && destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) {
      return cb(new Error("Source and destination must not be the same."));
    }
    if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
      return cb(new Error(errMsg(src, dest, funcName)));
    }
    return cb(null, { srcStat, destStat });
  });
}
function checkPathsSync(src, dest, funcName) {
  const { srcStat, destStat } = getStatsSync(src, dest);
  if (destStat && destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) {
    throw new Error("Source and destination must not be the same.");
  }
  if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
    throw new Error(errMsg(src, dest, funcName));
  }
  return { srcStat, destStat };
}
function checkParentPaths(src, srcStat, dest, funcName, cb) {
  const srcParent = path$d.resolve(path$d.dirname(src));
  const destParent = path$d.resolve(path$d.dirname(dest));
  if (destParent === srcParent || destParent === path$d.parse(destParent).root) return cb();
  if (nodeSupportsBigInt()) {
    fs$f.stat(destParent, { bigint: true }, (err, destStat) => {
      if (err) {
        if (err.code === "ENOENT") return cb();
        return cb(err);
      }
      if (destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) {
        return cb(new Error(errMsg(src, dest, funcName)));
      }
      return checkParentPaths(src, srcStat, destParent, funcName, cb);
    });
  } else {
    fs$f.stat(destParent, (err, destStat) => {
      if (err) {
        if (err.code === "ENOENT") return cb();
        return cb(err);
      }
      if (destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) {
        return cb(new Error(errMsg(src, dest, funcName)));
      }
      return checkParentPaths(src, srcStat, destParent, funcName, cb);
    });
  }
}
function checkParentPathsSync(src, srcStat, dest, funcName) {
  const srcParent = path$d.resolve(path$d.dirname(src));
  const destParent = path$d.resolve(path$d.dirname(dest));
  if (destParent === srcParent || destParent === path$d.parse(destParent).root) return;
  let destStat;
  try {
    if (nodeSupportsBigInt()) {
      destStat = fs$f.statSync(destParent, { bigint: true });
    } else {
      destStat = fs$f.statSync(destParent);
    }
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  if (destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) {
    throw new Error(errMsg(src, dest, funcName));
  }
  return checkParentPathsSync(src, srcStat, destParent, funcName);
}
function isSrcSubdir(src, dest) {
  const srcArr = path$d.resolve(src).split(path$d.sep).filter((i) => i);
  const destArr = path$d.resolve(dest).split(path$d.sep).filter((i) => i);
  return srcArr.reduce((acc, cur, i) => acc && destArr[i] === cur, true);
}
function errMsg(src, dest, funcName) {
  return `Cannot ${funcName} '${src}' to a subdirectory of itself, '${dest}'.`;
}
var stat$4 = {
  checkPaths,
  checkPathsSync,
  checkParentPaths,
  checkParentPathsSync,
  isSrcSubdir
};
var buffer;
var hasRequiredBuffer;
function requireBuffer() {
  if (hasRequiredBuffer) return buffer;
  hasRequiredBuffer = 1;
  buffer = function(size) {
    if (typeof Buffer.allocUnsafe === "function") {
      try {
        return Buffer.allocUnsafe(size);
      } catch (e) {
        return new Buffer(size);
      }
    }
    return new Buffer(size);
  };
  return buffer;
}
const fs$e = gracefulFs;
const path$c = require$$1;
const mkdirpSync$1 = mkdirs_1.mkdirsSync;
const utimesSync = utimes$1.utimesMillisSync;
const stat$3 = stat$4;
function copySync$2(src, dest, opts) {
  if (typeof opts === "function") {
    opts = { filter: opts };
  }
  opts = opts || {};
  opts.clobber = "clobber" in opts ? !!opts.clobber : true;
  opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
  if (opts.preserveTimestamps && process.arch === "ia32") {
    console.warn(`fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;

    see https://github.com/jprichardson/node-fs-extra/issues/269`);
  }
  const { srcStat, destStat } = stat$3.checkPathsSync(src, dest, "copy");
  stat$3.checkParentPathsSync(src, srcStat, dest, "copy");
  return handleFilterAndCopy(destStat, src, dest, opts);
}
function handleFilterAndCopy(destStat, src, dest, opts) {
  if (opts.filter && !opts.filter(src, dest)) return;
  const destParent = path$c.dirname(dest);
  if (!fs$e.existsSync(destParent)) mkdirpSync$1(destParent);
  return startCopy$1(destStat, src, dest, opts);
}
function startCopy$1(destStat, src, dest, opts) {
  if (opts.filter && !opts.filter(src, dest)) return;
  return getStats$1(destStat, src, dest, opts);
}
function getStats$1(destStat, src, dest, opts) {
  const statSync = opts.dereference ? fs$e.statSync : fs$e.lstatSync;
  const srcStat = statSync(src);
  if (srcStat.isDirectory()) return onDir$1(srcStat, destStat, src, dest, opts);
  else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile$1(srcStat, destStat, src, dest, opts);
  else if (srcStat.isSymbolicLink()) return onLink$1(destStat, src, dest, opts);
}
function onFile$1(srcStat, destStat, src, dest, opts) {
  if (!destStat) return copyFile$1(srcStat, src, dest, opts);
  return mayCopyFile$1(srcStat, src, dest, opts);
}
function mayCopyFile$1(srcStat, src, dest, opts) {
  if (opts.overwrite) {
    fs$e.unlinkSync(dest);
    return copyFile$1(srcStat, src, dest, opts);
  } else if (opts.errorOnExist) {
    throw new Error(`'${dest}' already exists`);
  }
}
function copyFile$1(srcStat, src, dest, opts) {
  if (typeof fs$e.copyFileSync === "function") {
    fs$e.copyFileSync(src, dest);
    fs$e.chmodSync(dest, srcStat.mode);
    if (opts.preserveTimestamps) {
      return utimesSync(dest, srcStat.atime, srcStat.mtime);
    }
    return;
  }
  return copyFileFallback$1(srcStat, src, dest, opts);
}
function copyFileFallback$1(srcStat, src, dest, opts) {
  const BUF_LENGTH = 64 * 1024;
  const _buff = requireBuffer()(BUF_LENGTH);
  const fdr = fs$e.openSync(src, "r");
  const fdw = fs$e.openSync(dest, "w", srcStat.mode);
  let pos = 0;
  while (pos < srcStat.size) {
    const bytesRead = fs$e.readSync(fdr, _buff, 0, BUF_LENGTH, pos);
    fs$e.writeSync(fdw, _buff, 0, bytesRead);
    pos += bytesRead;
  }
  if (opts.preserveTimestamps) fs$e.futimesSync(fdw, srcStat.atime, srcStat.mtime);
  fs$e.closeSync(fdr);
  fs$e.closeSync(fdw);
}
function onDir$1(srcStat, destStat, src, dest, opts) {
  if (!destStat) return mkDirAndCopy$1(srcStat, src, dest, opts);
  if (destStat && !destStat.isDirectory()) {
    throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
  }
  return copyDir$1(src, dest, opts);
}
function mkDirAndCopy$1(srcStat, src, dest, opts) {
  fs$e.mkdirSync(dest);
  copyDir$1(src, dest, opts);
  return fs$e.chmodSync(dest, srcStat.mode);
}
function copyDir$1(src, dest, opts) {
  fs$e.readdirSync(src).forEach((item) => copyDirItem$1(item, src, dest, opts));
}
function copyDirItem$1(item, src, dest, opts) {
  const srcItem = path$c.join(src, item);
  const destItem = path$c.join(dest, item);
  const { destStat } = stat$3.checkPathsSync(srcItem, destItem, "copy");
  return startCopy$1(destStat, srcItem, destItem, opts);
}
function onLink$1(destStat, src, dest, opts) {
  let resolvedSrc = fs$e.readlinkSync(src);
  if (opts.dereference) {
    resolvedSrc = path$c.resolve(process.cwd(), resolvedSrc);
  }
  if (!destStat) {
    return fs$e.symlinkSync(resolvedSrc, dest);
  } else {
    let resolvedDest;
    try {
      resolvedDest = fs$e.readlinkSync(dest);
    } catch (err) {
      if (err.code === "EINVAL" || err.code === "UNKNOWN") return fs$e.symlinkSync(resolvedSrc, dest);
      throw err;
    }
    if (opts.dereference) {
      resolvedDest = path$c.resolve(process.cwd(), resolvedDest);
    }
    if (stat$3.isSrcSubdir(resolvedSrc, resolvedDest)) {
      throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
    }
    if (fs$e.statSync(dest).isDirectory() && stat$3.isSrcSubdir(resolvedDest, resolvedSrc)) {
      throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
    }
    return copyLink$1(resolvedSrc, dest);
  }
}
function copyLink$1(resolvedSrc, dest) {
  fs$e.unlinkSync(dest);
  return fs$e.symlinkSync(resolvedSrc, dest);
}
var copySync_1 = copySync$2;
var copySync$1 = {
  copySync: copySync_1
};
const u$a = universalify.fromPromise;
const fs$d = fs$k;
function pathExists$9(path2) {
  return fs$d.access(path2).then(() => true).catch(() => false);
}
var pathExists_1 = {
  pathExists: u$a(pathExists$9),
  pathExistsSync: fs$d.existsSync
};
const fs$c = gracefulFs;
const path$b = require$$1;
const mkdirp$1 = mkdirs_1.mkdirs;
const pathExists$8 = pathExists_1.pathExists;
const utimes = utimes$1.utimesMillis;
const stat$2 = stat$4;
function copy$2(src, dest, opts, cb) {
  if (typeof opts === "function" && !cb) {
    cb = opts;
    opts = {};
  } else if (typeof opts === "function") {
    opts = { filter: opts };
  }
  cb = cb || function() {
  };
  opts = opts || {};
  opts.clobber = "clobber" in opts ? !!opts.clobber : true;
  opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
  if (opts.preserveTimestamps && process.arch === "ia32") {
    console.warn(`fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;

    see https://github.com/jprichardson/node-fs-extra/issues/269`);
  }
  stat$2.checkPaths(src, dest, "copy", (err, stats) => {
    if (err) return cb(err);
    const { srcStat, destStat } = stats;
    stat$2.checkParentPaths(src, srcStat, dest, "copy", (err2) => {
      if (err2) return cb(err2);
      if (opts.filter) return handleFilter(checkParentDir, destStat, src, dest, opts, cb);
      return checkParentDir(destStat, src, dest, opts, cb);
    });
  });
}
function checkParentDir(destStat, src, dest, opts, cb) {
  const destParent = path$b.dirname(dest);
  pathExists$8(destParent, (err, dirExists) => {
    if (err) return cb(err);
    if (dirExists) return startCopy(destStat, src, dest, opts, cb);
    mkdirp$1(destParent, (err2) => {
      if (err2) return cb(err2);
      return startCopy(destStat, src, dest, opts, cb);
    });
  });
}
function handleFilter(onInclude, destStat, src, dest, opts, cb) {
  Promise.resolve(opts.filter(src, dest)).then((include) => {
    if (include) return onInclude(destStat, src, dest, opts, cb);
    return cb();
  }, (error) => cb(error));
}
function startCopy(destStat, src, dest, opts, cb) {
  if (opts.filter) return handleFilter(getStats, destStat, src, dest, opts, cb);
  return getStats(destStat, src, dest, opts, cb);
}
function getStats(destStat, src, dest, opts, cb) {
  const stat2 = opts.dereference ? fs$c.stat : fs$c.lstat;
  stat2(src, (err, srcStat) => {
    if (err) return cb(err);
    if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts, cb);
    else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts, cb);
    else if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts, cb);
  });
}
function onFile(srcStat, destStat, src, dest, opts, cb) {
  if (!destStat) return copyFile(srcStat, src, dest, opts, cb);
  return mayCopyFile(srcStat, src, dest, opts, cb);
}
function mayCopyFile(srcStat, src, dest, opts, cb) {
  if (opts.overwrite) {
    fs$c.unlink(dest, (err) => {
      if (err) return cb(err);
      return copyFile(srcStat, src, dest, opts, cb);
    });
  } else if (opts.errorOnExist) {
    return cb(new Error(`'${dest}' already exists`));
  } else return cb();
}
function copyFile(srcStat, src, dest, opts, cb) {
  if (typeof fs$c.copyFile === "function") {
    return fs$c.copyFile(src, dest, (err) => {
      if (err) return cb(err);
      return setDestModeAndTimestamps(srcStat, dest, opts, cb);
    });
  }
  return copyFileFallback(srcStat, src, dest, opts, cb);
}
function copyFileFallback(srcStat, src, dest, opts, cb) {
  const rs = fs$c.createReadStream(src);
  rs.on("error", (err) => cb(err)).once("open", () => {
    const ws = fs$c.createWriteStream(dest, { mode: srcStat.mode });
    ws.on("error", (err) => cb(err)).on("open", () => rs.pipe(ws)).once("close", () => setDestModeAndTimestamps(srcStat, dest, opts, cb));
  });
}
function setDestModeAndTimestamps(srcStat, dest, opts, cb) {
  fs$c.chmod(dest, srcStat.mode, (err) => {
    if (err) return cb(err);
    if (opts.preserveTimestamps) {
      return utimes(dest, srcStat.atime, srcStat.mtime, cb);
    }
    return cb();
  });
}
function onDir(srcStat, destStat, src, dest, opts, cb) {
  if (!destStat) return mkDirAndCopy(srcStat, src, dest, opts, cb);
  if (destStat && !destStat.isDirectory()) {
    return cb(new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`));
  }
  return copyDir(src, dest, opts, cb);
}
function mkDirAndCopy(srcStat, src, dest, opts, cb) {
  fs$c.mkdir(dest, (err) => {
    if (err) return cb(err);
    copyDir(src, dest, opts, (err2) => {
      if (err2) return cb(err2);
      return fs$c.chmod(dest, srcStat.mode, cb);
    });
  });
}
function copyDir(src, dest, opts, cb) {
  fs$c.readdir(src, (err, items) => {
    if (err) return cb(err);
    return copyDirItems(items, src, dest, opts, cb);
  });
}
function copyDirItems(items, src, dest, opts, cb) {
  const item = items.pop();
  if (!item) return cb();
  return copyDirItem(items, item, src, dest, opts, cb);
}
function copyDirItem(items, item, src, dest, opts, cb) {
  const srcItem = path$b.join(src, item);
  const destItem = path$b.join(dest, item);
  stat$2.checkPaths(srcItem, destItem, "copy", (err, stats) => {
    if (err) return cb(err);
    const { destStat } = stats;
    startCopy(destStat, srcItem, destItem, opts, (err2) => {
      if (err2) return cb(err2);
      return copyDirItems(items, src, dest, opts, cb);
    });
  });
}
function onLink(destStat, src, dest, opts, cb) {
  fs$c.readlink(src, (err, resolvedSrc) => {
    if (err) return cb(err);
    if (opts.dereference) {
      resolvedSrc = path$b.resolve(process.cwd(), resolvedSrc);
    }
    if (!destStat) {
      return fs$c.symlink(resolvedSrc, dest, cb);
    } else {
      fs$c.readlink(dest, (err2, resolvedDest) => {
        if (err2) {
          if (err2.code === "EINVAL" || err2.code === "UNKNOWN") return fs$c.symlink(resolvedSrc, dest, cb);
          return cb(err2);
        }
        if (opts.dereference) {
          resolvedDest = path$b.resolve(process.cwd(), resolvedDest);
        }
        if (stat$2.isSrcSubdir(resolvedSrc, resolvedDest)) {
          return cb(new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`));
        }
        if (destStat.isDirectory() && stat$2.isSrcSubdir(resolvedDest, resolvedSrc)) {
          return cb(new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`));
        }
        return copyLink(resolvedSrc, dest, cb);
      });
    }
  });
}
function copyLink(resolvedSrc, dest, cb) {
  fs$c.unlink(dest, (err) => {
    if (err) return cb(err);
    return fs$c.symlink(resolvedSrc, dest, cb);
  });
}
var copy_1 = copy$2;
const u$9 = universalify.fromCallback;
var copy$1 = {
  copy: u$9(copy_1)
};
const fs$b = gracefulFs;
const path$a = require$$1;
const assert = require$$5;
const isWindows = process.platform === "win32";
function defaults(options) {
  const methods = [
    "unlink",
    "chmod",
    "stat",
    "lstat",
    "rmdir",
    "readdir"
  ];
  methods.forEach((m) => {
    options[m] = options[m] || fs$b[m];
    m = m + "Sync";
    options[m] = options[m] || fs$b[m];
  });
  options.maxBusyTries = options.maxBusyTries || 3;
}
function rimraf$1(p, options, cb) {
  let busyTries = 0;
  if (typeof options === "function") {
    cb = options;
    options = {};
  }
  assert(p, "rimraf: missing path");
  assert.strictEqual(typeof p, "string", "rimraf: path should be a string");
  assert.strictEqual(typeof cb, "function", "rimraf: callback function required");
  assert(options, "rimraf: invalid options argument provided");
  assert.strictEqual(typeof options, "object", "rimraf: options should be object");
  defaults(options);
  rimraf_(p, options, function CB(er) {
    if (er) {
      if ((er.code === "EBUSY" || er.code === "ENOTEMPTY" || er.code === "EPERM") && busyTries < options.maxBusyTries) {
        busyTries++;
        const time = busyTries * 100;
        return setTimeout(() => rimraf_(p, options, CB), time);
      }
      if (er.code === "ENOENT") er = null;
    }
    cb(er);
  });
}
function rimraf_(p, options, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === "function");
  options.lstat(p, (er, st) => {
    if (er && er.code === "ENOENT") {
      return cb(null);
    }
    if (er && er.code === "EPERM" && isWindows) {
      return fixWinEPERM(p, options, er, cb);
    }
    if (st && st.isDirectory()) {
      return rmdir(p, options, er, cb);
    }
    options.unlink(p, (er2) => {
      if (er2) {
        if (er2.code === "ENOENT") {
          return cb(null);
        }
        if (er2.code === "EPERM") {
          return isWindows ? fixWinEPERM(p, options, er2, cb) : rmdir(p, options, er2, cb);
        }
        if (er2.code === "EISDIR") {
          return rmdir(p, options, er2, cb);
        }
      }
      return cb(er2);
    });
  });
}
function fixWinEPERM(p, options, er, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === "function");
  if (er) {
    assert(er instanceof Error);
  }
  options.chmod(p, 438, (er2) => {
    if (er2) {
      cb(er2.code === "ENOENT" ? null : er);
    } else {
      options.stat(p, (er3, stats) => {
        if (er3) {
          cb(er3.code === "ENOENT" ? null : er);
        } else if (stats.isDirectory()) {
          rmdir(p, options, er, cb);
        } else {
          options.unlink(p, cb);
        }
      });
    }
  });
}
function fixWinEPERMSync(p, options, er) {
  let stats;
  assert(p);
  assert(options);
  if (er) {
    assert(er instanceof Error);
  }
  try {
    options.chmodSync(p, 438);
  } catch (er2) {
    if (er2.code === "ENOENT") {
      return;
    } else {
      throw er;
    }
  }
  try {
    stats = options.statSync(p);
  } catch (er3) {
    if (er3.code === "ENOENT") {
      return;
    } else {
      throw er;
    }
  }
  if (stats.isDirectory()) {
    rmdirSync(p, options, er);
  } else {
    options.unlinkSync(p);
  }
}
function rmdir(p, options, originalEr, cb) {
  assert(p);
  assert(options);
  if (originalEr) {
    assert(originalEr instanceof Error);
  }
  assert(typeof cb === "function");
  options.rmdir(p, (er) => {
    if (er && (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM")) {
      rmkids(p, options, cb);
    } else if (er && er.code === "ENOTDIR") {
      cb(originalEr);
    } else {
      cb(er);
    }
  });
}
function rmkids(p, options, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === "function");
  options.readdir(p, (er, files) => {
    if (er) return cb(er);
    let n = files.length;
    let errState;
    if (n === 0) return options.rmdir(p, cb);
    files.forEach((f) => {
      rimraf$1(path$a.join(p, f), options, (er2) => {
        if (errState) {
          return;
        }
        if (er2) return cb(errState = er2);
        if (--n === 0) {
          options.rmdir(p, cb);
        }
      });
    });
  });
}
function rimrafSync(p, options) {
  let st;
  options = options || {};
  defaults(options);
  assert(p, "rimraf: missing path");
  assert.strictEqual(typeof p, "string", "rimraf: path should be a string");
  assert(options, "rimraf: missing options");
  assert.strictEqual(typeof options, "object", "rimraf: options should be object");
  try {
    st = options.lstatSync(p);
  } catch (er) {
    if (er.code === "ENOENT") {
      return;
    }
    if (er.code === "EPERM" && isWindows) {
      fixWinEPERMSync(p, options, er);
    }
  }
  try {
    if (st && st.isDirectory()) {
      rmdirSync(p, options, null);
    } else {
      options.unlinkSync(p);
    }
  } catch (er) {
    if (er.code === "ENOENT") {
      return;
    } else if (er.code === "EPERM") {
      return isWindows ? fixWinEPERMSync(p, options, er) : rmdirSync(p, options, er);
    } else if (er.code !== "EISDIR") {
      throw er;
    }
    rmdirSync(p, options, er);
  }
}
function rmdirSync(p, options, originalEr) {
  assert(p);
  assert(options);
  if (originalEr) {
    assert(originalEr instanceof Error);
  }
  try {
    options.rmdirSync(p);
  } catch (er) {
    if (er.code === "ENOTDIR") {
      throw originalEr;
    } else if (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM") {
      rmkidsSync(p, options);
    } else if (er.code !== "ENOENT") {
      throw er;
    }
  }
}
function rmkidsSync(p, options) {
  assert(p);
  assert(options);
  options.readdirSync(p).forEach((f) => rimrafSync(path$a.join(p, f), options));
  if (isWindows) {
    const startTime = Date.now();
    do {
      try {
        const ret = options.rmdirSync(p, options);
        return ret;
      } catch (er) {
      }
    } while (Date.now() - startTime < 500);
  } else {
    const ret = options.rmdirSync(p, options);
    return ret;
  }
}
var rimraf_1 = rimraf$1;
rimraf$1.sync = rimrafSync;
const u$8 = universalify.fromCallback;
const rimraf = rimraf_1;
var remove$2 = {
  remove: u$8(rimraf),
  removeSync: rimraf.sync
};
const u$7 = universalify.fromCallback;
const fs$a = gracefulFs;
const path$9 = require$$1;
const mkdir$5 = mkdirs_1;
const remove$1 = remove$2;
const emptyDir = u$7(function emptyDir2(dir, callback) {
  callback = callback || function() {
  };
  fs$a.readdir(dir, (err, items) => {
    if (err) return mkdir$5.mkdirs(dir, callback);
    items = items.map((item) => path$9.join(dir, item));
    deleteItem();
    function deleteItem() {
      const item = items.pop();
      if (!item) return callback();
      remove$1.remove(item, (err2) => {
        if (err2) return callback(err2);
        deleteItem();
      });
    }
  });
});
function emptyDirSync(dir) {
  let items;
  try {
    items = fs$a.readdirSync(dir);
  } catch (err) {
    return mkdir$5.mkdirsSync(dir);
  }
  items.forEach((item) => {
    item = path$9.join(dir, item);
    remove$1.removeSync(item);
  });
}
var empty = {
  emptyDirSync,
  emptydirSync: emptyDirSync,
  emptyDir,
  emptydir: emptyDir
};
const u$6 = universalify.fromCallback;
const path$8 = require$$1;
const fs$9 = gracefulFs;
const mkdir$4 = mkdirs_1;
const pathExists$7 = pathExists_1.pathExists;
function createFile(file2, callback) {
  function makeFile() {
    fs$9.writeFile(file2, "", (err) => {
      if (err) return callback(err);
      callback();
    });
  }
  fs$9.stat(file2, (err, stats) => {
    if (!err && stats.isFile()) return callback();
    const dir = path$8.dirname(file2);
    pathExists$7(dir, (err2, dirExists) => {
      if (err2) return callback(err2);
      if (dirExists) return makeFile();
      mkdir$4.mkdirs(dir, (err3) => {
        if (err3) return callback(err3);
        makeFile();
      });
    });
  });
}
function createFileSync(file2) {
  let stats;
  try {
    stats = fs$9.statSync(file2);
  } catch (e) {
  }
  if (stats && stats.isFile()) return;
  const dir = path$8.dirname(file2);
  if (!fs$9.existsSync(dir)) {
    mkdir$4.mkdirsSync(dir);
  }
  fs$9.writeFileSync(file2, "");
}
var file$1 = {
  createFile: u$6(createFile),
  createFileSync
};
const u$5 = universalify.fromCallback;
const path$7 = require$$1;
const fs$8 = gracefulFs;
const mkdir$3 = mkdirs_1;
const pathExists$6 = pathExists_1.pathExists;
function createLink(srcpath, dstpath, callback) {
  function makeLink(srcpath2, dstpath2) {
    fs$8.link(srcpath2, dstpath2, (err) => {
      if (err) return callback(err);
      callback(null);
    });
  }
  pathExists$6(dstpath, (err, destinationExists) => {
    if (err) return callback(err);
    if (destinationExists) return callback(null);
    fs$8.lstat(srcpath, (err2) => {
      if (err2) {
        err2.message = err2.message.replace("lstat", "ensureLink");
        return callback(err2);
      }
      const dir = path$7.dirname(dstpath);
      pathExists$6(dir, (err3, dirExists) => {
        if (err3) return callback(err3);
        if (dirExists) return makeLink(srcpath, dstpath);
        mkdir$3.mkdirs(dir, (err4) => {
          if (err4) return callback(err4);
          makeLink(srcpath, dstpath);
        });
      });
    });
  });
}
function createLinkSync(srcpath, dstpath) {
  const destinationExists = fs$8.existsSync(dstpath);
  if (destinationExists) return void 0;
  try {
    fs$8.lstatSync(srcpath);
  } catch (err) {
    err.message = err.message.replace("lstat", "ensureLink");
    throw err;
  }
  const dir = path$7.dirname(dstpath);
  const dirExists = fs$8.existsSync(dir);
  if (dirExists) return fs$8.linkSync(srcpath, dstpath);
  mkdir$3.mkdirsSync(dir);
  return fs$8.linkSync(srcpath, dstpath);
}
var link$1 = {
  createLink: u$5(createLink),
  createLinkSync
};
const path$6 = require$$1;
const fs$7 = gracefulFs;
const pathExists$5 = pathExists_1.pathExists;
function symlinkPaths$1(srcpath, dstpath, callback) {
  if (path$6.isAbsolute(srcpath)) {
    return fs$7.lstat(srcpath, (err) => {
      if (err) {
        err.message = err.message.replace("lstat", "ensureSymlink");
        return callback(err);
      }
      return callback(null, {
        "toCwd": srcpath,
        "toDst": srcpath
      });
    });
  } else {
    const dstdir = path$6.dirname(dstpath);
    const relativeToDst = path$6.join(dstdir, srcpath);
    return pathExists$5(relativeToDst, (err, exists) => {
      if (err) return callback(err);
      if (exists) {
        return callback(null, {
          "toCwd": relativeToDst,
          "toDst": srcpath
        });
      } else {
        return fs$7.lstat(srcpath, (err2) => {
          if (err2) {
            err2.message = err2.message.replace("lstat", "ensureSymlink");
            return callback(err2);
          }
          return callback(null, {
            "toCwd": srcpath,
            "toDst": path$6.relative(dstdir, srcpath)
          });
        });
      }
    });
  }
}
function symlinkPathsSync$1(srcpath, dstpath) {
  let exists;
  if (path$6.isAbsolute(srcpath)) {
    exists = fs$7.existsSync(srcpath);
    if (!exists) throw new Error("absolute srcpath does not exist");
    return {
      "toCwd": srcpath,
      "toDst": srcpath
    };
  } else {
    const dstdir = path$6.dirname(dstpath);
    const relativeToDst = path$6.join(dstdir, srcpath);
    exists = fs$7.existsSync(relativeToDst);
    if (exists) {
      return {
        "toCwd": relativeToDst,
        "toDst": srcpath
      };
    } else {
      exists = fs$7.existsSync(srcpath);
      if (!exists) throw new Error("relative srcpath does not exist");
      return {
        "toCwd": srcpath,
        "toDst": path$6.relative(dstdir, srcpath)
      };
    }
  }
}
var symlinkPaths_1 = {
  symlinkPaths: symlinkPaths$1,
  symlinkPathsSync: symlinkPathsSync$1
};
const fs$6 = gracefulFs;
function symlinkType$1(srcpath, type, callback) {
  callback = typeof type === "function" ? type : callback;
  type = typeof type === "function" ? false : type;
  if (type) return callback(null, type);
  fs$6.lstat(srcpath, (err, stats) => {
    if (err) return callback(null, "file");
    type = stats && stats.isDirectory() ? "dir" : "file";
    callback(null, type);
  });
}
function symlinkTypeSync$1(srcpath, type) {
  let stats;
  if (type) return type;
  try {
    stats = fs$6.lstatSync(srcpath);
  } catch (e) {
    return "file";
  }
  return stats && stats.isDirectory() ? "dir" : "file";
}
var symlinkType_1 = {
  symlinkType: symlinkType$1,
  symlinkTypeSync: symlinkTypeSync$1
};
const u$4 = universalify.fromCallback;
const path$5 = require$$1;
const fs$5 = gracefulFs;
const _mkdirs = mkdirs_1;
const mkdirs = _mkdirs.mkdirs;
const mkdirsSync = _mkdirs.mkdirsSync;
const _symlinkPaths = symlinkPaths_1;
const symlinkPaths = _symlinkPaths.symlinkPaths;
const symlinkPathsSync = _symlinkPaths.symlinkPathsSync;
const _symlinkType = symlinkType_1;
const symlinkType = _symlinkType.symlinkType;
const symlinkTypeSync = _symlinkType.symlinkTypeSync;
const pathExists$4 = pathExists_1.pathExists;
function createSymlink(srcpath, dstpath, type, callback) {
  callback = typeof type === "function" ? type : callback;
  type = typeof type === "function" ? false : type;
  pathExists$4(dstpath, (err, destinationExists) => {
    if (err) return callback(err);
    if (destinationExists) return callback(null);
    symlinkPaths(srcpath, dstpath, (err2, relative) => {
      if (err2) return callback(err2);
      srcpath = relative.toDst;
      symlinkType(relative.toCwd, type, (err3, type2) => {
        if (err3) return callback(err3);
        const dir = path$5.dirname(dstpath);
        pathExists$4(dir, (err4, dirExists) => {
          if (err4) return callback(err4);
          if (dirExists) return fs$5.symlink(srcpath, dstpath, type2, callback);
          mkdirs(dir, (err5) => {
            if (err5) return callback(err5);
            fs$5.symlink(srcpath, dstpath, type2, callback);
          });
        });
      });
    });
  });
}
function createSymlinkSync(srcpath, dstpath, type) {
  const destinationExists = fs$5.existsSync(dstpath);
  if (destinationExists) return void 0;
  const relative = symlinkPathsSync(srcpath, dstpath);
  srcpath = relative.toDst;
  type = symlinkTypeSync(relative.toCwd, type);
  const dir = path$5.dirname(dstpath);
  const exists = fs$5.existsSync(dir);
  if (exists) return fs$5.symlinkSync(srcpath, dstpath, type);
  mkdirsSync(dir);
  return fs$5.symlinkSync(srcpath, dstpath, type);
}
var symlink$1 = {
  createSymlink: u$4(createSymlink),
  createSymlinkSync
};
const file = file$1;
const link = link$1;
const symlink = symlink$1;
var ensure = {
  // file
  createFile: file.createFile,
  createFileSync: file.createFileSync,
  ensureFile: file.createFile,
  ensureFileSync: file.createFileSync,
  // link
  createLink: link.createLink,
  createLinkSync: link.createLinkSync,
  ensureLink: link.createLink,
  ensureLinkSync: link.createLinkSync,
  // symlink
  createSymlink: symlink.createSymlink,
  createSymlinkSync: symlink.createSymlinkSync,
  ensureSymlink: symlink.createSymlink,
  ensureSymlinkSync: symlink.createSymlinkSync
};
var _fs;
try {
  _fs = gracefulFs;
} catch (_) {
  _fs = fs$l;
}
function readFile(file2, options, callback) {
  if (callback == null) {
    callback = options;
    options = {};
  }
  if (typeof options === "string") {
    options = { encoding: options };
  }
  options = options || {};
  var fs2 = options.fs || _fs;
  var shouldThrow = true;
  if ("throws" in options) {
    shouldThrow = options.throws;
  }
  fs2.readFile(file2, options, function(err, data) {
    if (err) return callback(err);
    data = stripBom$1(data);
    var obj;
    try {
      obj = JSON.parse(data, options ? options.reviver : null);
    } catch (err2) {
      if (shouldThrow) {
        err2.message = file2 + ": " + err2.message;
        return callback(err2);
      } else {
        return callback(null, null);
      }
    }
    callback(null, obj);
  });
}
function readFileSync(file2, options) {
  options = options || {};
  if (typeof options === "string") {
    options = { encoding: options };
  }
  var fs2 = options.fs || _fs;
  var shouldThrow = true;
  if ("throws" in options) {
    shouldThrow = options.throws;
  }
  try {
    var content = fs2.readFileSync(file2, options);
    content = stripBom$1(content);
    return JSON.parse(content, options.reviver);
  } catch (err) {
    if (shouldThrow) {
      err.message = file2 + ": " + err.message;
      throw err;
    } else {
      return null;
    }
  }
}
function stringify(obj, options) {
  var spaces;
  var EOL = "\n";
  if (typeof options === "object" && options !== null) {
    if (options.spaces) {
      spaces = options.spaces;
    }
    if (options.EOL) {
      EOL = options.EOL;
    }
  }
  var str = JSON.stringify(obj, options ? options.replacer : null, spaces);
  return str.replace(/\n/g, EOL) + EOL;
}
function writeFile(file2, obj, options, callback) {
  if (callback == null) {
    callback = options;
    options = {};
  }
  options = options || {};
  var fs2 = options.fs || _fs;
  var str = "";
  try {
    str = stringify(obj, options);
  } catch (err) {
    if (callback) callback(err, null);
    return;
  }
  fs2.writeFile(file2, str, options, callback);
}
function writeFileSync(file2, obj, options) {
  options = options || {};
  var fs2 = options.fs || _fs;
  var str = stringify(obj, options);
  return fs2.writeFileSync(file2, str, options);
}
function stripBom$1(content) {
  if (Buffer.isBuffer(content)) content = content.toString("utf8");
  content = content.replace(/^\uFEFF/, "");
  return content;
}
var jsonfile$1 = {
  readFile,
  readFileSync,
  writeFile,
  writeFileSync
};
var jsonfile_1 = jsonfile$1;
const u$3 = universalify.fromCallback;
const jsonFile$3 = jsonfile_1;
var jsonfile = {
  // jsonfile exports
  readJson: u$3(jsonFile$3.readFile),
  readJsonSync: jsonFile$3.readFileSync,
  writeJson: u$3(jsonFile$3.writeFile),
  writeJsonSync: jsonFile$3.writeFileSync
};
const path$4 = require$$1;
const mkdir$2 = mkdirs_1;
const pathExists$3 = pathExists_1.pathExists;
const jsonFile$2 = jsonfile;
function outputJson(file2, data, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const dir = path$4.dirname(file2);
  pathExists$3(dir, (err, itDoes) => {
    if (err) return callback(err);
    if (itDoes) return jsonFile$2.writeJson(file2, data, options, callback);
    mkdir$2.mkdirs(dir, (err2) => {
      if (err2) return callback(err2);
      jsonFile$2.writeJson(file2, data, options, callback);
    });
  });
}
var outputJson_1 = outputJson;
const fs$4 = gracefulFs;
const path$3 = require$$1;
const mkdir$1 = mkdirs_1;
const jsonFile$1 = jsonfile;
function outputJsonSync(file2, data, options) {
  const dir = path$3.dirname(file2);
  if (!fs$4.existsSync(dir)) {
    mkdir$1.mkdirsSync(dir);
  }
  jsonFile$1.writeJsonSync(file2, data, options);
}
var outputJsonSync_1 = outputJsonSync;
const u$2 = universalify.fromCallback;
const jsonFile = jsonfile;
jsonFile.outputJson = u$2(outputJson_1);
jsonFile.outputJsonSync = outputJsonSync_1;
jsonFile.outputJSON = jsonFile.outputJson;
jsonFile.outputJSONSync = jsonFile.outputJsonSync;
jsonFile.writeJSON = jsonFile.writeJson;
jsonFile.writeJSONSync = jsonFile.writeJsonSync;
jsonFile.readJSON = jsonFile.readJson;
jsonFile.readJSONSync = jsonFile.readJsonSync;
var json = jsonFile;
const fs$3 = gracefulFs;
const path$2 = require$$1;
const copySync = copySync$1.copySync;
const removeSync = remove$2.removeSync;
const mkdirpSync = mkdirs_1.mkdirpSync;
const stat$1 = stat$4;
function moveSync$1(src, dest, opts) {
  opts = opts || {};
  const overwrite = opts.overwrite || opts.clobber || false;
  const { srcStat } = stat$1.checkPathsSync(src, dest, "move");
  stat$1.checkParentPathsSync(src, srcStat, dest, "move");
  mkdirpSync(path$2.dirname(dest));
  return doRename$1(src, dest, overwrite);
}
function doRename$1(src, dest, overwrite) {
  if (overwrite) {
    removeSync(dest);
    return rename$1(src, dest, overwrite);
  }
  if (fs$3.existsSync(dest)) throw new Error("dest already exists.");
  return rename$1(src, dest, overwrite);
}
function rename$1(src, dest, overwrite) {
  try {
    fs$3.renameSync(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    return moveAcrossDevice$1(src, dest, overwrite);
  }
}
function moveAcrossDevice$1(src, dest, overwrite) {
  const opts = {
    overwrite,
    errorOnExist: true
  };
  copySync(src, dest, opts);
  return removeSync(src);
}
var moveSync_1 = moveSync$1;
var moveSync = {
  moveSync: moveSync_1
};
const fs$2 = gracefulFs;
const path$1 = require$$1;
const copy = copy$1.copy;
const remove = remove$2.remove;
const mkdirp = mkdirs_1.mkdirp;
const pathExists$2 = pathExists_1.pathExists;
const stat = stat$4;
function move$1(src, dest, opts, cb) {
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  const overwrite = opts.overwrite || opts.clobber || false;
  stat.checkPaths(src, dest, "move", (err, stats) => {
    if (err) return cb(err);
    const { srcStat } = stats;
    stat.checkParentPaths(src, srcStat, dest, "move", (err2) => {
      if (err2) return cb(err2);
      mkdirp(path$1.dirname(dest), (err3) => {
        if (err3) return cb(err3);
        return doRename(src, dest, overwrite, cb);
      });
    });
  });
}
function doRename(src, dest, overwrite, cb) {
  if (overwrite) {
    return remove(dest, (err) => {
      if (err) return cb(err);
      return rename(src, dest, overwrite, cb);
    });
  }
  pathExists$2(dest, (err, destExists) => {
    if (err) return cb(err);
    if (destExists) return cb(new Error("dest already exists."));
    return rename(src, dest, overwrite, cb);
  });
}
function rename(src, dest, overwrite, cb) {
  fs$2.rename(src, dest, (err) => {
    if (!err) return cb();
    if (err.code !== "EXDEV") return cb(err);
    return moveAcrossDevice(src, dest, overwrite, cb);
  });
}
function moveAcrossDevice(src, dest, overwrite, cb) {
  const opts = {
    overwrite,
    errorOnExist: true
  };
  copy(src, dest, opts, (err) => {
    if (err) return cb(err);
    return remove(src, cb);
  });
}
var move_1 = move$1;
const u$1 = universalify.fromCallback;
var move = {
  move: u$1(move_1)
};
const u = universalify.fromCallback;
const fs$1 = gracefulFs;
const path = require$$1;
const mkdir = mkdirs_1;
const pathExists$1 = pathExists_1.pathExists;
function outputFile(file2, data, encoding, callback) {
  if (typeof encoding === "function") {
    callback = encoding;
    encoding = "utf8";
  }
  const dir = path.dirname(file2);
  pathExists$1(dir, (err, itDoes) => {
    if (err) return callback(err);
    if (itDoes) return fs$1.writeFile(file2, data, encoding, callback);
    mkdir.mkdirs(dir, (err2) => {
      if (err2) return callback(err2);
      fs$1.writeFile(file2, data, encoding, callback);
    });
  });
}
function outputFileSync(file2, ...args) {
  const dir = path.dirname(file2);
  if (fs$1.existsSync(dir)) {
    return fs$1.writeFileSync(file2, ...args);
  }
  mkdir.mkdirsSync(dir);
  fs$1.writeFileSync(file2, ...args);
}
var output = {
  outputFile: u(outputFile),
  outputFileSync
};
(function(module2) {
  module2.exports = Object.assign(
    {},
    // Export promiseified graceful-fs:
    fs$k,
    // Export extra methods:
    copySync$1,
    copy$1,
    empty,
    ensure,
    json,
    mkdirs_1,
    moveSync,
    move,
    output,
    pathExists_1,
    remove$2
  );
  const fs2 = fs$l;
  if (Object.getOwnPropertyDescriptor(fs2, "promises")) {
    Object.defineProperty(module2.exports, "promises", {
      get() {
        return fs2.promises;
      }
    });
  }
})(lib);
var libExports = lib.exports;
const fs = /* @__PURE__ */ getDefaultExportFromCjs(libExports);
function atomicWriteFileSync(filePath, data, options) {
  const tmpPath = filePath + ".tmp";
  const bakPath = filePath + ".bak";
  try {
    fs$l.writeFileSync(tmpPath, data, options?.encoding || "utf-8");
    if (options?.backup && fs$l.existsSync(filePath)) {
      try {
        fs$l.copyFileSync(filePath, bakPath);
      } catch {
      }
    }
    fs$l.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (fs$l.existsSync(tmpPath)) fs$l.unlinkSync(tmpPath);
    } catch {
    }
    throw error;
  }
}
function atomicWriteJsonSync(filePath, data, options) {
  const json2 = JSON.stringify(data, null, options?.indent ?? 2);
  atomicWriteFileSync(filePath, json2, { backup: options?.backup });
}
async function atomicWriteFile(filePath, data, options) {
  const tmpPath = filePath + ".tmp";
  const bakPath = filePath + ".bak";
  try {
    await fs$l.promises.writeFile(tmpPath, data, options?.encoding || "utf-8");
    if (options?.backup) {
      try {
        await fs$l.promises.copyFile(filePath, bakPath);
      } catch {
      }
    }
    await fs$l.promises.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs$l.promises.unlink(tmpPath);
    } catch {
    }
    throw error;
  }
}
async function atomicWriteJson(filePath, data, options) {
  const json2 = JSON.stringify(data, null, options?.indent ?? 2);
  await atomicWriteFile(filePath, json2, { backup: options?.backup });
}
function safeReadJsonSync(filePath, defaultValue) {
  try {
    if (fs$l.existsSync(filePath)) {
      return JSON.parse(fs$l.readFileSync(filePath, "utf-8"));
    }
  } catch {
  }
  try {
    const bakPath = filePath + ".bak";
    if (fs$l.existsSync(bakPath)) {
      const content = fs$l.readFileSync(bakPath, "utf-8");
      const data = JSON.parse(content);
      atomicWriteFileSync(filePath, content);
      console.log(`[AtomicWrite] Recovered ${filePath} from .bak`);
      return data;
    }
  } catch {
  }
  try {
    const tmpPath = filePath + ".tmp";
    if (fs$l.existsSync(tmpPath)) {
      const content = fs$l.readFileSync(tmpPath, "utf-8");
      const data = JSON.parse(content);
      fs$l.renameSync(tmpPath, filePath);
      console.log(`[AtomicWrite] Recovered ${filePath} from .tmp`);
      return data;
    }
  } catch {
  }
  return defaultValue;
}
async function safeReadJson(filePath, defaultValue) {
  try {
    const content = await fs$l.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
  }
  try {
    const bakPath = filePath + ".bak";
    const content = await fs$l.promises.readFile(bakPath, "utf-8");
    const data = JSON.parse(content);
    await atomicWriteFile(filePath, content);
    console.log(`[AtomicWrite] Recovered ${filePath} from .bak`);
    return data;
  } catch {
  }
  try {
    const tmpPath = filePath + ".tmp";
    const content = await fs$l.promises.readFile(tmpPath, "utf-8");
    const data = JSON.parse(content);
    await fs$l.promises.rename(tmpPath, filePath);
    console.log(`[AtomicWrite] Recovered ${filePath} from .tmp`);
    return data;
  } catch {
  }
  return defaultValue;
}
function cleanupTmpFiles(dir) {
  if (!fs$l.existsSync(dir)) return 0;
  let cleaned = 0;
  const files = fs$l.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
  for (const file2 of files) {
    const tmpPath = require$$1.join(dir, file2);
    const targetPath = tmpPath.slice(0, -4);
    try {
      if (fs$l.existsSync(targetPath)) {
        fs$l.unlinkSync(tmpPath);
      } else {
        try {
          fs$l.renameSync(tmpPath, targetPath);
          console.log(`[AtomicWrite] Recovered ${targetPath} from orphan .tmp`);
        } catch {
          fs$l.unlinkSync(tmpPath);
        }
      }
      cleaned++;
    } catch {
    }
  }
  return cleaned;
}
function resolveBrowserAutomationMode(mode) {
  return mode === "system-browser" ? "system-browser" : "ai-browser";
}
const CONFIG_EVENTS = {
  apiConfigChanged: "api-config-changed",
  memoryConfigChanged: "memory-config-changed"
};
const configEvents = new events.EventEmitter();
configEvents.setMaxListeners(50);
function emitConfigEventSafely(event, ...args) {
  const listeners = configEvents.listeners(event);
  for (const listener of listeners) {
    try {
      listener(...args);
    } catch (e) {
      console.error(`[Config] Error in ${event} handler:`, e);
    }
  }
}
function getHaloDir() {
  if (process.env.SKILLSFAN_DATA_DIR) {
    let dir = process.env.SKILLSFAN_DATA_DIR;
    if (dir.startsWith("~")) {
      dir = require$$1.join(require$$1$1.homedir(), dir.slice(1));
    }
    return dir;
  }
  if (!electron.app.isPackaged) {
    return require$$1.join(require$$1$1.homedir(), ".skillsfan-dev");
  }
  return require$$1.join(require$$1$1.homedir(), ".skillsfan");
}
function getConfigPath() {
  return require$$1.join(getHaloDir(), "config.json");
}
function getTempSpacePath() {
  return require$$1.join(getHaloDir(), "temp");
}
function getSpacesDir() {
  return require$$1.join(getHaloDir(), "spaces");
}
const DEFAULT_MODEL$1 = "GLM-5-Turbo";
const DEFAULT_CONFIG = {
  api: {
    provider: "anthropic",
    apiKey: "",
    apiUrl: "https://api.anthropic.com",
    model: DEFAULT_MODEL$1
  },
  aiSources: {
    current: "glm"
  },
  permissions: {
    fileAccess: "allow",
    commandExecution: "ask",
    networkAccess: "allow",
    trustMode: false
  },
  appearance: {
    theme: "light"
  },
  system: {
    autoLaunch: false,
    minimizeToTray: false
  },
  remoteAccess: {
    enabled: false,
    port: 3456
  },
  browserAutomation: {
    enabled: false,
    mode: "ai-browser"
  },
  terminal: {
    skipClaudeLogin: true
  },
  skillSettings: {
    preferNativeClaudeSkillTool: true
  },
  onboarding: {
    completed: false
  },
  mcpServers: {},
  // Empty by default
  isFirstLaunch: true,
  spaces: {
    defaultSpaceId: null
    // null = Halo space
  },
  memory: {
    enabled: true,
    retentionDays: 0
    // 0 = forever
  },
  customInstructions: {
    enabled: false,
    content: ""
  }
};
function setActiveSpaceId(spaceId) {
}
const CONFIG_FILE_MODE = 384;
function ensureConfigFilePermissions(configPath) {
  if (process.platform === "win32") return;
  try {
    fs$l.chmodSync(configPath, CONFIG_FILE_MODE);
  } catch (error) {
    console.warn("[Config] Failed to set config file permissions:", error);
  }
}
async function ensureConfigFilePermissionsAsync(configPath) {
  if (process.platform === "win32") return;
  try {
    await fs$m.chmod(configPath, CONFIG_FILE_MODE);
  } catch (error) {
    console.warn("[Config] Failed to set config file permissions (async):", error);
  }
}
function normalizeAiSources(parsed) {
  const raw = parsed?.aiSources;
  const aiSources = {
    ...raw && typeof raw === "object" ? raw : {}
  };
  if (!aiSources.current) {
    aiSources.current = "custom";
  }
  const legacyApi = parsed?.api;
  const hasLegacyApi = typeof legacyApi?.apiKey === "string" && legacyApi.apiKey.length > 0;
  const hasNamedProviderConfigs = Object.keys(aiSources).some((key) => {
    if (key === "current" || key === "custom" || key === "oauth") return false;
    const source = aiSources[key];
    if (!source || typeof source !== "object") return false;
    if ("loggedIn" in source) {
      return Boolean(source.loggedIn);
    }
    if ("apiKey" in source) {
      return Boolean(source.apiKey);
    }
    return false;
  });
  const shouldPromoteLegacyApiToCustom = !aiSources.custom && hasLegacyApi && (aiSources.current === "custom" || !hasNamedProviderConfigs);
  if (shouldPromoteLegacyApiToCustom) {
    const provider = legacyApi?.provider === "openai" ? "openai" : "anthropic";
    aiSources.custom = {
      provider,
      apiKey: legacyApi?.apiKey || "",
      apiUrl: legacyApi?.apiUrl || (provider === "openai" ? "https://api.openai.com" : "https://api.anthropic.com"),
      model: legacyApi?.model || DEFAULT_MODEL$1
    };
  }
  if (aiSources.custom) {
    const provider = aiSources.custom.provider === "openai" ? "openai" : "anthropic";
    aiSources.custom = {
      provider,
      apiKey: aiSources.custom.apiKey || "",
      apiUrl: aiSources.custom.apiUrl || (provider === "openai" ? "https://api.openai.com" : "https://api.anthropic.com"),
      model: aiSources.custom.model || DEFAULT_MODEL$1
    };
  }
  if (aiSources.custom && aiSources.current !== "custom") {
    const custom = aiSources.custom;
    const duplicatedNamedProvider = Object.keys(aiSources).some((key) => {
      if (key === "current" || key === "custom" || key === "oauth") return false;
      const source = aiSources[key];
      if (!source || typeof source !== "object" || !("apiKey" in source)) return false;
      const normalizedProvider = source.provider === "openai" ? "openai" : "anthropic";
      return normalizedProvider === custom.provider && (source.apiKey || "") === custom.apiKey && (source.apiUrl || "") === custom.apiUrl && (source.model || "") === custom.model;
    });
    if (duplicatedNamedProvider) {
      delete aiSources.custom;
    }
  }
  for (const key of Object.keys(aiSources)) {
    if (key === "current" || key === "custom" || key === "oauth") continue;
    const source = aiSources[key];
    if (!source || typeof source !== "object") continue;
    if ("loggedIn" in source) continue;
    if (!("apiKey" in source) || !source.apiKey) continue;
    const custom = source;
    if (custom.configs && custom.configs.length > 0) continue;
    custom.configs = [{
      provider: custom.provider,
      apiKey: custom.apiKey,
      apiUrl: custom.apiUrl,
      model: custom.model,
      label: custom.model || void 0
    }];
    custom.activeConfigIndex = 0;
  }
  return aiSources;
}
function normalizeBrowserAutomation(parsed) {
  const raw = parsed?.browserAutomation;
  const hasLegacyMode = Boolean(raw && typeof raw === "object" && typeof raw.mode === "string");
  return {
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : hasLegacyMode,
    mode: resolveBrowserAutomationMode(raw?.mode)
  };
}
function normalizeTerminalConfig(parsed) {
  const raw = parsed?.terminal;
  return {
    skipClaudeLogin: typeof raw?.skipClaudeLogin === "boolean" ? raw.skipClaudeLogin : DEFAULT_CONFIG.terminal.skipClaudeLogin
  };
}
function getAiSourcesSignature(aiSources) {
  if (!aiSources) return "";
  const current = aiSources.current || "custom";
  const currentConfig = aiSources[current];
  if (currentConfig && typeof currentConfig === "object") {
    if ("accessToken" in currentConfig) {
      return [
        "oauth",
        current,
        currentConfig.accessToken || "",
        currentConfig.refreshToken || "",
        currentConfig.tokenExpires || "",
        currentConfig.model || ""
      ].join("|");
    }
    if ("apiKey" in currentConfig) {
      return [
        "custom",
        current,
        currentConfig.provider || "",
        currentConfig.apiUrl || "",
        currentConfig.apiKey || "",
        currentConfig.model || ""
      ].join("|");
    }
  }
  if (current === "custom" || !currentConfig) {
    const custom = aiSources.custom;
    return [
      "custom",
      custom?.provider || "",
      custom?.apiUrl || "",
      custom?.apiKey || "",
      custom?.model || ""
    ].join("|");
  }
  return current;
}
function mergeConfigWithDefaults(parsed) {
  const aiSources = normalizeAiSources(parsed);
  const browserAutomation = normalizeBrowserAutomation(parsed);
  const terminal = normalizeTerminalConfig(parsed);
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    api: { ...DEFAULT_CONFIG.api, ...parsed.api },
    aiSources,
    permissions: { ...DEFAULT_CONFIG.permissions, ...parsed.permissions },
    appearance: { ...DEFAULT_CONFIG.appearance, ...parsed.appearance },
    system: { ...DEFAULT_CONFIG.system, ...parsed.system },
    onboarding: { ...DEFAULT_CONFIG.onboarding, ...parsed.onboarding },
    // mcpServers is a flat map, just use parsed value or default
    mcpServers: parsed.mcpServers || DEFAULT_CONFIG.mcpServers,
    // analytics: keep as-is (managed by analytics.service.ts)
    analytics: parsed.analytics,
    // spaces: merge with defaults
    spaces: { ...DEFAULT_CONFIG.spaces, ...parsed.spaces },
    // memory: merge with defaults
    memory: { ...DEFAULT_CONFIG.memory, ...parsed.memory },
    browserAutomation,
    terminal,
    skillSettings: { ...DEFAULT_CONFIG.skillSettings, ...parsed.skillSettings }
  };
}
function applyConfigUpdates(currentConfig, config) {
  const newConfig = { ...currentConfig, ...config };
  if (config.api) {
    newConfig.api = { ...currentConfig.api, ...config.api };
  }
  if (config.permissions) {
    newConfig.permissions = { ...currentConfig.permissions, ...config.permissions };
  }
  if (config.appearance) {
    newConfig.appearance = { ...currentConfig.appearance, ...config.appearance };
  }
  if (config.system) {
    newConfig.system = { ...currentConfig.system, ...config.system };
  }
  if (config.onboarding) {
    newConfig.onboarding = { ...currentConfig.onboarding, ...config.onboarding };
  }
  if (config.mcpServers !== void 0) {
    newConfig.mcpServers = config.mcpServers;
  }
  if (config.analytics !== void 0) {
    newConfig.analytics = config.analytics;
  }
  if (config.gitBash !== void 0) {
    newConfig.gitBash = config.gitBash;
  }
  if (config.spaces) {
    newConfig.spaces = { ...currentConfig.spaces, ...config.spaces };
  }
  if (config.memory) {
    newConfig.memory = { ...currentConfig.memory, ...config.memory };
  }
  if (config.browserAutomation) {
    newConfig.browserAutomation = { ...currentConfig.browserAutomation, ...config.browserAutomation };
  }
  if (config.terminal) {
    newConfig.terminal = { ...currentConfig.terminal, ...config.terminal };
  }
  if (config.skillSettings) {
    newConfig.skillSettings = { ...currentConfig.skillSettings, ...config.skillSettings };
  }
  return newConfig;
}
function notifyConfigChange(currentConfig, newConfig, updates) {
  const previousAiSourcesSignature = getAiSourcesSignature(currentConfig.aiSources);
  const nextAiSourcesSignature = getAiSourcesSignature(newConfig.aiSources);
  const aiSourcesChanged = previousAiSourcesSignature !== nextAiSourcesSignature;
  if (updates.api || updates.aiSources) {
    const apiChanged = !!updates.api && (updates.api.provider !== currentConfig.api.provider || updates.api.apiKey !== currentConfig.api.apiKey || updates.api.apiUrl !== currentConfig.api.apiUrl);
    if ((apiChanged || aiSourcesChanged) && configEvents.listenerCount(CONFIG_EVENTS.apiConfigChanged) > 0) {
      console.log("[Config] API config changed, notifying subscribers...");
      setTimeout(() => {
        emitConfigEventSafely(CONFIG_EVENTS.apiConfigChanged);
      }, 0);
    }
  }
  if (updates.memory && configEvents.listenerCount(CONFIG_EVENTS.memoryConfigChanged) > 0) {
    const memoryChanged = updates.memory.enabled !== currentConfig.memory?.enabled || updates.memory.retentionDays !== currentConfig.memory?.retentionDays;
    if (memoryChanged) {
      const m = newConfig.memory;
      setTimeout(() => {
        emitConfigEventSafely(CONFIG_EVENTS.memoryConfigChanged, m.enabled, m.retentionDays);
      }, 0);
    }
  }
}
async function initializeApp() {
  const haloDir = getHaloDir();
  const tempDir = getTempSpacePath();
  const spacesDir = getSpacesDir();
  const tempArtifactsDir = require$$1.join(tempDir, "artifacts");
  const tempConversationsDir = require$$1.join(tempDir, "conversations");
  const dirs = [haloDir, tempDir, spacesDir, tempArtifactsDir, tempConversationsDir];
  for (const dir of dirs) {
    if (!fs$l.existsSync(dir)) {
      fs$l.mkdirSync(dir, { recursive: true });
    }
  }
  cleanupTmpFiles(haloDir);
  const configPath = getConfigPath();
  if (!fs$l.existsSync(configPath)) {
    atomicWriteJsonSync(configPath, mergeConfigWithDefaults({}), { backup: true });
  }
  ensureConfigFilePermissions(configPath);
}
function getConfig() {
  const configPath = getConfigPath();
  if (!fs$l.existsSync(configPath)) {
    return mergeConfigWithDefaults({});
  }
  try {
    const parsed = safeReadJsonSync(configPath, null);
    if (!parsed) return mergeConfigWithDefaults({});
    return mergeConfigWithDefaults(parsed);
  } catch (error) {
    console.error("Failed to read config:", error);
    return mergeConfigWithDefaults({});
  }
}
async function getConfigAsync() {
  const configPath = getConfigPath();
  if (!fs$l.existsSync(configPath)) {
    return mergeConfigWithDefaults({});
  }
  try {
    const parsed = await safeReadJson(configPath, null);
    if (!parsed) return mergeConfigWithDefaults({});
    return mergeConfigWithDefaults(parsed);
  } catch (error) {
    console.error("Failed to read config (async):", error);
    return mergeConfigWithDefaults({});
  }
}
function saveConfig(config) {
  const currentConfig = getConfig();
  const newConfig = applyConfigUpdates(currentConfig, config);
  const configPath = getConfigPath();
  atomicWriteJsonSync(configPath, newConfig, { backup: true });
  ensureConfigFilePermissions(configPath);
  notifyConfigChange(currentConfig, newConfig, config);
  return newConfig;
}
async function saveConfigAsync(config) {
  const currentConfig = await getConfigAsync();
  const newConfig = applyConfigUpdates(currentConfig, config);
  const configPath = getConfigPath();
  await atomicWriteJson(configPath, newConfig, { backup: true });
  await ensureConfigFilePermissionsAsync(configPath);
  notifyConfigChange(currentConfig, newConfig, config);
  return newConfig;
}
async function validateApiConnection(apiKey, apiUrl, provider) {
  try {
    const trimSlash = (s) => s.replace(/\/+$/, "");
    const normalizeOpenAIV1Base = (input) => {
      let base2 = trimSlash(input);
      if (base2.endsWith("/chat/completions")) {
        base2 = base2.slice(0, -"/chat/completions".length);
        base2 = trimSlash(base2);
      }
      const v1Idx = base2.indexOf("/v1");
      if (v1Idx >= 0) {
        base2 = base2.slice(0, v1Idx + 3);
        base2 = trimSlash(base2);
        return base2;
      }
      return `${base2}/v1`;
    };
    if (provider === "openai") {
      const baseV1 = normalizeOpenAIV1Base(apiUrl);
      const modelsUrl = `${baseV1}/models`;
      const response2 = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });
      if (response2.ok) {
        const data = await response2.json().catch(() => ({}));
        const modelId = data?.data?.[0]?.id || data?.model || void 0;
        return { valid: true, model: modelId };
      }
      const errorText = await response2.text().catch(() => "");
      return {
        valid: false,
        message: errorText || `HTTP ${response2.status}`
      };
    }
    const base = trimSlash(apiUrl);
    const messagesUrl = `${base}/v1/messages`;
    const response = await fetch(messagesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL$1,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }]
      })
    });
    if (response.ok) {
      const data = await response.json();
      return {
        valid: true,
        model: data.model || DEFAULT_MODEL$1
      };
    } else {
      const error = await response.json().catch(() => ({}));
      return {
        valid: false,
        message: error.error?.message || `HTTP ${response.status}`
      };
    }
  } catch (error) {
    const err = error;
    return {
      valid: false,
      message: err.message || "Connection failed"
    };
  }
}
function setAutoLaunch(enabled) {
  electron.app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
    // Start minimized
    // On macOS, also set to open at login for all users (requires admin)
    // path: process.execPath, // Optional: specify executable path
  });
  saveConfig({ system: { autoLaunch: enabled, minimizeToTray: getConfig().system.minimizeToTray } });
  console.log(`[Config] Auto launch set to: ${enabled}`);
}
function getAutoLaunch() {
  const settings = electron.app.getLoginItemSettings();
  return settings.openAtLogin;
}
function setMinimizeToTray(enabled) {
  saveConfig({ system: { autoLaunch: getConfig().system.autoLaunch, minimizeToTray: enabled } });
  console.log(`[Config] Minimize to tray set to: ${enabled}`);
}
function getMinimizeToTray() {
  return getConfig().system.minimizeToTray;
}
const AVAILABLE_MODELS = [
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    description: "Most powerful model, great for complex reasoning and architecture decisions"
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    description: "Balanced performance and cost, suitable for most tasks"
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    description: "Fast and lightweight, ideal for simple tasks"
  }
];
const ANTHROPIC_API_URL = "https://api.anthropic.com";
class CustomAISourceProvider {
  constructor() {
    this.type = "custom";
    this.displayName = "Custom API";
  }
  /**
   * Check if custom API is configured
   */
  isConfigured(config) {
    return !!config.custom?.apiKey;
  }
  /**
   * Get backend request configuration
   */
  getBackendConfig(config) {
    const customConfig = config.custom;
    if (!customConfig?.apiKey) {
      return null;
    }
    const isAnthropic = customConfig.provider === "anthropic";
    const baseUrl = customConfig.apiUrl || ANTHROPIC_API_URL;
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    return {
      url: cleanBaseUrl,
      key: customConfig.apiKey,
      model: customConfig.model,
      // For OpenAI compatible, infer API type from URL
      apiType: isAnthropic ? void 0 : this.inferApiTypeFromUrl(cleanBaseUrl)
    };
  }
  /**
   * Infer API type from URL
   */
  inferApiTypeFromUrl(url2) {
    if (url2.includes("/responses")) return "responses";
    return "chat_completions";
  }
  /**
   * Get current model ID
   */
  getCurrentModel(config) {
    return config.custom?.model || null;
  }
  /**
   * Get available models - returns static list for custom API
   */
  async getAvailableModels(config) {
    const customConfig = config.custom;
    if (!customConfig) {
      return [];
    }
    if (customConfig.provider === "anthropic") {
      return AVAILABLE_MODELS.map((m) => m.id);
    }
    return [];
  }
  /**
   * No refresh needed for custom API
   */
  async refreshConfig(_config) {
    return { success: true, data: {} };
  }
}
let instance = null;
function getCustomProvider() {
  if (!instance) {
    instance = new CustomAISourceProvider();
  }
  return instance;
}
const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const COPILOT_API_URL = "https://api.githubcopilot.com";
const COPILOT_MODELS_URL = "https://api.githubcopilot.com/models";
const GITHUB_SCOPES = "read:user";
const POLL_TIMEOUT_MS = 3e5;
const TOKEN_REFRESH_THRESHOLD_MS$1 = 5 * 60 * 1e3;
let pendingAuth$1 = null;
let cachedCopilotToken = null;
class GitHubCopilotProvider {
  constructor() {
    this.type = "github-copilot";
    this.displayName = "GitHub Copilot";
  }
  /**
   * Check if GitHub Copilot is configured
   */
  isConfigured(config) {
    const copilotConfig = config["github-copilot"];
    return !!(copilotConfig?.loggedIn && copilotConfig?.accessToken);
  }
  /**
   * Get backend configuration for API calls
   */
  getBackendConfig(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.loggedIn || !copilotConfig?.accessToken) {
      return null;
    }
    const apiToken = cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now() ? cachedCopilotToken.token : copilotConfig.accessToken;
    const apiBase = cachedCopilotToken?.apiEndpoint || COPILOT_API_URL;
    if (!cachedCopilotToken || cachedCopilotToken.expiresAt <= Date.now()) {
      console.warn("[GitHubCopilot] No valid cached Copilot token, API call may fail");
    }
    console.log("[GitHubCopilot] Using API endpoint:", apiBase);
    return {
      url: `${apiBase}/chat/completions`,
      key: apiToken,
      model: copilotConfig.model || "gpt-4o",
      headers: {
        "Editor-Version": "vscode/1.85.0",
        "Editor-Plugin-Version": "copilot/1.0.0",
        "Copilot-Integration-Id": "vscode-chat",
        "Openai-Intent": "conversation-panel"
      },
      apiType: "chat_completions"
    };
  }
  /**
   * Get current model
   */
  getCurrentModel(config) {
    const copilotConfig = config["github-copilot"];
    return copilotConfig?.model || null;
  }
  /**
   * Get available models from Copilot API
   */
  async getAvailableModels(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.accessToken) {
      return this.getDefaultModels();
    }
    try {
      const copilotToken = await this.getCopilotToken(copilotConfig.accessToken);
      if (!copilotToken) {
        return copilotConfig.availableModels || this.getDefaultModels();
      }
      const response = await fetch(COPILOT_MODELS_URL, {
        headers: {
          "Authorization": `Bearer ${copilotToken}`,
          "Editor-Version": "vscode/1.85.0",
          "Editor-Plugin-Version": "copilot/1.0.0"
        }
      });
      if (!response.ok) {
        console.warn("[GitHubCopilot] Failed to fetch models:", response.status);
        return copilotConfig.availableModels || this.getDefaultModels();
      }
      const data = await response.json();
      const models = data.models || data.data || [];
      if (!Array.isArray(models) || models.length === 0) {
        console.warn("[GitHubCopilot] No models in response, using cached or defaults");
        return copilotConfig.availableModels || this.getDefaultModels();
      }
      return models.map((m) => m.id);
    } catch (error) {
      console.error("[GitHubCopilot] Error fetching models:", error);
      return copilotConfig.availableModels || this.getDefaultModels();
    }
  }
  /**
   * Default models when API is unavailable
   * These are common Copilot models as fallback - real models come from API
   */
  getDefaultModels() {
    return [];
  }
  /**
   * Get user info from config
   */
  getUserInfo(config) {
    const copilotConfig = config["github-copilot"];
    return copilotConfig?.user || null;
  }
  // ========== OAuth Flow ==========
  /**
   * Start OAuth login flow
   */
  async startLogin() {
    try {
      console.log("[GitHubCopilot] Starting device code flow");
      const response = await fetch(GITHUB_DEVICE_CODE_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          scope: GITHUB_SCOPES
        })
      });
      if (!response.ok) {
        throw new Error(`Failed to request device code: ${response.status}`);
      }
      const data = await response.json();
      pendingAuth$1 = {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresAt: Date.now() + data.expires_in * 1e3,
        interval: Math.max(data.interval, 5)
        // At least 5 seconds
      };
      const loginUrl = `${data.verification_uri}?user_code=${data.user_code}`;
      await electron.shell.openExternal(loginUrl);
      console.log("[GitHubCopilot] Device code flow started, user code:", data.user_code);
      return {
        success: true,
        data: {
          loginUrl,
          state: data.user_code,
          userCode: data.user_code,
          verificationUri: data.verification_uri
        }
      };
    } catch (error) {
      console.error("[GitHubCopilot] Start login error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start login"
      };
    }
  }
  /**
   * Complete OAuth login by polling for token
   */
  async completeLogin(state2) {
    if (!pendingAuth$1 || pendingAuth$1.userCode !== state2) {
      return {
        success: false,
        error: "No pending authentication or state mismatch"
      };
    }
    try {
      console.log("[GitHubCopilot] Polling for authorization...");
      const startTime = Date.now();
      while (Date.now() - startTime < POLL_TIMEOUT_MS) {
        if (Date.now() > pendingAuth$1.expiresAt) {
          pendingAuth$1 = null;
          return {
            success: false,
            error: "Device code expired"
          };
        }
        const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            device_code: pendingAuth$1.deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code"
          })
        });
        const data = await response.json();
        if (data.access_token) {
          const githubToken = data.access_token;
          pendingAuth$1 = null;
          console.log("[GitHubCopilot] Got GitHub token, fetching user info...");
          const user = await this.fetchGitHubUser(githubToken);
          const copilotToken = await this.getCopilotToken(githubToken);
          if (!copilotToken) {
            return {
              success: false,
              error: "Could not get Copilot token. Make sure you have an active Copilot subscription."
            };
          }
          const models = await this.fetchModelsWithToken(copilotToken);
          console.log("[GitHubCopilot] Login successful for user:", user?.login);
          const result = {
            success: true,
            user: {
              name: user?.name || user?.login || "GitHub User",
              avatar: user?.avatar_url,
              uid: user?.login || ""
            },
            _tokenData: {
              accessToken: githubToken,
              refreshToken: githubToken,
              // GitHub tokens don't have refresh tokens in device flow
              expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1e3,
              // GitHub tokens don't expire
              uid: user?.login || ""
            },
            _availableModels: models,
            _modelNames: this.getModelDisplayNames(models),
            _defaultModel: models.includes("gpt-4o") ? "gpt-4o" : models[0] || "gpt-4o"
          };
          return { success: true, data: result };
        }
        if (data.error === "authorization_pending") {
          await new Promise((resolve) => setTimeout(resolve, pendingAuth$1.interval * 1e3));
          continue;
        }
        if (data.error === "slow_down") {
          pendingAuth$1.interval += 5;
          await new Promise((resolve) => setTimeout(resolve, pendingAuth$1.interval * 1e3));
          continue;
        }
        if (data.error === "expired_token") {
          pendingAuth$1 = null;
          return {
            success: false,
            error: "Device code expired. Please try again."
          };
        }
        if (data.error === "access_denied") {
          pendingAuth$1 = null;
          return {
            success: false,
            error: "Access denied. User cancelled the authorization."
          };
        }
        pendingAuth$1 = null;
        return {
          success: false,
          error: data.error_description || data.error || "Unknown error"
        };
      }
      pendingAuth$1 = null;
      return {
        success: false,
        error: "Timeout waiting for authorization"
      };
    } catch (error) {
      console.error("[GitHubCopilot] Complete login error:", error);
      pendingAuth$1 = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete login"
      };
    }
  }
  /**
   * Refresh token (GitHub tokens don't expire, but Copilot tokens do)
   */
  async refreshToken() {
    return { success: true };
  }
  /**
   * Check if token is valid
   */
  async checkToken() {
    return { success: true, data: { valid: true } };
  }
  /**
   * Logout
   */
  async logout() {
    cachedCopilotToken = null;
    pendingAuth$1 = null;
    return { success: true };
  }
  // ========== Token Management ==========
  /**
   * Ensure Copilot token is cached (call this before getBackendConfig)
   * This is async and should be called from ensureValidToken
   */
  async ensureCopilotTokenCached(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.accessToken) {
      return false;
    }
    if (cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now() + TOKEN_REFRESH_THRESHOLD_MS$1) {
      return true;
    }
    const copilotToken = await this.getCopilotToken(copilotConfig.accessToken);
    return !!copilotToken;
  }
  /**
   * Check token validity with config (called by manager)
   */
  checkTokenWithConfig(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.accessToken) {
      return { valid: false, needsRefresh: false };
    }
    const needsRefresh = !cachedCopilotToken || cachedCopilotToken.expiresAt <= Date.now() + TOKEN_REFRESH_THRESHOLD_MS$1;
    return { valid: true, needsRefresh };
  }
  /**
   * Refresh token with config (if needed)
   * This is called by the manager when checkTokenWithConfig returns needsRefresh: true
   */
  async refreshTokenWithConfig(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.accessToken) {
      return { success: false, error: "No token to refresh" };
    }
    const success = await this.ensureCopilotTokenCached(config);
    if (!success) {
      return { success: false, error: "Failed to refresh Copilot token" };
    }
    return {
      success: true,
      data: {
        accessToken: copilotConfig.accessToken,
        refreshToken: copilotConfig.refreshToken || copilotConfig.accessToken,
        expiresAt: copilotConfig.tokenExpires || Date.now() + 365 * 24 * 60 * 60 * 1e3
      }
    };
  }
  /**
   * Refresh config (fetch updated models)
   */
  async refreshConfig(config) {
    const copilotConfig = config["github-copilot"];
    if (!copilotConfig?.accessToken) {
      return { success: false, error: "Not logged in" };
    }
    try {
      const models = await this.getAvailableModels(config);
      return {
        success: true,
        data: {
          "github-copilot": {
            ...copilotConfig,
            availableModels: models,
            modelNames: this.getModelDisplayNames(models)
          }
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  // ========== Helper Methods ==========
  /**
   * Fetch GitHub user info
   */
  async fetchGitHubUser(token) {
    try {
      const response = await fetch(GITHUB_USER_URL, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      });
      if (!response.ok) {
        console.warn("[GitHubCopilot] Failed to fetch user:", response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[GitHubCopilot] Error fetching user:", error);
      return null;
    }
  }
  /**
   * Get Copilot token from GitHub token
   * Copilot tokens are short-lived (~30 minutes) and need to be refreshed
   */
  async getCopilotToken(githubToken) {
    if (cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now() + TOKEN_REFRESH_THRESHOLD_MS$1) {
      return cachedCopilotToken.token;
    }
    try {
      const response = await fetch(COPILOT_TOKEN_URL, {
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/json",
          "Editor-Version": "vscode/1.85.0",
          "Editor-Plugin-Version": "copilot/1.0.0"
        }
      });
      if (!response.ok) {
        console.warn("[GitHubCopilot] Failed to get Copilot token:", response.status);
        return null;
      }
      const data = await response.json();
      if (data.error_details) {
        console.warn("[GitHubCopilot] Copilot token error:", data.error_details.message);
        return null;
      }
      console.log("[GitHubCopilot] Copilot token received, API endpoint:", data.endpoints?.api);
      cachedCopilotToken = {
        token: data.token,
        expiresAt: data.expires_at * 1e3,
        // Convert to milliseconds
        apiEndpoint: data.endpoints?.api
      };
      return data.token;
    } catch (error) {
      console.error("[GitHubCopilot] Error getting Copilot token:", error);
      return null;
    }
  }
  /**
   * Fetch models with Copilot token
   */
  async fetchModelsWithToken(copilotToken) {
    try {
      console.log("[GitHubCopilot] Fetching models from:", COPILOT_MODELS_URL);
      const response = await fetch(COPILOT_MODELS_URL, {
        headers: {
          "Authorization": `Bearer ${copilotToken}`,
          "Editor-Version": "vscode/1.85.0",
          "Editor-Plugin-Version": "copilot/1.0.0"
        }
      });
      if (!response.ok) {
        console.warn("[GitHubCopilot] Failed to fetch models:", response.status, response.statusText);
        const text = await response.text();
        console.warn("[GitHubCopilot] Response body:", text);
        return this.getDefaultModels();
      }
      const data = await response.json();
      console.log("[GitHubCopilot] Models API response keys:", Object.keys(data));
      const models = data.models || data.data || [];
      if (!Array.isArray(models) || models.length === 0) {
        console.warn("[GitHubCopilot] No models array in response, using defaults");
        return this.getDefaultModels();
      }
      const chatModels = models.filter(
        (m) => m.capabilities?.type === "chat" || !m.capabilities?.type
      );
      const modelIds = chatModels.map((m) => m.id);
      console.log("[GitHubCopilot] Fetched models:", modelIds);
      return modelIds.length > 0 ? modelIds : this.getDefaultModels();
    } catch (error) {
      console.error("[GitHubCopilot] Error fetching models:", error);
      return this.getDefaultModels();
    }
  }
  /**
   * Get model display names
   */
  getModelDisplayNames(models) {
    const displayNames = {
      "gpt-4o": "GPT-4o",
      "gpt-4o-mini": "GPT-4o Mini",
      "gpt-4-turbo": "GPT-4 Turbo",
      "gpt-4": "GPT-4",
      "gpt-3.5-turbo": "GPT-3.5 Turbo",
      "claude-3.5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-sonnet": "Claude 3 Sonnet",
      "claude-3-haiku": "Claude 3 Haiku",
      "o1-preview": "o1 Preview",
      "o1-mini": "o1 Mini",
      "o1": "o1"
    };
    const result = {};
    for (const model of models) {
      result[model] = displayNames[model] || model;
    }
    return result;
  }
}
let providerInstance$1 = null;
function getGitHubCopilotProvider() {
  if (!providerInstance$1) {
    providerInstance$1 = new GitHubCopilotProvider();
  }
  return providerInstance$1;
}
function base64URLEncode(buffer2) {
  return buffer2.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}
function generateCodeChallenge(verifier) {
  return base64URLEncode(crypto.createHash("sha256").update(verifier).digest());
}
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_ISSUER = "https://auth.openai.com";
const OPENAI_AUTHORIZE_URL = `${OPENAI_ISSUER}/oauth/authorize`;
const OPENAI_TOKEN_URL = `${OPENAI_ISSUER}/oauth/token`;
const CALLBACK_PORT = 1455;
const OPENAI_REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`;
const OPENAI_SCOPES = "openid profile email offline_access";
const OPENAI_API_BASE = "https://api.openai.com/v1";
const OPENAI_MODELS_URL = `${OPENAI_API_BASE}/models`;
const CHATGPT_API_BASE = "https://chatgpt.com/backend-api/codex";
const CHATGPT_CODEX_MODELS = [
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-5.1-codex-mini"
];
const OPENAI_API_CODEX_MODELS = [
  ...CHATGPT_CODEX_MODELS,
  "gpt-5.1-codex",
  "gpt-5.1",
  "gpt-5-codex",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano"
];
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1e3;
const AUTH_TIMEOUT_MS = 5 * 60 * 1e3;
const MAX_BIND_ATTEMPTS = 10;
const BIND_RETRY_DELAY_MS = 200;
let pendingAuth = null;
class OpenAICodexProvider {
  constructor() {
    this.type = "openai-codex";
    this.displayName = "OpenAI";
  }
  /**
   * Check if OpenAI Codex is configured
   */
  isConfigured(config) {
    const providerConfig = config["openai-codex"];
    return !!(providerConfig?.loggedIn && providerConfig?.accessToken);
  }
  /**
   * Get backend configuration for API calls
   */
  getBackendConfig(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.loggedIn || !providerConfig?.accessToken) {
      return null;
    }
    const token = providerConfig.accessToken;
    const isApiKey = token.startsWith("sk-");
    const model = this.resolveModelForToken(token, providerConfig.model, providerConfig.availableModels);
    if (isApiKey) {
      return {
        url: `${OPENAI_API_BASE}/responses`,
        key: token,
        model,
        apiType: "responses"
      };
    } else {
      return {
        url: `${CHATGPT_API_BASE}/responses`,
        key: token,
        model,
        apiType: "responses",
        headers: {
          "ChatGPT-Account-ID": providerConfig.chatgptAccountId || ""
        }
      };
    }
  }
  /**
   * Get current model
   */
  getCurrentModel(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.accessToken) {
      return providerConfig?.model || null;
    }
    return this.resolveModelForToken(
      providerConfig.accessToken,
      providerConfig.model,
      providerConfig.availableModels
    );
  }
  /**
   * Get available models from OpenAI API
   */
  async getAvailableModels(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.accessToken) {
      return this.getChatGPTDefaultModels();
    }
    const isApiKey = providerConfig.accessToken.startsWith("sk-");
    if (!isApiKey) {
      return this.normalizeAvailableModels(providerConfig.availableModels, false);
    }
    try {
      const response = await fetch(OPENAI_MODELS_URL, {
        headers: {
          "Authorization": `Bearer ${providerConfig.accessToken}`
        }
      });
      if (!response.ok) {
        console.warn("[OpenAICodex] Failed to fetch models:", response.status);
        return this.normalizeAvailableModels(providerConfig.availableModels, true);
      }
      const data = await response.json();
      const models = data.data || [];
      if (!Array.isArray(models) || models.length === 0) {
        return this.normalizeAvailableModels(providerConfig.availableModels, true);
      }
      const chatModels = models.map((m) => m.id).filter(
        (id) => !id.includes("embedding") && !id.includes("whisper") && !id.includes("tts") && !id.includes("dall-e") && !id.includes("moderation")
      );
      return this.normalizeAvailableModels(chatModels, true);
    } catch (error) {
      console.error("[OpenAICodex] Error fetching models:", error);
      return this.normalizeAvailableModels(providerConfig.availableModels, true);
    }
  }
  /**
   * Default models for API-key based OpenAI usage
   */
  getApiKeyDefaultModels() {
    return [...OPENAI_API_CODEX_MODELS];
  }
  /**
   * Default models for ChatGPT-backed Codex usage
   */
  getChatGPTDefaultModels() {
    return [...CHATGPT_CODEX_MODELS];
  }
  /**
   * ChatGPT-backed Codex only accepts a narrower model set than the standard API.
   */
  resolveModelForToken(token, configuredModel, availableModels) {
    const supportedModels = this.normalizeAvailableModels(availableModels, token.startsWith("sk-"));
    if (configuredModel && supportedModels.includes(configuredModel)) {
      return configuredModel;
    }
    return supportedModels[0];
  }
  normalizeAvailableModels(models, isApiKey) {
    const preferredModels = isApiKey ? this.getApiKeyDefaultModels() : this.getChatGPTDefaultModels();
    const seen = /* @__PURE__ */ new Set();
    const requestedModels = Array.isArray(models) ? models : [];
    const result = preferredModels.filter((modelId) => {
      if (!requestedModels.includes(modelId) || seen.has(modelId)) {
        return false;
      }
      seen.add(modelId);
      return true;
    });
    if (isApiKey) {
      for (const modelId of requestedModels) {
        if (!modelId.startsWith("gpt-5") || seen.has(modelId)) {
          continue;
        }
        seen.add(modelId);
        result.push(modelId);
      }
    }
    if (result.length > 0) {
      return result;
    }
    return [...preferredModels];
  }
  /**
   * Get user info from config
   */
  getUserInfo(config) {
    const providerConfig = config["openai-codex"];
    return providerConfig?.user || null;
  }
  // ========== OAuth Flow ==========
  /**
   * Start OAuth login flow
   */
  async startLogin() {
    try {
      console.log("[OpenAICodex] Starting OAuth PKCE flow");
      this.cleanupPendingAuth();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state2 = crypto.randomBytes(32).toString("base64url");
      const server2 = await this.startCallbackServer();
      let resolveCallback;
      let rejectCallback;
      const callbackPromise = new Promise((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
      });
      const timeoutTimer = setTimeout(() => {
        console.warn("[OpenAICodex] Auth timeout, cleaning up");
        rejectCallback?.(new Error("Authentication timed out"));
        this.cleanupPendingAuth();
      }, AUTH_TIMEOUT_MS);
      pendingAuth = {
        state: state2,
        codeVerifier,
        server: server2,
        callbackPromise,
        resolveCallback,
        rejectCallback,
        timeoutTimer
      };
      server2.on("request", (req, res) => {
        if (!req.url?.startsWith("/auth/callback")) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }
        const url2 = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const code = url2.searchParams.get("code");
        const callbackState = url2.searchParams.get("state");
        const error = url2.searchParams.get("error");
        const errorDescription = url2.searchParams.get("error_description");
        if (error) {
          const message = errorDescription || error;
          console.error("[OpenAICodex] OAuth callback error:", message);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(buildCallbackPage("error", "loginFailed", "", message));
          pendingAuth?.rejectCallback?.(new Error(message));
          return;
        }
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(buildCallbackPage("error", "error", "missingCode"));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildCallbackPage("success", "loginSuccess", "successMessage"));
        pendingAuth?.resolveCallback?.({ code, state: callbackState || "" });
      });
      const authUrl = this.buildAuthorizeUrl(codeChallenge, state2);
      await electron.shell.openExternal(authUrl);
      console.log("[OpenAICodex] OAuth flow started, waiting for callback");
      return {
        success: true,
        data: {
          loginUrl: authUrl,
          state: state2
        }
      };
    } catch (error) {
      console.error("[OpenAICodex] Start login error:", error);
      this.cleanupPendingAuth();
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start login"
      };
    }
  }
  /**
   * Complete OAuth login by waiting for callback
   */
  async completeLogin(state2) {
    if (!pendingAuth || pendingAuth.state !== state2) {
      return {
        success: false,
        error: "No pending authentication or state mismatch"
      };
    }
    try {
      console.log("[OpenAICodex] Waiting for OAuth callback...");
      const { code, state: callbackState } = await pendingAuth.callbackPromise;
      if (callbackState !== pendingAuth.state) {
        this.cleanupPendingAuth();
        return {
          success: false,
          error: "State mismatch - possible CSRF attack"
        };
      }
      const codeVerifier = pendingAuth.codeVerifier;
      this.cleanupPendingAuth();
      console.log("[OpenAICodex] Got authorization code, exchanging for tokens...");
      const tokens = await this.exchangeCodeForTokens(code, codeVerifier);
      console.log("[OpenAICodex] Got tokens, exchanging for API key...");
      let apiKey = null;
      try {
        apiKey = await this.obtainApiKey(tokens.id_token);
        console.log("[OpenAICodex] Got API key via token exchange");
      } catch (err) {
        console.warn("[OpenAICodex] API key exchange failed, using access_token fallback:", err);
      }
      const bearerToken = apiKey || tokens.access_token;
      const isApiKey = bearerToken.startsWith("sk-");
      const userInfo = this.parseIdToken(tokens.id_token);
      const authClaims = this.parseIdTokenAuthClaims(tokens.id_token);
      const chatgptAccountId = authClaims.chatgpt_account_id || "";
      let models = isApiKey ? this.getApiKeyDefaultModels() : this.getChatGPTDefaultModels();
      if (isApiKey) {
        try {
          const modelsResponse = await fetch(OPENAI_MODELS_URL, {
            headers: { "Authorization": `Bearer ${bearerToken}` }
          });
          if (modelsResponse.ok) {
            const data = await modelsResponse.json();
            const allModels = (data.data || []).map((m) => m.id).filter(
              (id) => !id.includes("embedding") && !id.includes("whisper") && !id.includes("tts") && !id.includes("dall-e") && !id.includes("moderation")
            );
            models = this.normalizeAvailableModels(allModels, true);
          }
        } catch {
        }
      }
      const defaultModel = models[0] || (isApiKey ? this.getApiKeyDefaultModels()[0] : this.getChatGPTDefaultModels()[0]);
      console.log("[OpenAICodex] Login successful for:", userInfo.email || "unknown");
      const result = {
        success: true,
        user: {
          name: userInfo.email || "OpenAI User",
          uid: userInfo.email || ""
        },
        _tokenData: {
          accessToken: bearerToken,
          refreshToken: tokens.refresh_token,
          expiresAt: userInfo.exp ? userInfo.exp * 1e3 : Date.now() + 60 * 60 * 1e3,
          // Default 1 hour
          uid: userInfo.email || ""
        },
        _availableModels: models,
        _modelNames: this.getModelDisplayNames(models),
        _defaultModel: defaultModel,
        _chatgptAccountId: chatgptAccountId
      };
      return { success: true, data: result };
    } catch (error) {
      console.error("[OpenAICodex] Complete login error:", error);
      this.cleanupPendingAuth();
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete login"
      };
    }
  }
  /**
   * Refresh token
   */
  async refreshToken() {
    return { success: true };
  }
  /**
   * Check if token is valid
   */
  async checkToken() {
    return { success: true, data: { valid: true } };
  }
  /**
   * Logout
   */
  async logout() {
    this.cleanupPendingAuth();
    return { success: true };
  }
  // ========== Token Management ==========
  /**
   * Check token validity with config
   */
  checkTokenWithConfig(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.accessToken) {
      return { valid: false, needsRefresh: false };
    }
    const tokenExpires = providerConfig.tokenExpires || 0;
    const now = Date.now();
    const needsRefresh = tokenExpires > 0 && tokenExpires <= now + TOKEN_REFRESH_THRESHOLD_MS;
    return { valid: true, needsRefresh };
  }
  /**
   * Refresh token with config
   * Full chain: refresh_token → new tokens → token exchange → new api_key
   */
  async refreshTokenWithConfig(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.refreshToken) {
      return { success: false, error: "No refresh token" };
    }
    try {
      console.log("[OpenAICodex] Refreshing token...");
      const response = await fetch(OPENAI_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: providerConfig.refreshToken,
          client_id: OPENAI_CLIENT_ID
        })
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("[OpenAICodex] Token refresh failed:", response.status, body);
        return { success: false, error: `Token refresh failed: ${response.status}` };
      }
      const tokens = await response.json();
      let apiKey = null;
      try {
        apiKey = await this.obtainApiKey(tokens.id_token);
      } catch (err) {
        console.warn("[OpenAICodex] Token refresh: API key exchange failed, using access_token:", err);
      }
      const bearerToken = apiKey || tokens.access_token;
      const tokenInfo = this.parseIdToken(tokens.id_token);
      const expiresAt = tokenInfo.exp ? tokenInfo.exp * 1e3 : Date.now() + 60 * 60 * 1e3;
      const authClaims = this.parseIdTokenAuthClaims(tokens.id_token);
      const chatgptAccountId = authClaims.chatgpt_account_id || "";
      console.log("[OpenAICodex] Token refresh successful");
      return {
        success: true,
        data: {
          accessToken: bearerToken,
          refreshToken: tokens.refresh_token,
          expiresAt,
          chatgptAccountId
        }
      };
    } catch (error) {
      console.error("[OpenAICodex] Token refresh error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Token refresh failed"
      };
    }
  }
  /**
   * Refresh config (fetch updated models)
   */
  async refreshConfig(config) {
    const providerConfig = config["openai-codex"];
    if (!providerConfig?.accessToken) {
      return { success: false, error: "Not logged in" };
    }
    try {
      const models = await this.getAvailableModels(config);
      const model = this.resolveModelForToken(providerConfig.accessToken, providerConfig.model);
      return {
        success: true,
        data: {
          "openai-codex": {
            ...providerConfig,
            model,
            availableModels: models,
            modelNames: this.getModelDisplayNames(models)
          }
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  // ========== Helper Methods ==========
  /**
   * Build OAuth authorize URL
   */
  buildAuthorizeUrl(codeChallenge, state2) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: OPENAI_CLIENT_ID,
      redirect_uri: OPENAI_REDIRECT_URI,
      scope: OPENAI_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      state: state2
    });
    return `${OPENAI_AUTHORIZE_URL}?${params.toString()}`;
  }
  /**
   * Start the localhost callback server
   * Handles port conflicts by attempting to cancel previous servers
   */
  async startCallbackServer() {
    let cancelAttempted = false;
    let attempts = 0;
    while (attempts < MAX_BIND_ATTEMPTS) {
      try {
        return await new Promise((resolve, reject) => {
          const server2 = http.createServer();
          server2.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
              reject(err);
            } else {
              reject(new Error(`Failed to start callback server: ${err.message}`));
            }
          });
          server2.listen(CALLBACK_PORT, "127.0.0.1", () => {
            resolve(server2);
          });
        });
      } catch (err) {
        attempts++;
        if (err.code === "EADDRINUSE") {
          if (!cancelAttempted) {
            cancelAttempted = true;
            try {
              await this.sendCancelRequest();
            } catch {
            }
          }
          if (attempts >= MAX_BIND_ATTEMPTS) {
            throw new Error(`Port ${CALLBACK_PORT} is already in use. Close any other application using this port and try again.`);
          }
          await new Promise((resolve) => setTimeout(resolve, BIND_RETRY_DELAY_MS));
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Failed to start callback server after ${MAX_BIND_ATTEMPTS} attempts`);
  }
  /**
   * Send cancel request to a potentially running previous login server
   */
  sendCancelRequest() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port: CALLBACK_PORT,
        path: "/cancel",
        method: "GET",
        timeout: 2e3
      }, () => resolve());
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Cancel request timed out"));
      });
      req.end();
    });
  }
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, codeVerifier) {
    const response = await fetch(OPENAI_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: OPENAI_REDIRECT_URI,
        client_id: OPENAI_CLIENT_ID,
        code_verifier: codeVerifier
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }
    return await response.json();
  }
  /**
   * Exchange id_token for an OpenAI API key
   * Uses OAuth 2.0 Token Exchange (RFC 8693)
   */
  async obtainApiKey(idToken) {
    const response = await fetch(OPENAI_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        client_id: OPENAI_CLIENT_ID,
        requested_token: "openai-api-key",
        subject_token: idToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token"
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API key exchange failed (${response.status}): ${body}`);
    }
    const data = await response.json();
    return data.access_token;
  }
  /**
   * Parse JWT id_token to extract auth claims from 'https://api.openai.com/auth'
   * (Same as Codex CLI's jwt_auth_claims in server.rs)
   */
  parseIdTokenAuthClaims(idToken) {
    try {
      const parts = idToken.split(".");
      if (parts.length < 2) return {};
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return payload["https://api.openai.com/auth"] || {};
    } catch {
      return {};
    }
  }
  /**
   * Parse JWT id_token to extract user info
   */
  parseIdToken(idToken) {
    try {
      const parts = idToken.split(".");
      if (parts.length < 2) return {};
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const authClaims = payload["https://api.openai.com/auth"] || {};
      return {
        email: payload.email || authClaims.email,
        exp: payload.exp,
        planType: authClaims.chatgpt_plan_type
      };
    } catch {
      return {};
    }
  }
  /**
   * Clean up pending auth state
   */
  cleanupPendingAuth() {
    if (pendingAuth) {
      clearTimeout(pendingAuth.timeoutTimer);
      try {
        pendingAuth.server.close();
      } catch {
      }
      pendingAuth = null;
    }
  }
  /**
   * Get model display names
   */
  getModelDisplayNames(models) {
    const displayNames = {
      "gpt-5.4": "GPT-5.4",
      "gpt-5.3-codex": "GPT-5.3-Codex",
      "gpt-5.2-codex": "GPT-5.2-Codex",
      "gpt-5.2": "GPT-5.2",
      "gpt-5.1-codex-max": "GPT-5.1-Codex-Max",
      "gpt-5.1-codex-mini": "GPT-5.1-Codex-Mini",
      "gpt-5.1-codex": "GPT-5.1-Codex",
      "gpt-5.1": "GPT-5.1",
      "gpt-5-codex": "GPT-5-Codex",
      "gpt-5": "GPT-5",
      "gpt-5-mini": "GPT-5-Mini",
      "gpt-5-nano": "GPT-5-Nano",
      "codex-mini-latest": "Codex Mini"
    };
    const result = {};
    for (const model of models) {
      result[model] = displayNames[model] || model;
    }
    return result;
  }
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const callbackPageI18n = {
  en: {
    loginSuccess: "Login Successful!",
    loginFailed: "Login Failed",
    error: "Error",
    successMessage: "You can close this window and return to SkillsFan.",
    missingCode: "Missing authorization code.",
    closeNow: "You can close this window now.",
    closeIn: "This window will close in {s}s..."
  },
  "zh-CN": {
    loginSuccess: "登录成功！",
    loginFailed: "登录失败",
    error: "错误",
    successMessage: "您可以关闭此窗口并返回 SkillsFan。",
    missingCode: "缺少授权码。",
    closeNow: "您现在可以关闭此窗口。",
    closeIn: "此窗口将在 {s} 秒后关闭..."
  },
  "zh-TW": {
    loginSuccess: "登入成功！",
    loginFailed: "登入失敗",
    error: "錯誤",
    successMessage: "您可以關閉此視窗並返回 SkillsFan。",
    missingCode: "缺少授權碼。",
    closeNow: "您現在可以關閉此視窗。",
    closeIn: "此視窗將在 {s} 秒後關閉..."
  }
};
function getCallbackLocale() {
  const locale = electron.app.getLocale().toLowerCase();
  if (locale.startsWith("zh")) {
    return locale.includes("tw") || locale.includes("hk") || locale.includes("hant") ? "zh-TW" : "zh-CN";
  }
  return "en";
}
function buildCallbackPage(type, titleKey, messageKey, rawMessage) {
  const locale = getCallbackLocale();
  const t = callbackPageI18n[locale] || callbackPageI18n.en;
  const title = t[titleKey] || titleKey;
  const message = rawMessage || t[messageKey] || messageKey;
  const closeNow = t.closeNow;
  const closeIn = t.closeIn;
  const icon = type === "success" ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>' : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px;text-align:center;max-width:400px;width:90%}
.icon{margin-bottom:20px}
h2{font-size:22px;font-weight:600;color:#111827;margin-bottom:8px}
p{font-size:14px;color:#6b7280;line-height:1.5}
.countdown{margin-top:16px;font-size:12px;color:#9ca3af}
</style></head><body>
<div class="card">
<div class="icon">${icon}</div>
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(message)}</p>
<p class="countdown" id="cd"></p>
</div>
<script>
let s=3;const el=document.getElementById('cd');
const closeNow=${JSON.stringify(closeNow)};
const closeIn=${JSON.stringify(closeIn)};
function tick(){if(s<=0){window.close();el.textContent=closeNow;return}
el.textContent=closeIn.replace('{s}',s);s--;setTimeout(tick,1000)}
tick();
<\/script></body></html>`;
}
let providerInstance = null;
function getOpenAICodexProvider() {
  if (!providerInstance) {
    providerInstance = new OpenAICodexProvider();
  }
  return providerInstance;
}
let productConfig = null;
let productConfigPath = null;
function normalizeProductFeatures(features) {
  return {
    skillsfanHostedAiEnabled: features?.skillsfanHostedAiEnabled !== false
  };
}
function isProviderEnabledByProductFeatures(_providerType, _features) {
  return true;
}
function getProductConfigPath() {
  if (productConfigPath) return productConfigPath;
  const isDev = electron.app.isPackaged !== true;
  const appPath = typeof electron.app.getAppPath === "function" ? electron.app.getAppPath() : process.cwd();
  if (isDev) {
    productConfigPath = require$$1.join(appPath, "product.json");
  } else {
    productConfigPath = require$$1.join(appPath, "product.json");
  }
  return productConfigPath;
}
function loadProductConfig() {
  if (productConfig) return productConfig;
  const configPath = getProductConfigPath();
  try {
    if (fs$l.existsSync(configPath)) {
      const content = fs$l.readFileSync(configPath, "utf-8");
      productConfig = JSON.parse(content);
      productConfig.features = normalizeProductFeatures(productConfig.features);
      console.log("[AuthLoader] Loaded product.json from:", configPath);
      console.log("[AuthLoader] Auth providers configured:", productConfig.authProviders.map((p) => p.type).join(", "));
    } else {
      console.log("[AuthLoader] product.json not found, using defaults");
      productConfig = getDefaultProductConfig();
    }
  } catch (error) {
    console.error("[AuthLoader] Failed to load product.json:", error);
    productConfig = getDefaultProductConfig();
  }
  return productConfig;
}
function getDefaultProductConfig() {
  return {
    name: "Halo",
    version: "1.0.0",
    features: normalizeProductFeatures(),
    authProviders: [
      {
        type: "openai-codex",
        displayName: { en: "OpenAI (ChatGPT)", "zh-CN": "OpenAI (ChatGPT)", "zh-TW": "OpenAI (ChatGPT)" },
        description: { en: "Use your ChatGPT Plus/Pro subscription", "zh-CN": "使用您的 ChatGPT Plus/Pro 订阅", "zh-TW": "使用您的 ChatGPT Plus/Pro 訂閱" },
        icon: "sparkles",
        iconBgColor: "#10a37f",
        recommended: false,
        builtin: true,
        enabled: true
      },
      {
        type: "custom",
        displayName: { en: "Custom API", "zh-CN": "自定义 API", "zh-TW": "自訂 API" },
        description: { en: "Claude / OpenAI compatible", "zh-CN": "兼容 Claude / OpenAI", "zh-TW": "相容 Claude / OpenAI" },
        icon: "key",
        iconBgColor: "#da7756",
        recommended: true,
        builtin: true,
        enabled: true
      }
    ]
  };
}
function resolveProviderPath(providerConfig) {
  if (!providerConfig.path) return null;
  const configPath = getProductConfigPath();
  const configDir = require$$1.dirname(configPath);
  const cleanPath = providerConfig.path.startsWith("./") ? providerConfig.path.slice(2) : providerConfig.path;
  return require$$1.join(configDir, cleanPath);
}
async function loadProviderModuleAsync(providerPath) {
  try {
    if (!fs$l.existsSync(providerPath)) {
      console.log(`[AuthLoader] Provider path does not exist: ${providerPath}`);
      return null;
    }
    const importUrl = url.pathToFileURL(providerPath).href;
    console.log(`[AuthLoader] Attempting to load provider from: ${importUrl}`);
    const providerModule = await import(importUrl);
    const getterNames = Object.keys(providerModule).filter(
      (key) => key.startsWith("get") && key.endsWith("Provider") && typeof providerModule[key] === "function"
    );
    if (getterNames.length > 0) {
      const provider = providerModule[getterNames[0]]();
      console.log(`[AuthLoader] Loaded provider from ${providerPath} using ${getterNames[0]}`);
      return provider;
    }
    const classNames = Object.keys(providerModule).filter(
      (key) => key.endsWith("Provider") && typeof providerModule[key] === "function"
    );
    if (classNames.length > 0) {
      const ProviderClass = providerModule[classNames[0]];
      const provider = new ProviderClass();
      console.log(`[AuthLoader] Loaded provider from ${providerPath} using class ${classNames[0]}`);
      return provider;
    }
    console.warn(`[AuthLoader] No provider found in module: ${providerPath}`);
    return null;
  } catch (error) {
    console.error(`[AuthLoader] Failed to load provider from ${providerPath}:`, error);
    return null;
  }
}
async function loadAuthProvidersAsync() {
  const config = loadProductConfig();
  const loadedProviders = [];
  for (const providerConfig of config.authProviders) {
    if (!providerConfig.enabled || !isProviderEnabledByProductFeatures(providerConfig.type, config.features)) {
      console.log(`[AuthLoader] Skipping disabled provider: ${providerConfig.type}`);
      continue;
    }
    const loaded = {
      config: providerConfig,
      provider: null
    };
    if (providerConfig.builtin) {
      console.log(`[AuthLoader] Built-in provider: ${providerConfig.type}`);
      loaded.provider = null;
    } else if (providerConfig.path) {
      const providerPath = resolveProviderPath(providerConfig);
      if (providerPath) {
        loaded.provider = await loadProviderModuleAsync(providerPath);
        if (!loaded.provider) {
          loaded.loadError = `Failed to load from ${providerPath}`;
        }
      }
    }
    loadedProviders.push(loaded);
  }
  return loadedProviders;
}
const ENCRYPTED_PREFIX = "enc:";
function decryptString(value) {
  if (!value) return value;
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }
  if (!electron.safeStorage.isEncryptionAvailable()) {
    console.warn("[SecureStorage] Encryption not available, cannot decrypt");
    return "";
  }
  try {
    const base64Data = value.slice(ENCRYPTED_PREFIX.length);
    const buffer2 = Buffer.from(base64Data, "base64");
    return electron.safeStorage.decryptString(buffer2);
  } catch (error) {
    console.error("[SecureStorage] Decryption failed:", error);
    return "";
  }
}
class AISourceManager {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
    this.initialized = false;
    this.initPromise = null;
    this.registerProvider(getCustomProvider());
    this.registerProvider(getGitHubCopilotProvider());
    this.registerProvider(getOpenAICodexProvider());
    this.initPromise = this.initializeAsync();
  }
  /**
   * Async initialization - loads providers from product.json configuration
   * This is the core configuration-driven loading mechanism
   */
  async initializeAsync() {
    const loadedProviders = await loadAuthProvidersAsync();
    for (const loaded of loadedProviders) {
      if (loaded.config.builtin) {
        continue;
      }
      if (loaded.provider) {
        this.registerProvider(loaded.provider);
      } else if (loaded.loadError) {
        console.warn(`[AISourceManager] Provider ${loaded.config.type} not loaded: ${loaded.loadError}`);
      }
    }
    this.initialized = true;
    console.log("[AISourceManager] Initialization complete, providers:", Array.from(this.providers.keys()).join(", "));
  }
  /**
   * Ensure manager is fully initialized before operations
   */
  async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }
  /**
   * Register a new provider
   */
  registerProvider(provider) {
    this.providers.set(provider.type, provider);
    console.log(`[AISourceManager] Registered provider: ${provider.type}`);
  }
  /**
   * Get a specific provider
   */
  getProvider(type) {
    return this.providers.get(type);
  }
  /**
   * Get all registered providers
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }
  /**
   * Get the current active provider based on config
   */
  getCurrentProvider() {
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom" };
    return this.providers.get(aiSources.current) || null;
  }
  /**
   * Get backend request configuration for the current source
   * This is the main method used by agent.service.ts
   */
  getBackendConfig() {
    const aiSources = this.getDecryptedAiSources();
    console.log("[AISourceManager] getBackendConfig called");
    console.log("[AISourceManager] current source:", aiSources.current);
    console.log("[AISourceManager] aiSources keys:", Object.keys(aiSources));
    const provider = this.providers.get(aiSources.current);
    if (!provider) {
      console.log(`[AISourceManager] No registered provider for source: ${aiSources.current}`);
      console.log("[AISourceManager] Available providers:", Array.from(this.providers.keys()));
      const currentConfig = aiSources[aiSources.current];
      if (currentConfig && typeof currentConfig === "object" && "apiKey" in currentConfig && currentConfig.apiKey) {
        console.log("[AISourceManager] Found dynamic custom API config for:", aiSources.current);
        return this.getDynamicCustomBackendConfig(currentConfig);
      }
      console.warn(`[AISourceManager] No config found for source: ${aiSources.current}`);
      return null;
    }
    console.log("[AISourceManager] Found provider:", provider.type);
    if (!provider.isConfigured(aiSources)) {
      console.warn(`[AISourceManager] Provider ${aiSources.current} is not configured`);
      return this.tryCustomApiFallback(aiSources);
    }
    console.log("[AISourceManager] Provider is configured, calling getBackendConfig");
    const result = provider.getBackendConfig(aiSources);
    console.log("[AISourceManager] getBackendConfig result:", result ? { url: result.url, model: result.model, hasKey: !!result.key } : null);
    if (!result) {
      return this.tryCustomApiFallback(aiSources);
    }
    return result;
  }
  /**
   * Get backend config for dynamic custom API providers (zhipu, kimi, deepseek, etc.)
   * These are stored by provider ID but use the same format as CustomSourceConfig
   */
  getDynamicCustomBackendConfig(config) {
    if (!config.apiKey) return null;
    const isAnthropic = config.provider === "anthropic";
    const baseUrl = (config.apiUrl || "https://api.anthropic.com").replace(/\/$/, "");
    return {
      url: baseUrl,
      key: config.apiKey,
      model: config.model,
      apiType: isAnthropic ? void 0 : baseUrl.includes("/responses") ? "responses" : "chat_completions"
    };
  }
  /**
   * Try falling back to a custom API provider when an OAuth provider fails.
   */
  tryCustomApiFallback(_aiSources) {
    return null;
  }
  /**
   * Check if any AI source is configured
   */
  hasAnySource() {
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom" };
    for (const provider of this.providers.values()) {
      if (provider.isConfigured(aiSources)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Check if a specific source is configured
   */
  isSourceConfigured(type) {
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom" };
    const provider = this.providers.get(type);
    return provider ? provider.isConfigured(aiSources) : false;
  }
  // ========== OAuth Methods ==========
  /**
   * Start OAuth login for a source
   */
  async startOAuthLogin(type) {
    await this.ensureInitialized();
    const provider = this.providers.get(type);
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` };
    }
    if (!this.isOAuthProvider(provider)) {
      return { success: false, error: `Source ${type} does not support OAuth` };
    }
    return provider.startLogin();
  }
  /**
   * Complete OAuth login for a source
   */
  async completeOAuthLogin(type, state2) {
    await this.ensureInitialized();
    const provider = this.providers.get(type);
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` };
    }
    if (!this.isOAuthProvider(provider)) {
      return { success: false, error: `Source ${type} does not support OAuth` };
    }
    const result = await provider.completeLogin(state2);
    if (result.success && result.data) {
      await this.handleOAuthLoginSuccess(type, result.data);
      await this.refreshSiblingProviders(type);
    }
    return result;
  }
  /**
   * Handle successful OAuth login
   */
  async handleOAuthLoginSuccess(type, loginResult) {
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom", custom: config.aiSources?.custom };
    const data = loginResult;
    const tokenData = data._tokenData;
    const availableModels = data._availableModels || [];
    const modelNames = data._modelNames || {};
    const defaultModel = data._defaultModel || "";
    const oauthConfig = {
      loggedIn: true,
      user: {
        name: loginResult.user?.name || "",
        uid: tokenData?.uid || ""
        // Store uid for API headers (ASCII-safe)
      },
      model: defaultModel,
      availableModels,
      modelNames,
      // Store model display names mapping
      accessToken: tokenData?.accessToken || "",
      refreshToken: tokenData?.refreshToken || "",
      tokenExpires: tokenData?.expiresAt
    };
    if (data._modelPricing) {
      oauthConfig.modelPricing = data._modelPricing;
    }
    if (data._chatgptAccountId) {
      oauthConfig.chatgptAccountId = data._chatgptAccountId;
    }
    aiSources.current = type;
    aiSources[type] = oauthConfig;
    saveConfig({
      aiSources,
      isFirstLaunch: false
    });
    console.log(`[AISourceManager] OAuth login for ${type} saved to config`);
  }
  /**
   * After login, refresh other providers that share the same auth.
   * e.g., GLM and SkillsFan Credits share SkillsFan OAuth tokens.
   */
  async refreshSiblingProviders(loginType) {
    const freshConfig = getConfig();
    const aiSources = freshConfig.aiSources || { current: loginType };
    let updated = false;
    for (const provider of this.providers.values()) {
      if (provider.type === loginType) continue;
      if (!provider.refreshConfig) continue;
      if (!provider.isConfigured(aiSources)) continue;
      try {
        const result = await provider.refreshConfig(aiSources);
        if (result.success && result.data) {
          Object.assign(aiSources, result.data);
          updated = true;
          console.log(`[AISourceManager] Sibling provider ${provider.type} config refreshed`);
        }
      } catch (error) {
        console.warn(`[AISourceManager] Failed to refresh sibling ${provider.type}:`, error);
      }
    }
    if (updated) {
      this.preserveUserSelections(aiSources);
      saveConfig({ aiSources });
    }
  }
  /**
   * Logout from a source
   */
  async logout(type) {
    const provider = this.providers.get(type);
    if (!provider) {
      return { success: false, error: `Unknown source type: ${type}` };
    }
    if (this.isOAuthProvider(provider)) {
      await provider.logout();
    }
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom" };
    const wasCurrent = aiSources.current === type;
    delete aiSources[type];
    if (wasCurrent) {
      if (aiSources.custom?.apiKey) {
        aiSources.current = "custom";
      } else {
        const fallback = Object.keys(aiSources).find((key) => {
          if (key === "current" || key === "custom") return false;
          const source = aiSources[key];
          return source?.loggedIn === true;
        });
        aiSources.current = fallback || "custom";
      }
    }
    saveConfig({ aiSources });
    console.log(`[AISourceManager] Logout complete for ${type}`);
    return { success: true };
  }
  // ========== Token Management ==========
  /**
   * Check and refresh token if needed (for OAuth sources)
   */
  async ensureValidToken(type) {
    const provider = this.providers.get(type);
    if (!provider) {
      return { success: false, error: "Provider not found" };
    }
    if (!provider.checkTokenWithConfig || !provider.refreshTokenWithConfig) {
      return { success: true };
    }
    const aiSources = this.getDecryptedAiSources();
    const tokenStatus = provider.checkTokenWithConfig(aiSources);
    if (!tokenStatus.valid) {
      return { success: false, error: "Token expired" };
    }
    if (tokenStatus.needsRefresh) {
      console.log(`[AISourceManager] Token for ${type} needs refresh, refreshing...`);
      const refreshResult = await provider.refreshTokenWithConfig(aiSources);
      if (refreshResult.success && refreshResult.data) {
        const freshConfig = getConfig();
        const freshAiSources = freshConfig.aiSources || { current: "custom" };
        const providerConfig = freshAiSources[type];
        if (providerConfig) {
          providerConfig.accessToken = refreshResult.data.accessToken;
          providerConfig.refreshToken = refreshResult.data.refreshToken;
          providerConfig.tokenExpires = refreshResult.data.expiresAt;
          if (refreshResult.data.chatgptAccountId !== void 0) {
            providerConfig.chatgptAccountId = refreshResult.data.chatgptAccountId;
          }
          saveConfig({ aiSources: freshAiSources });
          console.log("[AISourceManager] Token refreshed and saved");
        }
      } else {
        console.error(`[AISourceManager] Token refresh failed for ${type}:`, refreshResult.error);
        return refreshResult;
      }
    }
    return { success: true };
  }
  // ========== Configuration Refresh ==========
  /**
   * Refresh configuration for all sources
   */
  async refreshAllConfigs() {
    await this.ensureInitialized();
    const decryptedAiSources = this.getDecryptedAiSources();
    const freshConfig = getConfig();
    const aiSources = freshConfig.aiSources || { current: "custom" };
    for (const provider of this.providers.values()) {
      if (provider.refreshConfig && provider.isConfigured(decryptedAiSources)) {
        try {
          const result = await provider.refreshConfig(decryptedAiSources);
          if (result.success && result.data) {
            Object.assign(aiSources, result.data);
          }
        } catch (error) {
          console.error(`[AISourceManager] Failed to refresh ${provider.type}:`, error);
        }
      }
    }
    this.preserveUserSelections(aiSources);
    saveConfig({ aiSources });
  }
  /**
   * Refresh configuration for a specific source
   */
  async refreshSourceConfig(type) {
    await this.ensureInitialized();
    const provider = this.providers.get(type);
    if (!provider?.refreshConfig) {
      return { success: true };
    }
    const decryptedAiSources = this.getDecryptedAiSources();
    if (!provider.isConfigured(decryptedAiSources)) {
      return { success: false, error: "Source not configured" };
    }
    const result = await provider.refreshConfig(decryptedAiSources);
    if (result.success && result.data) {
      const freshConfig = getConfig();
      const aiSources = freshConfig.aiSources || { current: "custom" };
      Object.assign(aiSources, result.data);
      this.preserveUserSelections(aiSources);
      saveConfig({ aiSources });
    }
    return result;
  }
  // ========== Helper Methods ==========
  isOAuthProvider(provider) {
    return "startLogin" in provider && "completeLogin" in provider;
  }
  /**
   * Get AISourcesConfig with all tokens/keys in plaintext.
   *
   * Detects legacy 'enc:' prefixed values from the old encryption scheme,
   * decrypts them via safeStorage (may trigger Keychain prompt on macOS),
   * and persists plaintext back to config.json so subsequent calls never
   * touch Keychain again.
   */
  getDecryptedAiSources() {
    const config = getConfig();
    const aiSources = config.aiSources || { current: "custom" };
    let needsMigration = false;
    const result = { ...aiSources };
    for (const key of Object.keys(result)) {
      if (key === "current") continue;
      const providerConfig = result[key];
      if (!providerConfig || typeof providerConfig !== "object") continue;
      if ("apiKey" in providerConfig) {
        const apiKey = providerConfig.apiKey || "";
        if (typeof apiKey === "string" && apiKey.startsWith("enc:")) {
          needsMigration = true;
          result[key] = {
            ...providerConfig,
            apiKey: decryptString(apiKey)
          };
        }
        const configs = providerConfig.configs;
        if (Array.isArray(configs)) {
          const decryptedConfigs = configs.map((cfg) => {
            if (typeof cfg.apiKey === "string" && cfg.apiKey.startsWith("enc:")) {
              needsMigration = true;
              return { ...cfg, apiKey: decryptString(cfg.apiKey) };
            }
            return cfg;
          });
          const pc = result[key] || { ...providerConfig };
          result[key] = { ...pc, configs: decryptedConfigs };
        }
      }
      if ("accessToken" in providerConfig) {
        const pc = result[key] || providerConfig;
        const atEncrypted = typeof pc.accessToken === "string" && pc.accessToken.startsWith("enc:");
        const rtEncrypted = typeof pc.refreshToken === "string" && pc.refreshToken.startsWith("enc:");
        if (atEncrypted || rtEncrypted) {
          needsMigration = true;
          result[key] = {
            ...pc,
            ...atEncrypted ? { accessToken: decryptString(pc.accessToken) } : {},
            ...rtEncrypted ? { refreshToken: decryptString(pc.refreshToken) } : {}
          };
        }
      }
    }
    if (needsMigration) {
      console.log("[AISourceManager] Migrated encrypted values to plaintext in config");
      saveConfig({ aiSources: result });
    }
    return result;
  }
  /**
   * Re-read latest config from disk and preserve user-mutable fields
   * (current source, model selection per provider) in the refreshed aiSources.
   * Prevents race conditions where user changes during async refresh get overwritten.
   */
  preserveUserSelections(aiSources) {
    const latestConfig = getConfig();
    const latestAiSources = latestConfig.aiSources || {};
    aiSources.current = latestAiSources.current || aiSources.current;
    for (const key of Object.keys(aiSources)) {
      if (key === "current") continue;
      const refreshed = aiSources[key];
      const latest = latestAiSources[key];
      if (refreshed && typeof refreshed === "object" && "model" in refreshed && latest && typeof latest === "object" && "model" in latest) {
        refreshed.model = latest.model;
      }
    }
  }
}
let managerInstance = null;
function getAISourceManager() {
  if (!managerInstance) {
    managerInstance = new AISourceManager();
  }
  return managerInstance;
}
let tray = null;
let isQuitting = false;
function getTrayIconPath() {
  const resourcesPath = is.dev ? require$$1.join(__dirname, "../../resources") : require$$1.join(electron.app.getAppPath(), "../resources");
  if (process.platform === "darwin") {
    return require$$1.join(resourcesPath, "tray/trayTemplate.png");
  } else {
    return require$$1.join(resourcesPath, "tray/tray-16.png");
  }
}
function createDefaultTrayIcon() {
  const size = process.platform === "darwin" ? 16 : 32;
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="none" stroke="${process.platform === "darwin" ? "black" : "#6366f1"}" stroke-width="2"/>
    </svg>
  `;
  const buffer2 = Buffer.from(canvas);
  const icon = electron.nativeImage.createFromBuffer(buffer2);
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }
  return icon;
}
function createTray(mainWindow2) {
  if (tray) {
    return tray;
  }
  try {
    let icon;
    const iconPath = getTrayIconPath();
    try {
      icon = electron.nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        throw new Error("Icon file is empty");
      }
      if (process.platform === "darwin") {
        icon.setTemplateImage(true);
      }
    } catch {
      console.log("[Tray] Using default icon");
      icon = createDefaultTrayIcon();
    }
    tray = new electron.Tray(icon);
    tray.setToolTip("Halo - AI Assistant");
    updateTrayMenu(mainWindow2);
    tray.on("double-click", () => {
      showMainWindow(mainWindow2);
    });
    if (process.platform === "darwin") {
      tray.on("click", () => {
        showMainWindow(mainWindow2);
      });
    }
    console.log("[Tray] Created successfully");
    return tray;
  } catch (error) {
    console.error("[Tray] Failed to create:", error);
    return null;
  }
}
function updateTrayMenu(mainWindow2) {
  if (!tray) return;
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "Show Halo",
      click: () => {
        showMainWindow(mainWindow2);
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}
function showMainWindow(mainWindow2) {
  if (mainWindow2 && !mainWindow2.isDestroyed()) {
    if (mainWindow2.isMinimized()) {
      mainWindow2.restore();
    }
    mainWindow2.show();
    mainWindow2.focus();
    if (process.platform === "darwin") {
      electron.app.dock?.show();
    }
  }
}
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    console.log("[Tray] Destroyed");
  }
}
function hasTray() {
  return tray !== null;
}
function setIsQuitting(value) {
  isQuitting = value;
}
function getIsQuitting() {
  return isQuitting;
}
function ipcHandle(channel, handler) {
  electron.ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...args);
      return result === void 0 ? { success: true } : { success: true, data: result };
    } catch (error) {
      const err = error;
      return { success: false, error: err.message };
    }
  });
}
function registerConfigHandlers() {
  ipcHandle("config:get", () => getConfigAsync());
  electron.ipcMain.handle("config:set", async (_event, updates) => {
    try {
      const processedUpdates = { ...updates };
      const incomingAiSources = processedUpdates.aiSources;
      if (incomingAiSources && typeof incomingAiSources === "object") {
        const currentConfig = await getConfigAsync();
        const currentAiSources = currentConfig.aiSources || { current: "custom" };
        const mergedAiSources = {
          ...currentAiSources,
          ...incomingAiSources
        };
        for (const key of Object.keys(incomingAiSources)) {
          if (key === "current") continue;
          const incomingValue = incomingAiSources[key];
          const currentValue = currentAiSources[key];
          if (incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue) && currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)) {
            mergedAiSources[key] = {
              ...currentValue,
              ...incomingValue
            };
          }
        }
        processedUpdates.aiSources = mergedAiSources;
      }
      const config = await saveConfigAsync(processedUpdates);
      return { success: true, data: config };
    } catch (error) {
      const err = error;
      return { success: false, error: err.message };
    }
  });
  ipcHandle(
    "config:validate-api",
    (_e, apiKey, apiUrl, provider) => validateApiConnection(apiKey, apiUrl, provider)
  );
  ipcHandle("config:refresh-ai-sources", async () => {
    const manager = getAISourceManager();
    await manager.refreshAllConfigs();
    return getConfigAsync();
  });
  electron.ipcMain.handle("config:reset-to-default", async () => {
    try {
      const isDev = process.env.NODE_ENV === "development";
      const appDataPath = isDev ? require$$1.join(electron.app.getPath("home"), ".skillsfan-dev") : require$$1.join(electron.app.getPath("home"), ".skillsfan");
      console.log("[Config IPC] Resetting to default, clearing:", appDataPath);
      if (await fs.pathExists(appDataPath)) {
        try {
          await fs.emptyDir(appDataPath);
        } catch (emptyErr) {
          console.warn("[Config IPC] emptyDir failed, trying remove:", emptyErr);
        }
        await fs.remove(appDataPath);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (await fs.pathExists(appDataPath)) {
          console.error("[Config IPC] Failed to delete data directory, it still exists");
          return {
            success: false,
            error: "Failed to clear data directory. Please close other applications that may be using SkillsFan files and try again."
          };
        }
        console.log("[Config IPC] Data cleared and verified successfully");
      }
      setIsQuitting(true);
      const windows = electron.BrowserWindow.getAllWindows();
      windows.forEach((window2) => {
        window2.destroy();
      });
      setTimeout(() => {
        console.log("[Config IPC] Restarting app...");
        electron.app.relaunch();
        electron.app.quit();
      }, 1e3);
      return { success: true };
    } catch (error) {
      const err = error;
      console.error("[Config IPC] Reset to default error:", err);
      return { success: false, error: err.message };
    }
  });
}
const SPACE_DATA_DIR = ".skillsfan";
const LEGACY_DATA_DIR = ".halo";
function getSpaceMetaDir(spacePath) {
  const newDir = require$$1.join(spacePath, SPACE_DATA_DIR);
  if (fs$l.existsSync(newDir)) {
    return newDir;
  }
  const legacyDir = require$$1.join(spacePath, LEGACY_DATA_DIR);
  if (fs$l.existsSync(legacyDir)) {
    return legacyDir;
  }
  return newDir;
}
function isExistingDirectory(targetPath) {
  if (!targetPath || typeof targetPath !== "string") {
    return false;
  }
  try {
    return fs$l.existsSync(targetPath) && fs$l.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}
function getSpaceIndexPath() {
  return require$$1.join(getHaloDir(), "spaces-index.json");
}
function loadSpaceIndex() {
  const indexPath = getSpaceIndexPath();
  if (fs$l.existsSync(indexPath)) {
    try {
      return JSON.parse(fs$l.readFileSync(indexPath, "utf-8"));
    } catch {
      return { customPaths: [] };
    }
  }
  return { customPaths: [] };
}
function saveSpaceIndex(index) {
  const indexPath = getSpaceIndexPath();
  atomicWriteJsonSync(indexPath, index, { backup: true });
}
function addToSpaceIndex(path2) {
  const index = loadSpaceIndex();
  if (!index.customPaths.includes(path2)) {
    index.customPaths.push(path2);
    saveSpaceIndex(index);
  }
}
function removeFromSpaceIndex(path2) {
  const index = loadSpaceIndex();
  index.customPaths = index.customPaths.filter((p) => p !== path2);
  saveSpaceIndex(index);
}
const HALO_SPACE = {
  id: "skillsfan-temp",
  name: "技能范",
  icon: "skillsfan",
  // Uses SkillsFan brand logo
  path: "",
  isTemp: true,
  createdAt: (/* @__PURE__ */ new Date()).toISOString(),
  updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
  stats: {
    artifactCount: 0,
    conversationCount: 0
  }
};
function getSpaceStats(spacePath) {
  const artifactsDir = require$$1.join(spacePath, "artifacts");
  const conversationsDir = require$$1.join(getSpaceMetaDir(spacePath), "conversations");
  let artifactCount = 0;
  let conversationCount = 0;
  if (fs$l.existsSync(artifactsDir)) {
    const countFiles = (dir) => {
      let count = 0;
      const items = fs$l.readdirSync(dir);
      for (const item of items) {
        const itemPath = require$$1.join(dir, item);
        const stat2 = fs$l.statSync(itemPath);
        if (stat2.isFile() && !item.startsWith(".")) {
          count++;
        } else if (stat2.isDirectory()) {
          count += countFiles(itemPath);
        }
      }
      return count;
    };
    artifactCount = countFiles(artifactsDir);
  }
  if (spacePath === getTempSpacePath()) {
    const tempArtifactsDir = require$$1.join(spacePath, "artifacts");
    if (fs$l.existsSync(tempArtifactsDir)) {
      artifactCount = fs$l.readdirSync(tempArtifactsDir).filter((f) => !f.startsWith(".")).length;
    }
  }
  if (fs$l.existsSync(conversationsDir)) {
    conversationCount = fs$l.readdirSync(conversationsDir).filter((f) => f.endsWith(".json")).length;
  } else {
    const tempConvDir = require$$1.join(spacePath, "conversations");
    if (fs$l.existsSync(tempConvDir)) {
      conversationCount = fs$l.readdirSync(tempConvDir).filter((f) => f.endsWith(".json")).length;
    }
  }
  return { artifactCount, conversationCount };
}
function getHaloSpace() {
  const tempPath = getTempSpacePath();
  const stats = getSpaceStats(tempPath);
  const metaPath = require$$1.join(getSpaceMetaDir(tempPath), "meta.json");
  let preferences;
  if (fs$l.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs$l.readFileSync(metaPath, "utf-8"));
      preferences = meta.preferences;
    } catch {
    }
  }
  return {
    ...HALO_SPACE,
    path: tempPath,
    stats,
    preferences
  };
}
function loadSpaceFromPath(spacePath) {
  const metaPath = require$$1.join(getSpaceMetaDir(spacePath), "meta.json");
  if (fs$l.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs$l.readFileSync(metaPath, "utf-8"));
      const stats = getSpaceStats(spacePath);
      return {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        iconColor: meta.iconColor,
        path: spacePath,
        isTemp: false,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        stats,
        preferences: meta.preferences
      };
    } catch (error) {
      console.error(`Failed to read space meta for ${spacePath}:`, error);
    }
  }
  return null;
}
function listSpaces() {
  const spacesDir = getSpacesDir();
  const spaces = [];
  const loadedPaths = /* @__PURE__ */ new Set();
  if (fs$l.existsSync(spacesDir)) {
    const dirs = fs$l.readdirSync(spacesDir);
    for (const dir of dirs) {
      const spacePath = require$$1.join(spacesDir, dir);
      const space = loadSpaceFromPath(spacePath);
      if (space) {
        spaces.push(space);
        loadedPaths.add(spacePath);
      }
    }
  }
  const index = loadSpaceIndex();
  for (const customPath of index.customPaths) {
    if (!loadedPaths.has(customPath) && fs$l.existsSync(customPath)) {
      const space = loadSpaceFromPath(customPath);
      if (space) {
        spaces.push(space);
        loadedPaths.add(customPath);
      }
    }
  }
  spaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return spaces;
}
function createSpace(input) {
  const id = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const isCustomPath = !!input.customPath;
  let spacePath;
  if (input.customPath) {
    spacePath = input.customPath;
  } else {
    spacePath = require$$1.join(getSpacesDir(), input.name);
  }
  fs$l.mkdirSync(spacePath, { recursive: true });
  fs$l.mkdirSync(require$$1.join(spacePath, SPACE_DATA_DIR), { recursive: true });
  fs$l.mkdirSync(require$$1.join(spacePath, SPACE_DATA_DIR, "conversations"), { recursive: true });
  const meta = {
    id,
    name: input.name,
    icon: input.icon,
    iconColor: input.iconColor,
    createdAt: now,
    updatedAt: now
  };
  atomicWriteJsonSync(require$$1.join(spacePath, SPACE_DATA_DIR, "meta.json"), meta, { backup: true });
  if (isCustomPath) {
    addToSpaceIndex(spacePath);
  }
  return {
    id,
    name: input.name,
    icon: input.icon,
    iconColor: input.iconColor,
    path: spacePath,
    isTemp: false,
    createdAt: now,
    updatedAt: now,
    stats: {
      artifactCount: 0,
      conversationCount: 0
    }
  };
}
function deleteSpace(spaceId) {
  const space = getSpace(spaceId);
  if (!space || space.isTemp) {
    return false;
  }
  const spacePath = space.path;
  const spacesDir = getSpacesDir();
  const isCustomPath = !spacePath.startsWith(spacesDir);
  try {
    if (isCustomPath) {
      const newDataDir = require$$1.join(spacePath, SPACE_DATA_DIR);
      const legacyDataDir = require$$1.join(spacePath, LEGACY_DATA_DIR);
      if (fs$l.existsSync(newDataDir)) {
        fs$l.rmSync(newDataDir, { recursive: true, force: true });
      }
      if (fs$l.existsSync(legacyDataDir)) {
        fs$l.rmSync(legacyDataDir, { recursive: true, force: true });
      }
      removeFromSpaceIndex(spacePath);
    } else {
      fs$l.rmSync(spacePath, { recursive: true, force: true });
    }
    return true;
  } catch (error) {
    console.error(`Failed to delete space ${spaceId}:`, error);
    return false;
  }
}
function getSpace(spaceId) {
  if (spaceId === "skillsfan-temp") {
    return getHaloSpace();
  }
  const spaces = listSpaces();
  return spaces.find((s) => s.id === spaceId) || null;
}
function openSpaceFolder(spaceId) {
  const space = getSpace(spaceId);
  if (space) {
    if (space.isTemp) {
      const artifactsPath = require$$1.join(space.path, "artifacts");
      if (fs$l.existsSync(artifactsPath)) {
        electron.shell.openPath(artifactsPath);
        return true;
      }
    } else {
      electron.shell.openPath(space.path);
      return true;
    }
  }
  return false;
}
function updateSpace(spaceId, updates) {
  const space = getSpace(spaceId);
  if (!space || space.isTemp) {
    return null;
  }
  const metaPath = require$$1.join(getSpaceMetaDir(space.path), "meta.json");
  try {
    const meta = JSON.parse(fs$l.readFileSync(metaPath, "utf-8"));
    if (updates.name) meta.name = updates.name;
    if (updates.icon) meta.icon = updates.icon;
    if (updates.iconColor !== void 0) {
      meta.iconColor = updates.iconColor || void 0;
    }
    meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    atomicWriteJsonSync(metaPath, meta, { backup: true });
    return getSpace(spaceId);
  } catch (error) {
    console.error("Failed to update space:", error);
    return null;
  }
}
function updateSpacePreferences(spaceId, preferences) {
  const space = getSpace(spaceId);
  if (!space) {
    return null;
  }
  const metaDir = getSpaceMetaDir(space.path);
  const metaPath = require$$1.join(metaDir, "meta.json");
  try {
    if (!fs$l.existsSync(metaDir)) {
      fs$l.mkdirSync(metaDir, { recursive: true });
    }
    let meta;
    if (fs$l.existsSync(metaPath)) {
      meta = JSON.parse(fs$l.readFileSync(metaPath, "utf-8"));
    } else {
      meta = {
        id: space.id,
        name: space.name,
        icon: space.icon,
        createdAt: space.createdAt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    meta.preferences = meta.preferences || {};
    if (preferences.layout) {
      meta.preferences.layout = {
        ...meta.preferences.layout,
        ...preferences.layout
      };
    }
    meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    atomicWriteJsonSync(metaPath, meta, { backup: true });
    console.log(`[Space] Updated preferences for ${spaceId}:`, preferences);
    return getSpace(spaceId);
  } catch (error) {
    console.error("Failed to update space preferences:", error);
    return null;
  }
}
function getSpacePreferences(spaceId) {
  const space = getSpace(spaceId);
  if (!space) {
    return null;
  }
  const metaPath = require$$1.join(getSpaceMetaDir(space.path), "meta.json");
  try {
    if (fs$l.existsSync(metaPath)) {
      const meta = JSON.parse(fs$l.readFileSync(metaPath, "utf-8"));
      return meta.preferences || null;
    }
    return null;
  } catch (error) {
    console.error("Failed to get space preferences:", error);
    return null;
  }
}
const IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  "__pycache__",
  ".cache",
  ".turbo",
  "coverage",
  ".output",
  "build",
  ".DS_Store",
  ".env",
  "out",
  ".nuxt",
  ".svelte-kit",
  "target",
  ".skillsfan",
  ".halo"
]);
const IGNORED_FILES = /* @__PURE__ */ new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitkeep"
]);
const ALLOWED_DOT_DIRS = /* @__PURE__ */ new Set([
  ".claude",
  ".github",
  ".vscode",
  ".husky"
]);
async function listWorkspaceFiles(spaceId, options = {}) {
  const { maxDepth = 5, maxResults = 50, query = "" } = options;
  const space = getSpace(spaceId);
  if (!space?.path) {
    return [];
  }
  const baseDir = space.path;
  if (!fs$l.existsSync(baseDir)) {
    return [];
  }
  const results = [];
  async function scan(dir, depth, relativePath) {
    if (depth > maxDepth || results.length >= maxResults * 2) return;
    let entries;
    try {
      entries = await fs__namespace.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".") && !ALLOWED_DOT_DIRS.has(name)) continue;
      if (entry.isDirectory() && IGNORED_DIRS.has(name)) continue;
      if (!entry.isDirectory() && IGNORED_FILES.has(name)) continue;
      const itemPath = relativePath ? `${relativePath}/${name}` : name;
      const fullPath = require$$1.join(dir, name);
      results.push({
        name,
        path: itemPath,
        isDirectory: entry.isDirectory(),
        extension: entry.isDirectory() ? void 0 : require$$1.extname(name).slice(1) || void 0
      });
      if (entry.isDirectory()) {
        await scan(fullPath, depth + 1, itemPath);
      }
    }
  }
  await scan(baseDir, 0, "");
  let filtered = results;
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = results.filter(
      (item) => item.path.toLowerCase().includes(lowerQuery) || item.name.toLowerCase().includes(lowerQuery)
    );
  }
  return filtered.slice(0, maxResults);
}
function registerSpaceHandlers() {
  ipcHandle("space:set-active", (_e, spaceId) => {
    setActiveSpaceId(spaceId);
  });
  ipcHandle("space:get-halo", () => getHaloSpace());
  ipcHandle("space:list", () => listSpaces());
  ipcHandle(
    "space:create",
    (_e, input) => createSpace(input)
  );
  ipcHandle("space:delete", (_e, spaceId) => deleteSpace(spaceId));
  ipcHandle("space:get", (_e, spaceId) => getSpace(spaceId));
  ipcHandle("space:open-folder", (_e, spaceId) => openSpaceFolder(spaceId));
  ipcHandle(
    "space:update",
    (_e, spaceId, updates) => updateSpace(spaceId, updates)
  );
  ipcHandle("space:get-default-path", () => getSpacesDir());
  ipcHandle("dialog:select-folder", async () => {
    const result = await electron.dialog.showOpenDialog({
      title: "Select Space Location",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Select Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcHandle("space:path-exists", (_e, targetPath) => isExistingDirectory(targetPath));
  ipcHandle(
    "space:update-preferences",
    (_e, spaceId, preferences) => updateSpacePreferences(spaceId, preferences)
  );
  ipcHandle("space:get-preferences", (_e, spaceId) => getSpacePreferences(spaceId));
  ipcHandle(
    "space:list-files",
    (_e, spaceId, query) => listWorkspaceFiles(spaceId, { query })
  );
}
let mainWindow$3 = null;
function registerSystemHandlers(window2) {
  mainWindow$3 = window2;
  ipcHandle("system:get-auto-launch", () => getAutoLaunch());
  ipcHandle("system:set-auto-launch", (_e, enabled) => {
    setAutoLaunch(enabled);
    return enabled;
  });
  ipcHandle("system:get-minimize-to-tray", () => getMinimizeToTray());
  ipcHandle("system:set-minimize-to-tray", (_e, enabled) => {
    setMinimizeToTray(enabled);
    if (enabled) {
      if (!hasTray()) createTray(mainWindow$3);
    } else {
      destroyTray();
    }
    return enabled;
  });
  ipcHandle(
    "window:set-title-bar-overlay",
    (_e, options) => {
      if (process.platform !== "darwin" && mainWindow$3) {
        mainWindow$3.setTitleBarOverlay({
          color: options.color,
          symbolColor: options.symbolColor,
          height: 40
        });
      }
    }
  );
  ipcHandle("window:set-button-visibility", (_e, visible) => {
    if (process.platform === "darwin" && mainWindow$3) {
      mainWindow$3.setWindowButtonVisibility(visible);
    }
  });
  ipcHandle("window:maximize", () => {
    mainWindow$3?.maximize();
  });
  ipcHandle("window:unmaximize", () => {
    mainWindow$3?.unmaximize();
  });
  ipcHandle("window:is-maximized", () => mainWindow$3?.isMaximized() ?? false);
  ipcHandle("window:toggle-maximize", () => {
    if (mainWindow$3) {
      if (mainWindow$3.isMaximized()) {
        mainWindow$3.unmaximize();
      } else {
        mainWindow$3.maximize();
      }
    }
    return mainWindow$3?.isMaximized() ?? false;
  });
  if (mainWindow$3) {
    mainWindow$3.on("maximize", () => {
      mainWindow$3?.webContents.send("window:maximize-change", true);
    });
    mainWindow$3.on("unmaximize", () => {
      mainWindow$3?.webContents.send("window:maximize-change", false);
    });
  }
}
const { autoUpdater } = electronUpdater;
const UPDATER_CONFIG = {
  /** Delay before first check after startup (ms) */
  STARTUP_DELAY: 5e3,
  /** Timeout for update check (ms) */
  CHECK_TIMEOUT: 15e3,
  /** Interval for periodic update checks (ms) - 4 hours */
  PERIODIC_CHECK_INTERVAL: 4 * 60 * 60 * 1e3,
  /** Download page URL (uses SKILLSFAN_BASE_URL for region awareness) */
  get DOWNLOAD_PAGE_URL() {
    try {
      const { SKILLSFAN_BASE_URL } = require("./skillsfan/constants");
      return `${SKILLSFAN_BASE_URL}/download`;
    } catch {
      return "https://www.skills.fan/download";
    }
  }
};
let mainWindow$2 = null;
let state = {
  status: "idle",
  updateInfo: {
    currentVersion: "",
    latestVersion: null,
    releaseDate: null,
    releaseNotes: null
  },
  errorMessage: null,
  lastChecked: null
};
function sendUpdateStatus() {
  if (mainWindow$2 && !mainWindow$2.isDestroyed()) {
    mainWindow$2.webContents.send("updater:status", {
      status: state.status,
      ...state.updateInfo,
      errorMessage: state.errorMessage,
      lastChecked: state.lastChecked
    });
  }
}
function updateState(updates) {
  state = { ...state, ...updates };
  sendUpdateStatus();
}
function extractReleaseNotes(info2) {
  if (!info2.releaseNotes) return null;
  if (typeof info2.releaseNotes === "string") {
    return info2.releaseNotes;
  }
  if (Array.isArray(info2.releaseNotes)) {
    return info2.releaseNotes.map((note) => note.note || "").join("\n\n");
  }
  return null;
}
function initAutoUpdater(window2) {
  mainWindow$2 = window2;
  state.updateInfo.currentVersion = electron.app.getVersion();
  if (is.dev) {
    console.log("[Updater] Skipping auto-update in development mode");
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for updates...");
    updateState({ status: "checking", errorMessage: null });
  });
  autoUpdater.on("update-available", (info2) => {
    console.log(`[Updater] Update available: ${info2.version}`);
    updateState({
      status: "available",
      updateInfo: {
        currentVersion: electron.app.getVersion(),
        latestVersion: info2.version,
        releaseDate: info2.releaseDate || null,
        releaseNotes: extractReleaseNotes(info2)
      },
      lastChecked: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  autoUpdater.on("update-not-available", (info2) => {
    console.log(`[Updater] Current version ${electron.app.getVersion()} is up to date`);
    updateState({
      status: "not-available",
      updateInfo: {
        currentVersion: electron.app.getVersion(),
        latestVersion: info2.version,
        releaseDate: info2.releaseDate || null,
        releaseNotes: extractReleaseNotes(info2)
      },
      lastChecked: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  autoUpdater.on("error", (error) => {
    console.error("[Updater] Error:", error.message);
    updateState({
      status: "error",
      errorMessage: error.message,
      lastChecked: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  setTimeout(() => {
    checkForUpdates();
  }, UPDATER_CONFIG.STARTUP_DELAY);
  setInterval(() => {
    if (["idle", "not-available", "error"].includes(state.status)) {
      console.log("[Updater] Periodic update check...");
      checkForUpdates();
    }
  }, UPDATER_CONFIG.PERIODIC_CHECK_INTERVAL);
}
async function checkForUpdates() {
  state.updateInfo.currentVersion = electron.app.getVersion();
  if (is.dev) {
    console.log("[Updater] Skipping update check in development mode");
    return state;
  }
  try {
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Update check timed out")), UPDATER_CONFIG.CHECK_TIMEOUT)
    );
    await Promise.race([autoUpdater.checkForUpdates(), timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Updater] Failed to check for updates:", errorMessage);
    updateState({
      status: "error",
      errorMessage,
      lastChecked: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return state;
}
function openDownloadPage() {
  electron.shell.openExternal(UPDATER_CONFIG.DOWNLOAD_PAGE_URL);
  console.log("[Updater] Opened download page:", UPDATER_CONFIG.DOWNLOAD_PAGE_URL);
}
function getUpdateInfo() {
  state.updateInfo.currentVersion = electron.app.getVersion();
  return { ...state };
}
function registerUpdaterHandlers() {
  electron.ipcMain.handle("updater:check", async () => {
    try {
      const result = await checkForUpdates();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("updater:get-version", () => {
    return { success: true, data: electron.app.getVersion() };
  });
  electron.ipcMain.handle("updater:get-info", () => {
    return { success: true, data: getUpdateInfo() };
  });
  electron.ipcMain.handle("updater:open-download", () => {
    openDownloadPage();
    return { success: true };
  });
}
function initializeEssentialServices(mainWindow2) {
  const start = performance.now();
  registerConfigHandlers();
  registerSpaceHandlers();
  registerSystemHandlers(mainWindow2);
  registerUpdaterHandlers();
  initAutoUpdater(mainWindow2);
  const duration = performance.now() - start;
  console.log(`[Bootstrap] Essential services initialized in ${duration.toFixed(1)}ms`);
}
function writeOnboardingArtifact(spaceId, filename, content) {
  const space = getSpace(spaceId);
  if (!space) {
    return { success: false, error: "Space not found" };
  }
  try {
    const artifactsDir = require$$1.join(space.path, "artifacts");
    if (!fs$l.existsSync(artifactsDir)) {
      fs$l.mkdirSync(artifactsDir, { recursive: true });
    }
    const filePath = require$$1.join(artifactsDir, filename);
    fs$l.writeFileSync(filePath, content, "utf-8");
    console.log(`[Onboarding] Wrote artifact: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    console.error("[Onboarding] Failed to write artifact:", error);
    return { success: false, error: error.message };
  }
}
function saveOnboardingConversation(spaceId, userPrompt, aiResponse) {
  const space = getSpace(spaceId);
  if (!space) {
    return { success: false, error: "Space not found" };
  }
  try {
    let conversationsDir;
    if (space.isTemp) {
      conversationsDir = require$$1.join(space.path, "conversations");
    } else {
      conversationsDir = require$$1.join(space.path, ".halo", "conversations");
    }
    if (!fs$l.existsSync(conversationsDir)) {
      fs$l.mkdirSync(conversationsDir, { recursive: true });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const conversationId = crypto.randomUUID();
    const conversation = {
      id: conversationId,
      spaceId,
      title: "Welcome to Halo",
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: userPrompt,
          timestamp: now
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: aiResponse,
          timestamp: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    const filePath = require$$1.join(conversationsDir, `${conversationId}.json`);
    fs$l.writeFileSync(filePath, JSON.stringify(conversation, null, 2), "utf-8");
    console.log(`[Onboarding] Saved conversation: ${filePath}`);
    return { success: true, conversationId };
  } catch (error) {
    console.error("[Onboarding] Failed to save conversation:", error);
    return { success: false, error: error.message };
  }
}
function registerOnboardingHandlers() {
  ipcHandle(
    "onboarding:write-artifact",
    (_e, spaceId, filename, content) => writeOnboardingArtifact(spaceId, filename, content)
  );
  ipcHandle(
    "onboarding:save-conversation",
    (_e, spaceId, userPrompt, aiResponse) => saveOnboardingConversation(spaceId, userPrompt, aiResponse)
  );
}
function detectGitBash() {
  if (process.platform !== "win32") {
    return { found: true, path: "/bin/bash", source: "system" };
  }
  const envPath = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  if (envPath && fs$l.existsSync(envPath)) {
    console.log("[GitBash] Found via environment variable:", envPath);
    return { found: true, path: envPath, source: "env-var" };
  }
  const appLocalPaths = process.platform === "win32" ? [
    require$$1.join(process.env.PROGRAMDATA || "C:\\ProgramData", "skillsfan", "git-bash", "bin", "bash.exe"),
    require$$1.join(electron.app.getPath("userData"), "git-bash", "bin", "bash.exe")
    // Legacy location
  ] : [require$$1.join(electron.app.getPath("userData"), "git-bash", "bin", "bash.exe")];
  for (const localGitBash of appLocalPaths) {
    if (fs$l.existsSync(localGitBash)) {
      console.log("[GitBash] Found app-local installation:", localGitBash);
      return { found: true, path: localGitBash, source: "app-local" };
    }
  }
  const systemPaths = [
    require$$1.join(process.env.PROGRAMFILES || "", "Git", "bin", "bash.exe"),
    require$$1.join(process.env["PROGRAMFILES(X86)"] || "", "Git", "bin", "bash.exe"),
    require$$1.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
  ];
  for (const p of systemPaths) {
    if (p && fs$l.existsSync(p)) {
      console.log("[GitBash] Found system installation:", p);
      return { found: true, path: p, source: "system" };
    }
  }
  const gitFromPath = findGitInPath();
  if (gitFromPath) {
    const bashPath = require$$1.join(gitFromPath, "..", "..", "bin", "bash.exe");
    if (fs$l.existsSync(bashPath)) {
      console.log("[GitBash] Found via PATH:", bashPath);
      return { found: true, path: bashPath, source: "system" };
    }
  }
  console.log("[GitBash] Not found");
  return { found: false, path: null, source: null };
}
function findGitInPath() {
  const pathEnv = process.env.PATH || "";
  const paths = pathEnv.split(";");
  for (const p of paths) {
    const gitExe = require$$1.join(p, "git.exe");
    if (fs$l.existsSync(gitExe)) {
      return gitExe;
    }
  }
  return null;
}
function getAppLocalGitBashDir() {
  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    return require$$1.join(programData, "skillsfan", "git-bash");
  }
  return require$$1.join(electron.app.getPath("userData"), "git-bash");
}
function setGitBashPathEnv(path2) {
  process.env.CLAUDE_CODE_GIT_BASH_PATH = path2;
  console.log("[GitBash] Environment variable set:", path2);
}
function getShortPath(longPath) {
  if (process.platform !== "win32") return longPath;
  try {
    const result = child_process.execSync(`cmd /c for %A in ("${longPath}") do @echo %~sA`, {
      encoding: "utf8",
      windowsHide: true
    }).trim();
    return result || longPath;
  } catch {
    return longPath;
  }
}
const PORTABLE_GIT_VERSION = "2.47.1";
function getDownloadSources(arch) {
  const filename = `PortableGit-${PORTABLE_GIT_VERSION}-${arch}-bit.7z.exe`;
  const version = `v${PORTABLE_GIT_VERSION}.windows.1`;
  return [
    // China-friendly mirrors (faster in mainland)
    `https://registry.npmmirror.com/-/binary/git-for-windows/${version}/${filename}`,
    `https://mirrors.huaweicloud.com/git-for-windows/${version}/${filename}`,
    // GitHub as fallback (may be slow in China)
    `https://github.com/git-for-windows/git/releases/download/${version}/${filename}`
  ];
}
async function downloadAndInstallGitBash(onProgress) {
  const arch = process.arch === "x64" ? "64" : "32";
  const sources = getDownloadSources(arch);
  const tempDir = electron.app.getPath("temp");
  const tempFile = require$$1.join(tempDir, `PortableGit-${arch}.7z.exe`);
  const installDir = getAppLocalGitBashDir();
  try {
    onProgress({ phase: "downloading", progress: 0, message: "Connecting to download server..." });
    let downloaded = false;
    let lastError = "";
    for (let i = 0; i < sources.length; i++) {
      const url2 = sources[i];
      try {
        console.log(`[GitBash] Trying download source ${i + 1}/${sources.length}: ${url2}`);
        await downloadFile(url2, tempFile, (percent) => {
          onProgress({
            phase: "downloading",
            progress: percent,
            message: `Downloading command execution environment... ${percent}%`
          });
        });
        downloaded = true;
        console.log("[GitBash] Download completed successfully");
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.log(`[GitBash] Download source ${url2} failed: ${lastError}, trying next...`);
      }
    }
    if (!downloaded) {
      throw new Error(`All download sources failed: ${lastError}`);
    }
    onProgress({ phase: "extracting", progress: 0, message: "Installing..." });
    if (!fs$l.existsSync(installDir)) {
      fs$l.mkdirSync(installDir, { recursive: true });
    }
    const shortTempFile = getShortPath(tempFile);
    const shortInstallDir = getShortPath(installDir);
    console.log(`[GitBash] Extracting to: ${installDir}`);
    console.log(`[GitBash] Using short paths - temp: ${shortTempFile}, install: ${shortInstallDir}`);
    child_process.execSync(`"${shortTempFile}" -y -o"${shortInstallDir}"`, {
      windowsHide: true,
      timeout: 18e4
      // 3 minutes timeout for extraction
    });
    onProgress({ phase: "extracting", progress: 100, message: "Installation complete" });
    onProgress({ phase: "configuring", progress: 0, message: "Configuring environment..." });
    const bashPath = require$$1.join(installDir, "bin", "bash.exe");
    if (!fs$l.existsSync(bashPath)) {
      throw new Error("Installation completed but bash.exe not found, extraction may have failed");
    }
    try {
      fs$l.unlinkSync(tempFile);
      console.log("[GitBash] Temp file cleaned up");
    } catch {
    }
    onProgress({ phase: "done", progress: 100, message: "Initialization complete" });
    console.log(`[GitBash] Installation completed: ${bashPath}`);
    return { success: true, path: bashPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GitBash] Installation failed:", errorMsg);
    onProgress({
      phase: "error",
      progress: 0,
      message: "Initialization failed",
      error: errorMsg
    });
    try {
      if (fs$l.existsSync(tempFile)) fs$l.unlinkSync(tempFile);
    } catch {
    }
    return { success: false, error: errorMsg };
  }
}
function downloadFile(url2, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url2.startsWith("https") ? https : http;
    const request = protocol.get(url2, { timeout: 3e4 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`[GitBash] Following redirect to: ${redirectUrl}`);
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;
      const file2 = fs$l.createWriteStream(destPath);
      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round(downloadedSize / totalSize * 100);
          onProgress(percent);
        }
      });
      response.pipe(file2);
      file2.on("finish", () => {
        file2.close();
        resolve();
      });
      file2.on("error", (err) => {
        file2.close();
        reject(err);
      });
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Download timed out"));
    });
  });
}
const MOCK_BASH_MARKER = "mock-bash";
function createMockBash() {
  const mockDir = require$$1.join(electron.app.getPath("userData"), MOCK_BASH_MARKER, "bin");
  const mockBashPath = require$$1.join(mockDir, "bash.cmd");
  fs$l.mkdirSync(mockDir, { recursive: true });
  const mockScript = `@echo off
echo.
echo ============================================================
echo [HALO SYSTEM MESSAGE - COMMAND EXECUTION UNAVAILABLE]
echo ============================================================
echo.
echo The command execution environment (Git Bash) is not installed.
echo You have chosen to skip the installation during setup.
echo.
echo WHAT THIS MEANS:
echo - I cannot execute bash commands (git, npm, pip, etc.), Bash tool is disabled.
echo - I can read/write/grep/glob/edit by other Built-in tools
echo - I can only provide code suggestions and explanations
echo.
echo TO ENABLE FULL FUNCTIONALITY:
echo Please install Git for Windows from one of these sources:
echo.
echo Official Website:
echo   https://git-scm.com/downloads/win
echo.
echo China Mirror (Recommended for faster download):
echo   https://registry.npmmirror.com/-/binary/git-for-windows/
echo.
echo After installation, restart Halo to enable command execution.
echo ============================================================
echo.
exit /b 0
`;
  fs$l.writeFileSync(mockBashPath, mockScript, "utf-8");
  console.log("[MockBash] Created mock bash at:", mockBashPath);
  return mockBashPath;
}
function getMockBashDir() {
  return require$$1.join(electron.app.getPath("userData"), MOCK_BASH_MARKER);
}
function cleanupMockBash() {
  const mockDir = getMockBashDir();
  if (fs$l.existsSync(mockDir)) {
    try {
      const fs2 = require("fs");
      fs2.rmSync(mockDir, { recursive: true, force: true });
      console.log("[MockBash] Cleaned up mock bash directory");
    } catch (e) {
      console.error("[MockBash] Failed to cleanup:", e);
    }
  }
}
let mainWindow$1 = null;
function registerGitBashHandlers(window2) {
  mainWindow$1 = window2;
  electron.ipcMain.handle("git-bash:status", async () => {
    try {
      if (process.platform !== "win32") {
        return { success: true, data: { found: true, path: "/bin/bash", source: "system", mockMode: false } };
      }
      const config = getConfig();
      if (config.gitBash?.skipped) {
        return { success: true, data: { found: true, path: null, source: "mock", mockMode: true } };
      }
      if (config.gitBash?.installed && config.gitBash?.path) {
        return { success: true, data: { found: true, path: config.gitBash.path, source: "app-local", mockMode: false } };
      }
      const result = detectGitBash();
      return { success: true, data: { ...result, mockMode: false } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
  electron.ipcMain.handle("git-bash:install", async (_event, { progressChannel }) => {
    try {
      const result = await downloadAndInstallGitBash((progress) => {
        if (mainWindow$1 && !mainWindow$1.isDestroyed()) {
          mainWindow$1.webContents.send(progressChannel, progress);
        }
      });
      if (result.success && result.path) {
        setGitBashPathEnv(result.path);
        saveConfig({
          gitBash: {
            installed: true,
            path: result.path,
            skipped: false
          }
        });
        cleanupMockBash();
        console.log("[GitBash] Installation completed, path saved to config");
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
  electron.ipcMain.handle("shell:open-external", async (_event, url2) => {
    if (process.platform === "win32") {
      const { exec } = require("child_process");
      exec(`start "" "${url2}"`);
    } else {
      await electron.shell.openExternal(url2);
    }
  });
}
async function initializeGitBashOnStartup() {
  if (process.platform !== "win32") {
    return { available: true, needsSetup: false, mockMode: false, path: "/bin/bash" };
  }
  const { existsSync } = require("fs");
  const config = getConfig();
  if (config.gitBash?.installed && config.gitBash?.path) {
    const savedPath = config.gitBash.path;
    if (existsSync(savedPath)) {
      setGitBashPathEnv(savedPath);
      console.log("[GitBash] Using saved path:", savedPath);
      return { available: true, needsSetup: false, mockMode: false, path: savedPath };
    } else {
      console.log("[GitBash] Saved path no longer exists:", savedPath);
      saveConfig({
        gitBash: {
          installed: false,
          path: null,
          skipped: false
        }
      });
      console.log("[GitBash] Cleared stale config, will re-detect");
    }
  }
  if (config.gitBash?.skipped) {
    const mockPath = createMockBash();
    setGitBashPathEnv(mockPath);
    console.log("[GitBash] Mock mode active (user skipped)");
    return { available: true, needsSetup: false, mockMode: true, path: mockPath };
  }
  const detection = detectGitBash();
  if (detection.found && detection.path) {
    setGitBashPathEnv(detection.path);
    saveConfig({
      gitBash: {
        installed: true,
        path: detection.path,
        skipped: false
      }
    });
    console.log("[GitBash] Detected system Git Bash:", detection.path);
    return { available: true, needsSetup: false, mockMode: false, path: detection.path };
  }
  console.log("[GitBash] Not found, setup required");
  return { available: false, needsSetup: true, mockMode: false, path: null, configCleared: true };
}
const FRONTMATTER_RE = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
function stripBom(input) {
  return input.replace(/^\uFEFF/, "");
}
function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function readBlock(lines, startIndex) {
  const block = [];
  let indent;
  let i = startIndex;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (indent === void 0) {
      if (line.trim() === "") {
        block.push("");
        continue;
      }
      indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    }
    if (line.trim() === "") {
      block.push("");
      continue;
    }
    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (lineIndent < (indent ?? 0)) break;
    block.push(line.slice(indent));
  }
  return { block, nextIndex: i - 1 };
}
function foldBlock(lines) {
  const parts = [];
  let current = "";
  for (const line of lines) {
    if (line === "") {
      if (current) {
        parts.push(current);
        current = "";
      }
      parts.push("");
      continue;
    }
    if (current) current += ` ${line}`;
    else current = line;
  }
  if (current) parts.push(current);
  return parts.join("\n");
}
function parseYamlFrontmatter(yaml) {
  const data = {};
  const lines = yaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const match = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    let value = match[2].trim();
    if (value.startsWith("|") || value.startsWith(">")) {
      const { block, nextIndex } = readBlock(lines, i + 1);
      i = nextIndex;
      value = value.startsWith(">") ? foldBlock(block).trim() : block.join("\n").trim();
    } else if (value === "" && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
      const { block, nextIndex } = readBlock(lines, i + 1);
      i = nextIndex;
      value = foldBlock(block).trim();
    } else {
      value = stripQuotes(value);
    }
    data[key] = value;
  }
  return data;
}
function parseFrontmatter$1(content) {
  const normalized = stripBom(content);
  const match = normalized.match(FRONTMATTER_RE);
  if (!match) return null;
  const data = parseYamlFrontmatter(match[1]);
  const body = normalized.slice(match[0].length).trim();
  return { data, body };
}
function extractH1Title(content) {
  const body = content.replace(/^\s*---[\s\S]*?---\s*(?:\r?\n|$)/, "");
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
function extractDescription(content, fallbackName) {
  const fmMatch = content.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m);
    if (descMatch) return descMatch[1].trim();
  }
  const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content.trim();
  const firstLine = body.split("\n")[0];
  if (firstLine?.startsWith("#")) {
    return firstLine.replace(/^#+\s*/, "").trim();
  }
  const lines = body.split("\n").filter((l) => l.trim());
  if (lines.length > 0) {
    const desc = lines[0].trim();
    return desc.length > 100 ? desc.slice(0, 100) + "..." : desc;
  }
  return `Custom command: ${fallbackName}`;
}
function loadSkillsFromDir(skillsDir, source) {
  const skills = [];
  if (!fs$l.existsSync(skillsDir)) {
    return skills;
  }
  let entries;
  try {
    entries = fs$l.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return skills;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillFile = require$$1.join(skillsDir, entry.name, "SKILL.md");
    if (!fs$l.existsSync(skillFile)) continue;
    try {
      const content = fs$l.readFileSync(skillFile, "utf-8");
      const parsed = parseFrontmatter$1(content);
      if (!parsed?.data.name || !parsed?.data.description) {
        console.warn(`[Skill] Missing name or description: ${skillFile}`);
        continue;
      }
      const displayName = extractH1Title(parsed.body) || parsed.data.name;
      const skillDir = require$$1.dirname(skillFile);
      const files = listFilesRecursive$1(skillDir, "");
      const fileContents = {};
      for (const f of files) {
        try {
          fileContents[f] = fs$l.readFileSync(require$$1.join(skillDir, f), "utf-8");
        } catch {
        }
      }
      skills.push({
        name: parsed.data.name,
        displayName,
        description: parsed.data.description,
        icon: parsed.data.icon || void 0,
        location: skillFile,
        baseDir: skillDir,
        source,
        readonly: source.kind !== "skillsfan",
        files,
        fileContents
      });
      console.log(`[Skill] Loaded: ${parsed.data.name} (${source.kind})`);
    } catch (err) {
      console.error(`[Skill] Failed to load: ${skillFile}`, err);
    }
  }
  return skills;
}
function loadClaudeCommands(commandsDir, source) {
  const skills = [];
  if (!fs$l.existsSync(commandsDir)) return skills;
  let entries;
  try {
    entries = fs$l.readdirSync(commandsDir);
  } catch {
    return skills;
  }
  for (const file2 of entries) {
    if (!file2.endsWith(".md")) continue;
    const filePath = require$$1.join(commandsDir, file2);
    try {
      const stat2 = fs$l.statSync(filePath);
      if (!stat2.isFile()) continue;
      const content = fs$l.readFileSync(filePath, "utf-8");
      const name = require$$1.basename(file2, ".md");
      const description = extractDescription(content, name);
      const displayName = extractH1Title(content) || name;
      skills.push({
        name,
        displayName,
        description,
        location: filePath,
        baseDir: commandsDir,
        source,
        readonly: true,
        // Claude Code native commands are read-only
        files: [file2],
        fileContents: { [file2]: content }
      });
      console.log(`[Skill] Loaded command: ${name} (${source.kind})`);
    } catch (err) {
      console.error(`[Skill] Failed to load command: ${filePath}`, err);
    }
  }
  return skills;
}
function getSkillContent(location) {
  const content = fs$l.readFileSync(location, "utf-8");
  const parsed = parseFrontmatter$1(content);
  return parsed?.body || content;
}
function listFilesRecursive$1(dir, prefix) {
  const results = [];
  let entries;
  try {
    entries = fs$l.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive$1(require$$1.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results.sort();
}
function getClaudeSkillsDir() {
  return require$$1.join(require$$1$1.homedir(), ".claude", "skills");
}
function getLegacySkillsfanDirs() {
  const home = require$$1$1.homedir();
  return Array.from(/* @__PURE__ */ new Set([
    require$$1.join(home, ".skillsfan", "skills"),
    require$$1.join(home, ".skillsfan-dev", "skills")
  ]));
}
function pathExists(path2) {
  try {
    fs$l.lstatSync(path2);
    return true;
  } catch {
    return false;
  }
}
function isDirectoryLike(path2) {
  try {
    return fs$l.statSync(path2).isDirectory();
  } catch {
    return false;
  }
}
function listSkillDirs(baseDir) {
  if (!fs$l.existsSync(baseDir)) return [];
  try {
    return fs$l.readdirSync(baseDir, { withFileTypes: true }).filter((entry) => {
      const entryPath = require$$1.join(baseDir, entry.name);
      if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
      if (!isDirectoryLike(entryPath)) return false;
      return fs$l.existsSync(require$$1.join(entryPath, "SKILL.md"));
    }).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
function listFilesRecursive(dir, prefix = "") {
  let entries;
  try {
    entries = fs$l.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const absPath = require$$1.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if ((entry.isDirectory() || entry.isSymbolicLink()) && isDirectoryLike(absPath)) {
      files.push(...listFilesRecursive(absPath, relPath));
      continue;
    }
    files.push(relPath);
  }
  return files.sort();
}
function fingerprintSkillDir(skillDir) {
  const hash = crypto.createHash("sha1");
  for (const relPath of listFilesRecursive(skillDir)) {
    hash.update(relPath);
    hash.update(fs$l.readFileSync(require$$1.join(skillDir, relPath)));
  }
  return hash.digest("hex");
}
function getSkillMtimeMs(skillDir) {
  try {
    return fs$l.statSync(require$$1.join(skillDir, "SKILL.md")).mtimeMs;
  } catch {
    try {
      return fs$l.statSync(skillDir).mtimeMs;
    } catch {
      return 0;
    }
  }
}
function normalizePath(path2) {
  try {
    return fs$l.realpathSync(path2);
  } catch {
    return require$$1.resolve(path2);
  }
}
function isPathInsideDir(path2, baseDir) {
  const normalizedPath = normalizePath(path2);
  const normalizedBaseDir = normalizePath(baseDir);
  return normalizedPath === normalizedBaseDir || normalizedPath.startsWith(`${normalizedBaseDir}${process.platform === "win32" ? "\\" : "/"}`);
}
function isLegacyOwnedSymlink(path2, legacyDirs) {
  try {
    if (!fs$l.lstatSync(path2).isSymbolicLink()) return false;
    const target = fs$l.realpathSync(path2);
    return legacyDirs.some((legacyDir) => isPathInsideDir(target, legacyDir));
  } catch {
    return false;
  }
}
function removeEmptyLegacyDirs(legacyDirs, result) {
  for (const legacyDir of legacyDirs) {
    if (!fs$l.existsSync(legacyDir)) continue;
    let entries;
    try {
      entries = fs$l.readdirSync(legacyDir).filter((name) => name !== ".DS_Store" && !name.startsWith("."));
    } catch {
      continue;
    }
    if (entries.length > 0) continue;
    try {
      fs$l.rmSync(legacyDir, { recursive: true, force: true });
      result.removedLegacyDirs.push(legacyDir);
    } catch {
    }
  }
}
function removeLegacySkill(skillName, skillPath, result) {
  try {
    fs$l.rmSync(skillPath, { recursive: true, force: true });
    result.removedLegacySkills.push(skillName);
  } catch (error) {
    result.skipped.push({
      skillName,
      path: skillPath,
      reason: `Failed to remove legacy copy: ${error.message}`
    });
  }
}
function materializeLegacySymlink(skillName, nativePath, result) {
  const tempPath = `${nativePath}.migrating-${Date.now()}`;
  const targetPath = fs$l.realpathSync(nativePath);
  fs$l.cpSync(targetPath, tempPath, { recursive: true, dereference: true, force: true });
  fs$l.rmSync(nativePath, { recursive: true, force: true });
  fs$l.renameSync(tempPath, nativePath);
  result.materialized.push(skillName);
}
function migrateLegacySkillsToClaudeDir() {
  const claudeSkillsDir = getClaudeSkillsDir();
  const legacyDirs = getLegacySkillsfanDirs();
  const result = {
    migrated: [],
    materialized: [],
    removedLegacySkills: [],
    removedLegacyDirs: [],
    skipped: []
  };
  fs$l.mkdirSync(claudeSkillsDir, { recursive: true });
  for (const skillName of listSkillDirs(claudeSkillsDir)) {
    const nativePath = require$$1.join(claudeSkillsDir, skillName);
    if (!isLegacyOwnedSymlink(nativePath, legacyDirs)) continue;
    try {
      materializeLegacySymlink(skillName, nativePath, result);
    } catch (error) {
      result.skipped.push({
        skillName,
        path: nativePath,
        reason: `Failed to materialize legacy symlink: ${error.message}`
      });
    }
  }
  const legacyCandidates = /* @__PURE__ */ new Map();
  for (const legacyDir of legacyDirs) {
    for (const skillName of listSkillDirs(legacyDir)) {
      const skillPath = require$$1.join(legacyDir, skillName);
      try {
        const fingerprint = fingerprintSkillDir(skillPath);
        const candidate = {
          path: skillPath,
          fingerprint,
          mtimeMs: getSkillMtimeMs(skillPath)
        };
        const existing = legacyCandidates.get(skillName) || [];
        existing.push(candidate);
        legacyCandidates.set(skillName, existing);
      } catch (error) {
        result.skipped.push({
          skillName,
          path: skillPath,
          reason: `Failed to inspect legacy skill: ${error.message}`
        });
      }
    }
  }
  for (const [skillName, candidates] of Array.from(legacyCandidates.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const nativePath = require$$1.join(claudeSkillsDir, skillName);
    let nativeFingerprint;
    if (pathExists(nativePath)) {
      try {
        nativeFingerprint = fingerprintSkillDir(nativePath);
      } catch (error) {
        result.skipped.push({
          skillName,
          path: nativePath,
          reason: `Failed to inspect native skill: ${error.message}`
        });
        continue;
      }
    } else {
      const chosen = [...candidates].sort((left, right) => {
        if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
        return left.path.localeCompare(right.path);
      })[0];
      try {
        fs$l.cpSync(chosen.path, nativePath, { recursive: true, dereference: true, force: true });
        nativeFingerprint = chosen.fingerprint;
        result.migrated.push(skillName);
      } catch (error) {
        result.skipped.push({
          skillName,
          path: chosen.path,
          reason: `Failed to migrate legacy skill: ${error.message}`
        });
        continue;
      }
    }
    for (const candidate of candidates) {
      if (candidate.fingerprint !== nativeFingerprint) {
        result.skipped.push({
          skillName,
          path: candidate.path,
          reason: "Legacy copy differs from the native Claude skill and was kept untouched"
        });
        continue;
      }
      removeLegacySkill(skillName, candidate.path, result);
    }
  }
  removeEmptyLegacyDirs(legacyDirs, result);
  if (result.migrated.length > 0 || result.materialized.length > 0 || result.removedLegacySkills.length > 0 || result.removedLegacyDirs.length > 0 || result.skipped.length > 0) {
    console.log("[Skill] Legacy migration result:", result);
  }
  return result;
}
const skillCache = /* @__PURE__ */ new Map();
let initialized = false;
function getSkillsDir() {
  return getClaudeSkillsDir();
}
async function initializeRegistry(spaceWorkDir) {
  if (initialized) return;
  migrateLegacySkillsToClaudeDir();
  const home = require$$1$1.homedir();
  const seenNames = /* @__PURE__ */ new Set();
  function addSkills(skills) {
    for (const skill of skills) {
      if (!seenNames.has(skill.name)) {
        seenNames.add(skill.name);
        skillCache.set(skill.name, skill);
      }
    }
  }
  const managedSkillsDir = getSkillsDir();
  if (fs$l.existsSync(managedSkillsDir)) {
    addSkills(loadSkillsFromDir(managedSkillsDir, { kind: "skillsfan" }));
  }
  const globalCmdsDir = require$$1.join(home, ".claude", "commands");
  addSkills(loadClaudeCommands(globalCmdsDir, { kind: "global-commands" }));
  const agentsSkillsDir = require$$1.join(home, ".agents", "skills");
  if (fs$l.existsSync(agentsSkillsDir)) {
    addSkills(loadSkillsFromDir(agentsSkillsDir, { kind: "agents-skills" }));
  }
  console.log(`[Skill] Initialized: ${skillCache.size} skills (${countSources()})`);
  initialized = true;
}
function countSources() {
  const sources = /* @__PURE__ */ new Map();
  for (const skill of skillCache.values()) {
    const kind = skill.source.kind;
    sources.set(kind, (sources.get(kind) || 0) + 1);
  }
  return Array.from(sources.entries()).map(([k, v]) => `${k}:${v}`).join(", ");
}
async function ensureInitialized() {
  if (!initialized) {
    await initializeRegistry();
  }
}
async function getAllSkills() {
  await ensureInitialized();
  return Array.from(skillCache.values());
}
function getSkill(name) {
  return skillCache.get(name);
}
async function reloadSkills(spaceWorkDir) {
  skillCache.clear();
  initialized = false;
  await initializeRegistry();
  return Array.from(skillCache.values());
}
function invalidateSkillsCache() {
  skillCache.clear();
  initialized = false;
}
let watchers = [];
let debounceTimer = null;
function shouldReloadForEvent(eventType, filename) {
  if (eventType === "rename") {
    return true;
  }
  if (!filename) {
    return true;
  }
  const normalized = String(filename).replace(/\\/g, "/");
  return normalized.endsWith(".md") || normalized.includes("SKILL.md");
}
function startSkillWatcher() {
  stopSkillWatcher();
  const home = require$$1$1.homedir();
  const managedSkillsDir = getSkillsDir();
  const dirsToWatch = [
    managedSkillsDir,
    // ~/.claude/skills/
    require$$1.join(home, ".claude", "commands"),
    // ~/.claude/commands/
    require$$1.join(home, ".agents", "skills")
    // ~/.agents/skills/
  ];
  const dirsToEnsure = /* @__PURE__ */ new Set([managedSkillsDir]);
  for (const dir of dirsToWatch) {
    if (!fs$l.existsSync(dir)) {
      if (dirsToEnsure.has(dir)) {
        try {
          fs$l.mkdirSync(dir, { recursive: true });
          console.log(`[Skill] Created skills directory: ${dir}`);
        } catch (err) {
          console.error(`[Skill] Failed to create skills directory:`, err);
          continue;
        }
      } else {
        continue;
      }
    }
    try {
      const watcher2 = fs$l.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!shouldReloadForEvent(eventType, filename)) return;
        console.log(`[Skill] Detected change in ${dir}: ${eventType} ${filename}`);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          await reloadSkills();
          console.log(`[Skill] Hot-reloaded skills from all sources`);
        }, 500);
      });
      watchers.push(watcher2);
      console.log(`[Skill] Watching: ${dir}`);
    } catch (err) {
      console.warn(`[Skill] Failed to watch ${dir}:`, err);
    }
  }
}
function stopSkillWatcher() {
  for (const watcher2 of watchers) {
    watcher2.close();
  }
  watchers = [];
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
class SkillValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkillValidationError";
  }
}
function validateSkillStructure(extractedPath) {
  const skillMdPath = require$$1.join(extractedPath, "SKILL.md");
  if (!fs$l.existsSync(skillMdPath)) {
    return { valid: false, error: "SKILL.md file not found" };
  }
  try {
    const content = fs$l.readFileSync(skillMdPath, "utf-8");
    const parsed = parseFrontmatter$1(content);
    if (!parsed) {
      return { valid: false, error: "SKILL.md missing frontmatter (--- ... ---)" };
    }
    const data = parsed.data;
    if (!data.name) {
      return { valid: false, error: "SKILL.md missing required field: name" };
    }
    if (!data.description) {
      return { valid: false, error: "SKILL.md missing required field: description" };
    }
    return { valid: true, skillName: data.name };
  } catch (err) {
    return { valid: false, error: `Failed to parse SKILL.md: ${err.message}` };
  }
}
function generateUniqueSkillName(baseName, skillsDir) {
  let counter = 1;
  let newName = baseName;
  while (fs$l.existsSync(require$$1.join(skillsDir, newName))) {
    newName = `${baseName}-${counter}`;
    counter++;
  }
  return newName;
}
function extractArchive(archivePath) {
  const tempDir = fs$l.mkdtempSync(require$$1.join(require$$1$1.tmpdir(), "skillsfan-skill-"));
  try {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(tempDir, true);
    const entries = fs$l.readdirSync(tempDir).filter(
      (name) => name !== "__MACOSX" && !name.startsWith(".")
    );
    if (entries.length === 1 && fs$l.statSync(require$$1.join(tempDir, entries[0])).isDirectory()) {
      return require$$1.join(tempDir, entries[0]);
    }
    return tempDir;
  } catch (err) {
    fs$l.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to extract archive: ${err.message}`);
  }
}
function copyDirectory(src, dest) {
  if (!fs$l.existsSync(dest)) {
    fs$l.mkdirSync(dest, { recursive: true });
  }
  const entries = fs$l.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = require$$1.join(src, entry.name);
    const destPath = require$$1.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs$l.copyFileSync(srcPath, destPath);
    }
  }
}
function rewriteSkillNameInFrontmatter(content, nextSkillName) {
  const frontmatterMatch = content.match(/^(\s*---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))/);
  if (!frontmatterMatch) return content;
  const lines = frontmatterMatch[2].split(/\r?\n/);
  let replaced = false;
  const updatedLines = lines.map((line) => {
    if (/^\s*name\s*:/.test(line)) {
      replaced = true;
      return `name: ${nextSkillName}`;
    }
    return line;
  });
  if (!replaced) {
    updatedLines.unshift(`name: ${nextSkillName}`);
  }
  return frontmatterMatch[1] + updatedLines.join("\n") + frontmatterMatch[3] + content.slice(frontmatterMatch[0].length);
}
function refreshSkillRuntimeState() {
  invalidateSkillsCache();
}
async function installSkill(archivePath, conflictResolution) {
  let tempDir = null;
  let originalTempDir = null;
  try {
    tempDir = extractArchive(archivePath);
    originalTempDir = require$$1.dirname(tempDir) === require$$1$1.tmpdir() ? tempDir : require$$1.dirname(tempDir);
    const validation = validateSkillStructure(tempDir);
    if (!validation.valid) {
      throw new SkillValidationError(validation.error || "Invalid skill structure");
    }
    const skillName = validation.skillName;
    const skillsDir = getSkillsDir();
    const targetPath = require$$1.join(skillsDir, skillName);
    if (fs$l.existsSync(targetPath)) {
      if (!conflictResolution) {
        return {
          success: false,
          conflict: { skillName, existingPath: targetPath }
        };
      }
      if (conflictResolution === "cancel") {
        return { success: false, error: "Installation cancelled by user" };
      } else if (conflictResolution === "replace") {
        fs$l.rmSync(targetPath, { recursive: true, force: true });
      } else if (conflictResolution === "rename") {
        const uniqueName = generateUniqueSkillName(skillName, skillsDir);
        const uniquePath = require$$1.join(skillsDir, uniqueName);
        if (!fs$l.existsSync(skillsDir)) {
          fs$l.mkdirSync(skillsDir, { recursive: true });
        }
        copyDirectory(tempDir, uniquePath);
        const originalSkillMd = fs$l.readFileSync(require$$1.join(tempDir, "SKILL.md"), "utf-8");
        fs$l.writeFileSync(
          require$$1.join(uniquePath, "SKILL.md"),
          rewriteSkillNameInFrontmatter(originalSkillMd, uniqueName),
          "utf-8"
        );
        refreshSkillRuntimeState();
        return {
          success: true,
          data: { skillName: uniqueName, path: uniquePath }
        };
      }
    }
    if (!fs$l.existsSync(skillsDir)) {
      fs$l.mkdirSync(skillsDir, { recursive: true });
    }
    copyDirectory(tempDir, targetPath);
    refreshSkillRuntimeState();
    return {
      success: true,
      data: { skillName, path: targetPath }
    };
  } catch (err) {
    const error = err;
    return {
      success: false,
      error: error.message
    };
  } finally {
    const dirToCleanup = originalTempDir || tempDir;
    if (dirToCleanup && fs$l.existsSync(dirToCleanup)) {
      try {
        fs$l.rmSync(dirToCleanup, { recursive: true, force: true });
      } catch {
        console.warn(`[Skill] Failed to cleanup temp directory: ${dirToCleanup}`);
      }
    }
  }
}
function deleteSkill(skillName) {
  try {
    const skillsDir = getSkillsDir();
    const skillPath = require$$1.join(skillsDir, skillName);
    if (!fs$l.existsSync(skillPath)) {
      return { success: false, error: "Skill not found" };
    }
    fs$l.rmSync(skillPath, { recursive: true, force: true });
    refreshSkillRuntimeState();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete skill: ${err.message}`
    };
  }
}
async function openSkillFolder(skillName) {
  try {
    const skill = getSkill(skillName);
    if (skill) {
      const skillPath2 = skill.baseDir;
      if (fs$l.existsSync(skillPath2)) {
        const error2 = await electron.shell.openPath(skillPath2);
        if (error2) {
          return { success: false, error: error2 };
        }
        return { success: true };
      }
    }
    const skillsDir = getSkillsDir();
    const skillPath = require$$1.join(skillsDir, skillName);
    if (!fs$l.existsSync(skillPath)) {
      return { success: false, error: "Skill folder not found" };
    }
    const error = await electron.shell.openPath(skillPath);
    if (error) {
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to open folder: ${err.message}`
    };
  }
}
function saveSkillContent(skillName, content) {
  try {
    const skillsDir = getSkillsDir();
    const skillDir = require$$1.join(skillsDir, skillName);
    if (!fs$l.existsSync(skillsDir)) {
      fs$l.mkdirSync(skillsDir, { recursive: true });
    }
    if (!fs$l.existsSync(skillDir)) {
      fs$l.mkdirSync(skillDir, { recursive: true });
    }
    fs$l.writeFileSync(require$$1.join(skillDir, "SKILL.md"), content, "utf-8");
    refreshSkillRuntimeState();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save skill: ${err.message}`
    };
  }
}
function updateSkillIcon(skillName, iconName) {
  try {
    const skill = getSkill(skillName);
    if (!skill) return { success: false, error: "Skill not found" };
    if (skill.readonly) return { success: false, error: "Cannot modify read-only skill" };
    const content = fs$l.readFileSync(skill.location, "utf-8");
    const parsed = parseFrontmatter$1(content);
    if (!parsed) return { success: false, error: "Invalid SKILL.md format" };
    const fmMatch = content.match(/^(\s*---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))/);
    if (!fmMatch) return { success: false, error: "No frontmatter found" };
    const fmContent = fmMatch[2];
    const fmLines = fmContent.split(/\r?\n/);
    let hasIcon = false;
    const newFmLines = fmLines.map((line) => {
      if (line.match(/^\s*icon\s*:/)) {
        hasIcon = true;
        return `icon: ${iconName}`;
      }
      return line;
    });
    if (!hasIcon) {
      const descIdx = newFmLines.findIndex((l) => l.match(/^\s*description\s*:/));
      if (descIdx >= 0) {
        newFmLines.splice(descIdx + 1, 0, `icon: ${iconName}`);
      } else {
        newFmLines.push(`icon: ${iconName}`);
      }
    }
    const newContent = fmMatch[1] + newFmLines.join("\n") + fmMatch[3] + parsed.body;
    fs$l.writeFileSync(skill.location, newContent, "utf-8");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update icon: ${err.message}`
    };
  }
}
async function selectSkillArchive() {
  try {
    const result = await electron.dialog.showOpenDialog({
      title: "Select Skill Archive",
      properties: ["openFile"],
      filters: [
        { name: "Skill Archives", extensions: ["zip", "skill"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: void 0 };
    }
    return { success: true, data: result.filePaths[0] };
  } catch (err) {
    return {
      success: false,
      error: `Failed to open file picker: ${err.message}`
    };
  }
}
function buildSkillCreatorPrompt(formData) {
  const parts = [];
  parts.push("<skill-creator-mode>");
  parts.push("Generate a complete SKILL.md file based on the user's input below.");
  parts.push("");
  parts.push("## User Input");
  parts.push(`- **What it does**: ${formData.whatItDoes}`);
  if (formData.whenToTrigger) {
    parts.push(`- **When to trigger**: ${formData.whenToTrigger}`);
  }
  if (formData.skillName) {
    parts.push(`- **Preferred name**: ${formData.skillName}`);
  }
  parts.push("");
  parts.push("## Output Requirements");
  parts.push("");
  parts.push("Output the COMPLETE SKILL.md content inside a single markdown code block like this:");
  parts.push("");
  parts.push("```markdown");
  parts.push("---");
  parts.push("name: skill-name-here");
  parts.push("description: Trigger description here");
  parts.push("---");
  parts.push("");
  parts.push("# Skill Title");
  parts.push("(instructions here)");
  parts.push("```");
  parts.push("");
  parts.push("## Rules");
  parts.push("");
  parts.push('- **name**: lowercase English with hyphens (e.g., "code-review", "api-design")');
  parts.push("- **description**: This is the PRIMARY triggering mechanism. Write it to be specific and action-oriented.");
  parts.push("  Include both what the skill does AND specific scenarios when to use it.");
  parts.push('  Make it slightly "pushy" to ensure the skill triggers reliably.');
  parts.push('  Example: "Review code for bugs, security issues, and best practices. Use when the user asks for code review, PR review, code quality feedback, or mentions reviewing changes."');
  parts.push("- **body**: Write practical, actionable instructions. Explain WHY things matter, not just WHAT to do.");
  parts.push("  Use imperative form. Include examples where helpful.");
  parts.push("  Keep under 500 lines. Structure clearly with headers.");
  parts.push("- Output ONLY the markdown code block. No additional explanation before or after.");
  parts.push("</skill-creator-mode>");
  return parts.join("\n");
}
function resolveSkillCreatorPrompt(_skillsDir) {
  return buildSkillCreatorPrompt({
    whatItDoes: "{whatItDoes}",
    whenToTrigger: "{whenToTrigger}",
    skillName: "{skillName}"
  });
}
const BUILTIN_COMMANDS = [
  {
    name: "clear",
    description: "Clear conversation history",
    type: "immediate",
    source: { kind: "builtin" }
  },
  {
    name: "cost",
    description: "Show token usage statistics",
    type: "immediate",
    source: { kind: "builtin" }
  },
  {
    name: "help",
    description: "Show available commands",
    type: "immediate",
    source: { kind: "builtin" }
  },
  {
    name: "compact",
    description: "Compress conversation context",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Please compress and summarize our conversation so far, keeping key context and decisions."
  },
  {
    name: "doctor",
    description: "Diagnose project health",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Analyze this project's health: check for outdated dependencies, security vulnerabilities, code quality issues, and configuration problems. Provide a summary report with actionable recommendations."
  },
  {
    name: "init",
    description: "Initialize CLAUDE.md for project",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Create or update a CLAUDE.md file for this project. Analyze the codebase structure, tech stack, key patterns, and development commands, then generate a comprehensive CLAUDE.md."
  },
  {
    name: "review",
    description: "Review code quality",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Review the recent code changes in this project. Focus on: code quality, potential bugs, performance issues, security concerns, and adherence to project conventions. Provide specific, actionable feedback."
  },
  {
    name: "memory",
    description: "Edit project memory file",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Review and update the project memory file (MEMORY.md). Read the current MEMORY.md (create if it doesn't exist), then check if there are new patterns, decisions, conventions, or important context from our work. Also review memory/*.md files if they exist."
  },
  {
    name: "terminal-setup",
    description: "Configure terminal settings",
    type: "prompt",
    source: { kind: "builtin" },
    content: "Analyze my current terminal setup and suggest improvements for working with this project. Check shell configuration, useful aliases, and tool installations."
  }
];
function scanClaudeCommands(dir, source) {
  const commands = [];
  if (!fs__namespace$1.existsSync(dir)) return commands;
  try {
    const files = fs__namespace$1.readdirSync(dir);
    for (const file2 of files) {
      if (!file2.endsWith(".md")) continue;
      const filePath = require$$1__namespace$1.join(dir, file2);
      const stat2 = fs__namespace$1.statSync(filePath);
      if (!stat2.isFile()) continue;
      const name = file2.replace(/\.md$/, "");
      const content = fs__namespace$1.readFileSync(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
      const description = firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "") : `Custom command: ${name}`;
      commands.push({
        name,
        description,
        type: "skill",
        source,
        content,
        filePath
      });
    }
  } catch {
  }
  return commands;
}
function scanSkillMdDirs(baseDir, source) {
  const skills = [];
  if (!fs__namespace$1.existsSync(baseDir)) return skills;
  try {
    const dirs = fs__namespace$1.readdirSync(baseDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
      const skillMdPath = require$$1__namespace$1.join(baseDir, dir.name, "SKILL.md");
      if (!fs__namespace$1.existsSync(skillMdPath)) continue;
      const content = fs__namespace$1.readFileSync(skillMdPath, "utf-8");
      const frontmatter = parseFrontmatter(content);
      skills.push({
        name: frontmatter.name || dir.name,
        description: frontmatter.description || `Skill: ${dir.name}`,
        type: "skill",
        source,
        content: content.replace(/^---[\s\S]*?---\n*/, ""),
        // Remove frontmatter
        filePath: skillMdPath
      });
    }
  } catch {
  }
  return skills;
}
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim() || yaml.match(/^description:\s*\|\n([\s\S]*?)(?=\n\w|\n---)/m)?.[1]?.trim();
  return { name, description };
}
async function listSlashCommands(spaceId) {
  const homeDir = require$$1__namespace.homedir();
  const allCommands = [...BUILTIN_COMMANDS];
  const seenNames = new Set(BUILTIN_COMMANDS.map((c) => c.name));
  if (spaceId) {
    const space = getSpace(spaceId);
    if (space && !space.isTemp) {
      const projectDir = require$$1__namespace$1.join(space.path, ".claude", "commands");
      const projectCmds = scanClaudeCommands(projectDir, { kind: "project", dir: projectDir });
      for (const cmd of projectCmds) {
        if (!seenNames.has(cmd.name)) {
          seenNames.add(cmd.name);
          allCommands.push(cmd);
        }
      }
    }
  }
  const globalDir = require$$1__namespace$1.join(homeDir, ".claude", "commands");
  const globalCmds = scanClaudeCommands(globalDir, { kind: "global" });
  for (const cmd of globalCmds) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name);
      allCommands.push(cmd);
    }
  }
  const skillsDir = getSkillsDir();
  const managedSkills = scanSkillMdDirs(skillsDir, { kind: "skillsfan" });
  for (const cmd of managedSkills) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name);
      allCommands.push(cmd);
    }
  }
  const agentsSkillsDir = require$$1__namespace$1.join(homeDir, ".agents", "skills");
  const agentsSkills = scanSkillMdDirs(agentsSkillsDir, { kind: "agents-skills" });
  for (const cmd of agentsSkills) {
    if (!seenNames.has(cmd.name)) {
      seenNames.add(cmd.name);
      allCommands.push(cmd);
    }
  }
  return allCommands;
}
function registerSkillHandlers() {
  ipcHandle("skill:list", () => getAllSkills());
  ipcHandle("skill:reload", () => reloadSkills());
  ipcHandle("skill:get-dir", () => getSkillsDir());
  electron.ipcMain.handle("skill:select-archive", () => selectSkillArchive());
  electron.ipcMain.handle(
    "skill:install",
    (_e, archivePath, conflictResolution) => installSkill(archivePath, conflictResolution)
  );
  electron.ipcMain.handle("skill:delete", (_e, skillName) => deleteSkill(skillName));
  electron.ipcMain.handle("skill:open-folder", (_e, skillName) => openSkillFolder(skillName));
  ipcHandle("skill:get-content", (_e, skillName) => {
    const skill = getSkill(skillName);
    if (!skill) throw new Error("Skill not found");
    return getSkillContent(skill.location);
  });
  electron.ipcMain.handle("skill:get-file-content", async (_event, skillName, relativePath) => {
    try {
      const skill = getSkill(skillName);
      if (!skill) return { success: false, error: "Skill not found" };
      let fullPath;
      if (skill.source.kind === "project-commands" || skill.source.kind === "global-commands") {
        fullPath = skill.location;
      } else {
        fullPath = require$$1.resolve(skill.baseDir, relativePath);
        if (!fullPath.startsWith(require$$1.resolve(skill.baseDir))) {
          return { success: false, error: "Invalid file path" };
        }
      }
      const content = fs$l.readFileSync(fullPath, "utf-8");
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  ipcHandle("skill:list-slash-commands", (_e, spaceId) => listSlashCommands(spaceId));
  ipcHandle("skill:get-creator-prompt", () => {
    const skillsDir = getSkillsDir();
    return resolveSkillCreatorPrompt(skillsDir);
  });
  electron.ipcMain.handle(
    "skill:save-content",
    (_e, skillName, content) => saveSkillContent(skillName, content)
  );
  electron.ipcMain.handle(
    "skill:update-icon",
    (_e, skillName, iconName) => updateSkillIcon(skillName, iconName)
  );
}
function getExtensionsDir() {
  return require$$1.join(getHaloDir(), "extensions");
}
function loadExtension(extensionDir) {
  const manifestPath = require$$1.join(extensionDir, "extension.json");
  if (!fs$l.existsSync(manifestPath)) {
    console.warn(`[Extension] No extension.json in ${extensionDir}, skipping`);
    return null;
  }
  let manifest;
  try {
    const raw = fs$l.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch (error) {
    console.error(`[Extension] Failed to parse manifest in ${extensionDir}:`, error);
    return null;
  }
  if (!manifest.id || !manifest.name || !manifest.version) {
    console.error(`[Extension] Invalid manifest in ${extensionDir}: missing id, name, or version`);
    return null;
  }
  const entryFile = manifest.main || "index.js";
  const entryPath = require$$1.join(extensionDir, entryFile);
  if (!fs$l.existsSync(entryPath)) {
    console.error(`[Extension] Entry point not found: ${entryPath}`);
    return null;
  }
  let hooks;
  try {
    const module2 = require(entryPath);
    hooks = module2.default || module2;
    const validHookNames = [
      "onBuildSystemPrompt",
      "onBeforeToolUse",
      "onBeforeSendMessage",
      "onAfterMessage",
      "getMcpServers"
    ];
    for (const key of Object.keys(hooks)) {
      if (!validHookNames.includes(key)) {
        console.warn(`[Extension] ${manifest.id}: unknown hook "${key}", ignoring`);
      }
    }
    for (const hookName of validHookNames) {
      if (hooks[hookName] && typeof hooks[hookName] !== "function") {
        console.error(`[Extension] ${manifest.id}: hook "${hookName}" is not a function`);
        return null;
      }
    }
  } catch (error) {
    console.error(`[Extension] Failed to load ${manifest.id}:`, error);
    return {
      manifest,
      hooks: {},
      enabled: false,
      loadedAt: Date.now(),
      directory: extensionDir,
      error: String(error)
    };
  }
  console.log(`[Extension] Loaded: ${manifest.name} v${manifest.version} (${manifest.id})`);
  return {
    manifest,
    hooks,
    enabled: true,
    loadedAt: Date.now(),
    directory: extensionDir
  };
}
function loadAllExtensions() {
  const extensionsDir = getExtensionsDir();
  if (!fs$l.existsSync(extensionsDir)) {
    console.log(`[Extension] No extensions directory at ${extensionsDir}`);
    return [];
  }
  const loaded = [];
  try {
    const entries = fs$l.readdirSync(extensionsDir);
    for (const entry of entries) {
      const entryPath = require$$1.join(extensionsDir, entry);
      if (!fs$l.statSync(entryPath).isDirectory()) continue;
      const ext = loadExtension(entryPath);
      if (ext) {
        loaded.push(ext);
      }
    }
  } catch (error) {
    console.error("[Extension] Failed to scan extensions directory:", error);
  }
  console.log(`[Extension] Loaded ${loaded.length} extensions from ${extensionsDir}`);
  return loaded;
}
let extensions = [];
let watcher = null;
let reloadTimer = null;
const DEBOUNCE_MS = 500;
function initializeExtensions() {
  const dir = getExtensionsDir();
  if (!fs$l.existsSync(dir)) {
    fs$l.mkdirSync(dir, { recursive: true });
    console.log(`[Extension] Created extensions directory: ${dir}`);
  }
  extensions = loadAllExtensions();
  startWatcher();
}
function getAllExtensionStatuses() {
  return extensions.map((ext) => ({
    id: ext.manifest.id,
    name: ext.manifest.name,
    version: ext.manifest.version,
    description: ext.manifest.description,
    enabled: ext.enabled,
    error: ext.error,
    directory: ext.directory
  }));
}
function setExtensionEnabled(extensionId, enabled) {
  const ext = extensions.find((e) => e.manifest.id === extensionId);
  if (!ext) return false;
  ext.enabled = enabled;
  console.log(`[Extension] ${ext.manifest.name}: ${enabled ? "enabled" : "disabled"}`);
  return true;
}
function reloadExtensions() {
  for (const ext of extensions) {
    try {
      const entryFile = ext.manifest.main || "index.js";
      const entryPath = require.resolve(require("path").join(ext.directory, entryFile));
      delete require.cache[entryPath];
    } catch {
    }
  }
  extensions = loadAllExtensions();
  console.log(`[Extension] Reloaded: ${extensions.length} extensions`);
}
function startWatcher() {
  if (watcher) return;
  const dir = getExtensionsDir();
  if (!fs$l.existsSync(dir)) return;
  try {
    watcher = fs$l.watch(dir, { recursive: true }, () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        console.log("[Extension] File change detected, reloading extensions");
        reloadExtensions();
      }, DEBOUNCE_MS);
    });
    console.log(`[Extension] Watching ${dir} for changes`);
  } catch (error) {
    console.warn("[Extension] Failed to start watcher:", error);
  }
}
function shutdownExtensions() {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  extensions = [];
  console.log("[Extension] Registry shut down");
}
function registerExtensionHandlers() {
  electron.ipcMain.handle("extension:list", () => {
    try {
      return { success: true, data: getAllExtensionStatuses() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("extension:set-enabled", (_event, extensionId, enabled) => {
    try {
      const result = setExtensionEnabled(extensionId, enabled);
      if (!result) {
        return { success: false, error: `Extension not found: ${extensionId}` };
      }
      return { success: true, data: { extensionId, enabled } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("extension:reload", () => {
    try {
      reloadExtensions();
      return { success: true, data: getAllExtensionStatuses() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  console.log("[IPC] Extension handlers registered");
}
function resolveAccessibleAiSource(_aiSources, preferredSource) {
  return preferredSource;
}
function generateId(prefix = "msg") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}
function generateMessageId() {
  return generateId("msg");
}
function generateToolUseId() {
  return generateId("toolu");
}
function generateServerToolUseId() {
  return `srvtoolu_${generateId("")}`;
}
function encodeBackendConfig(config) {
  return Buffer.from(JSON.stringify(config)).toString("base64");
}
function decodeBackendConfig(encoded) {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (parsed?.url && parsed?.key) {
      return parsed;
    }
  } catch {
  }
  return null;
}
function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function anthropicImageSourceToUrl(source) {
  if (source.type === "base64") {
    const mediaType = source.media_type || "image/png";
    return `data:${mediaType};base64,${source.data}`;
  }
  return source.url;
}
function anthropicToolUseToOpenAIChatToolCall(block) {
  return {
    id: block.id,
    type: "function",
    function: {
      name: block.name,
      arguments: JSON.stringify(block.input || {})
    }
  };
}
function anthropicTextToResponsesInputText(block) {
  return {
    type: "input_text",
    text: block.text
  };
}
function anthropicTextToResponsesOutputText(block) {
  return {
    type: "output_text",
    text: block.text
  };
}
function anthropicImageToResponsesInputImage(block) {
  return {
    type: "input_image",
    image_url: anthropicImageSourceToUrl(block.source)
  };
}
function anthropicToolUseToResponsesFunctionCall(block) {
  return {
    type: "function_call",
    call_id: block.id,
    name: block.name,
    arguments: JSON.stringify(block.input || {})
  };
}
function anthropicToolResultToResponsesFunctionCallOutput(block) {
  const output2 = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
  return {
    type: "function_call_output",
    call_id: block.tool_use_id,
    output: output2
  };
}
function anthropicBlockToResponsesInputPart(block, role) {
  switch (block.type) {
    case "text":
      return role === "user" ? anthropicTextToResponsesInputText(block) : anthropicTextToResponsesOutputText(block);
    case "image":
      return anthropicImageToResponsesInputImage(block);
    case "thinking":
      if (role === "assistant" && block.thinking) {
        return { type: "output_text", text: block.thinking };
      }
      return null;
    default:
      return null;
  }
}
function openAIChatToolCallToAnthropicToolUse(toolCall) {
  let input = {};
  try {
    const args = toolCall.function.arguments || "{}";
    input = typeof args === "object" ? args : JSON.parse(args);
  } catch {
    input = { text: toolCall.function.arguments || "" };
  }
  return {
    type: "tool_use",
    id: toolCall.id,
    name: toolCall.function.name,
    input
  };
}
function openAIChatTextToAnthropicText(text) {
  return {
    type: "text",
    text
  };
}
function responsesFunctionCallToAnthropicToolUse(functionCall) {
  let input = {};
  try {
    const args = functionCall.arguments || "{}";
    input = typeof args === "object" ? args : JSON.parse(args);
  } catch {
    input = { text: functionCall.arguments || "" };
  }
  return {
    type: "tool_use",
    id: functionCall.id || functionCall.call_id || `call_${Date.now()}`,
    name: functionCall.name,
    input
  };
}
function extractTextFromAnthropicBlocks(blocks) {
  const textBlocks = blocks.filter((b) => b.type === "text" && !!b.text);
  if (textBlocks.length === 0) return null;
  return textBlocks.map((b) => b.text).join("\n");
}
function extractToolUseBlocks(blocks) {
  return blocks.filter((b) => b.type === "tool_use" && !!b.id);
}
function extractToolResultBlocks(blocks) {
  return blocks.filter((b) => b.type === "tool_result" && !!b.tool_use_id);
}
function convertAnthropicSystemToOpenAIChat(system) {
  if (!system) return null;
  if (typeof system === "string") {
    return { role: "system", content: system };
  }
  if (Array.isArray(system) && system.length > 0) {
    const textBlocks = system.filter((block) => block?.type === "text" && block.text);
    if (textBlocks.length === 0) return null;
    const contentParts = textBlocks.map((block) => ({
      type: "text",
      text: block.text,
      ...block.cache_control ? { cache_control: block.cache_control } : {}
    }));
    return { role: "system", content: contentParts };
  }
  return null;
}
function convertAnthropicMessagesToOpenAIChat(messages, system) {
  const result = [];
  let hasImages = false;
  const systemMessage = convertAnthropicSystemToOpenAIChat(system);
  if (systemMessage) {
    result.push(systemMessage);
  }
  if (!messages || !Array.isArray(messages)) {
    return { messages: result, hasImages };
  }
  const msgsCopy = deepClone(messages);
  for (const msg of msgsCopy) {
    if (!msg || msg.role !== "user" && msg.role !== "assistant") {
      continue;
    }
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (!Array.isArray(msg.content)) {
      continue;
    }
    const blocks = msg.content;
    if (msg.role === "user") {
      const toolResults = extractToolResultBlocks(blocks);
      for (const toolResult of toolResults) {
        const content = typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content);
        const toolMessage = {
          role: "tool",
          content,
          tool_call_id: toolResult.tool_use_id
        };
        if (toolResult.cache_control) {
          toolMessage.cache_control = toolResult.cache_control;
        }
        result.push(toolMessage);
      }
      const contentBlocks = blocks.filter(
        (b) => b.type === "text" && b.text || b.type === "image" && b.source
      );
      if (contentBlocks.length > 0) {
        const openaiContent = [];
        for (const block of contentBlocks) {
          if (block.type === "image") {
            hasImages = true;
            const imageBlock = block;
            const imageUrl = imageBlock.source?.type === "base64" ? `data:${imageBlock.source.media_type || "image/png"};base64,${imageBlock.source.data}` : imageBlock.source?.url;
            openaiContent.push({
              type: "image_url",
              image_url: { url: imageUrl }
            });
          } else if (block.type === "text") {
            openaiContent.push(block);
          }
        }
        if (openaiContent.length > 0) {
          result.push({ role: "user", content: openaiContent });
        }
      }
    } else if (msg.role === "assistant") {
      const text = extractTextFromAnthropicBlocks(blocks);
      const toolUseBlocks = extractToolUseBlocks(blocks);
      const assistantMessage = {
        role: "assistant",
        content: text || null
        // OpenAI expects null for pure tool_calls
      };
      if (toolUseBlocks.length > 0) {
        assistantMessage.tool_calls = toolUseBlocks.map(anthropicToolUseToOpenAIChatToolCall);
      }
      result.push(assistantMessage);
    }
  }
  return { messages: result, hasImages };
}
function extractAnthropicSystemText(system) {
  if (!system) return null;
  let sysText = "";
  if (typeof system === "string") {
    sysText = system;
  } else if (Array.isArray(system) && system.length > 0) {
    const textParts = system.filter((b) => b?.type === "text" && b.text).map((b) => b.text);
    sysText = textParts.join("\n");
  } else {
    return null;
  }
  const normalized = sysText.trim();
  return normalized || null;
}
function convertAnthropicMessagesToResponsesInput(messages) {
  const result = [];
  if (!messages || !Array.isArray(messages)) {
    return result;
  }
  const msgsCopy = deepClone(messages);
  for (const msg of msgsCopy) {
    if (!msg || msg.role !== "user" && msg.role !== "assistant") {
      continue;
    }
    if (typeof msg.content === "string") {
      const contentType = msg.role === "user" ? "input_text" : "output_text";
      result.push({
        role: msg.role,
        content: [{ type: contentType, text: msg.content }]
      });
      continue;
    }
    if (!Array.isArray(msg.content)) {
      continue;
    }
    const blocks = msg.content;
    if (msg.role === "user") {
      const toolResults = extractToolResultBlocks(blocks);
      for (const toolResult of toolResults) {
        result.push(anthropicToolResultToResponsesFunctionCallOutput(toolResult));
      }
      const contentParts = [];
      for (const block of blocks) {
        if (block.type !== "tool_result") {
          const converted = anthropicBlockToResponsesInputPart(block, "user");
          if (converted) {
            contentParts.push(converted);
          }
        }
      }
      if (contentParts.length > 0) {
        result.push({
          role: "user",
          content: contentParts
        });
      }
    } else if (msg.role === "assistant") {
      const contentParts = [];
      for (const block of blocks) {
        if (block.type !== "tool_use") {
          const converted = anthropicBlockToResponsesInputPart(block, "assistant");
          if (converted) {
            contentParts.push(converted);
          }
        }
      }
      if (contentParts.length > 0) {
        result.push({
          role: "assistant",
          content: contentParts
        });
      }
      const toolUseBlocks = extractToolUseBlocks(blocks);
      for (const toolUse of toolUseBlocks) {
        result.push(anthropicToolUseToResponsesFunctionCall(toolUse));
      }
    }
  }
  return result;
}
function budgetTokensToChatReasoningEffort(budgetTokens) {
  if (!budgetTokens) return "medium";
  if (budgetTokens > 1e4) return "high";
  if (budgetTokens > 5e3) return "medium";
  return "low";
}
function budgetTokensToResponsesReasoningEffort(budgetTokens) {
  if (!budgetTokens) return "medium";
  if (budgetTokens >= 18e3) return "xhigh";
  if (budgetTokens > 1e4) return "high";
  if (budgetTokens > 5e3) return "medium";
  return "low";
}
function anthropicToolToOpenAIChatTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: {
        type: "object",
        properties: tool.input_schema?.properties || {},
        required: tool.input_schema?.required
      },
      strict: tool.strict
    }
  };
}
function anthropicToolToResponsesTool(tool) {
  return {
    type: "function",
    name: tool.name,
    description: tool.description || "",
    parameters: {
      type: "object",
      properties: tool.input_schema?.properties || {},
      required: tool.input_schema?.required
    },
    strict: tool.strict
  };
}
function convertAnthropicToolsToOpenAIChat(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return void 0;
  }
  return tools.filter((tool) => tool && tool.name).map(anthropicToolToOpenAIChatTool);
}
function convertAnthropicToolsToResponses(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return void 0;
  }
  return tools.filter((tool) => tool && typeof tool.name === "string" && tool.name.trim() !== "").map(anthropicToolToResponsesTool);
}
function convertAnthropicToolChoiceToOpenAIChat(toolChoice) {
  if (!toolChoice) return void 0;
  switch (toolChoice.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      if ("name" in toolChoice && toolChoice.name) {
        return {
          type: "function",
          function: { name: toolChoice.name }
        };
      }
      return "auto";
    default:
      return "auto";
  }
}
function convertAnthropicToolChoiceToResponses(toolChoice) {
  if (!toolChoice) return void 0;
  switch (toolChoice.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      if ("name" in toolChoice && toolChoice.name) {
        return {
          type: "function",
          name: toolChoice.name
        };
      }
      return "auto";
    default:
      return "auto";
  }
}
function budgetTokensToReasoningEffort(budgetTokens) {
  return budgetTokensToChatReasoningEffort(budgetTokens);
}
function convertAnthropicThinkingToOpenAIReasoningEffort(thinking) {
  if (!thinking || thinking.type !== "enabled") return void 0;
  return budgetTokensToReasoningEffort(thinking.budget_tokens);
}
function convertAnthropicThinkingToResponsesReasoning(thinking) {
  if (!thinking || thinking.type !== "enabled") return void 0;
  return {
    effort: budgetTokensToResponsesReasoningEffort(thinking.budget_tokens)
  };
}
function convertAnthropicToOpenAIChat(anthropicRequest) {
  const { messages, hasImages } = convertAnthropicMessagesToOpenAIChat(
    anthropicRequest.messages,
    anthropicRequest.system
  );
  const tools = convertAnthropicToolsToOpenAIChat(anthropicRequest.tools);
  const openaiRequest = {
    model: anthropicRequest.model,
    messages,
    stream: anthropicRequest.stream
  };
  if (tools && tools.length > 0) {
    openaiRequest.tools = tools;
    openaiRequest.tool_choice = convertAnthropicToolChoiceToOpenAIChat(anthropicRequest.tool_choice);
  }
  if (anthropicRequest.thinking) {
    openaiRequest.reasoning_effort = convertAnthropicThinkingToOpenAIReasoningEffort(anthropicRequest.thinking);
  }
  return {
    request: openaiRequest,
    hasImages,
    hasTools: !!tools && tools.length > 0
  };
}
const DEFAULT_RESPONSES_INSTRUCTIONS = "Follow the provided system and user instructions. Use tools when needed.";
function convertAnthropicToOpenAIResponses(anthropicRequest) {
  const inputItems = convertAnthropicMessagesToResponsesInput(anthropicRequest.messages);
  const instructions = extractAnthropicSystemText(anthropicRequest.system) || DEFAULT_RESPONSES_INSTRUCTIONS;
  const hasImages = inputItems.some((item) => {
    if ("content" in item && Array.isArray(item.content)) {
      return item.content.some((part) => part.type === "input_image");
    }
    return false;
  });
  const tools = convertAnthropicToolsToResponses(anthropicRequest.tools);
  const hasTools = !!tools && tools.length > 0;
  const request = {
    model: anthropicRequest.model,
    input: inputItems,
    instructions,
    stream: anthropicRequest.stream
  };
  if (tools && tools.length > 0) {
    request.tools = tools;
    request.tool_choice = convertAnthropicToolChoiceToResponses(anthropicRequest.tool_choice);
  }
  if (anthropicRequest.thinking) {
    request.reasoning = convertAnthropicThinkingToResponsesReasoning(anthropicRequest.thinking);
  }
  return {
    request,
    hasImages,
    hasTools
  };
}
const STOP_REASON_MAP$1 = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  content_filter: "stop_sequence"
  // Approximate mapping
};
function mapFinishReasonToStopReason(finishReason) {
  if (!finishReason) return "end_turn";
  return STOP_REASON_MAP$1[finishReason] || "end_turn";
}
function extractTextContent(content) {
  if (content === null || content === void 0 || content === "") {
    return null;
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content.map((p) => {
      if (!p) return "";
      if (typeof p === "string") return p;
      if (p.type === "text" && typeof p.text === "string") return p.text;
      return "";
    }).filter(Boolean);
    return parts.length > 0 ? parts.join("") : null;
  }
  return String(content);
}
function extractWebSearchAnnotations(annotations) {
  if (!annotations || !Array.isArray(annotations)) {
    return [];
  }
  const blocks = [];
  const toolUseId = generateServerToolUseId();
  blocks.push({
    type: "server_tool_use",
    id: toolUseId,
    name: "web_search",
    input: { query: "" }
  });
  blocks.push({
    type: "web_search_tool_result",
    tool_use_id: toolUseId,
    content: annotations.map((ann) => ({
      type: "web_search_result",
      url: ann.url_citation?.url,
      title: ann.url_citation?.title
    }))
  });
  return blocks;
}
function extractThinkingContent(message) {
  if (message.thinking?.content) {
    return {
      type: "thinking",
      thinking: message.thinking.content,
      signature: message.thinking.signature
    };
  }
  const reasoningText = typeof message.reasoning === "string" ? message.reasoning : typeof message.reasoning_content === "string" ? message.reasoning_content : null;
  if (reasoningText) {
    return {
      type: "thinking",
      thinking: reasoningText
    };
  }
  return null;
}
function createAnthropicErrorResponse(message) {
  return {
    id: generateMessageId(),
    type: "message",
    role: "assistant",
    model: "unknown",
    content: [{ type: "text", text: `Error: ${message}` }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}
function convertOpenAIChatToAnthropic(openaiResponse, requestModel) {
  if (!openaiResponse) {
    return createAnthropicErrorResponse("Empty response from provider");
  }
  const choice = openaiResponse.choices?.[0];
  if (!choice) {
    return createAnthropicErrorResponse("No choices in response");
  }
  const message = choice.message;
  if (!message) {
    return createAnthropicErrorResponse("No message in response choice");
  }
  const content = [];
  const annotations = message.annotations;
  if (annotations) {
    content.push(...extractWebSearchAnnotations(annotations));
  }
  const text = extractTextContent(message.content);
  if (text) {
    content.push(openAIChatTextToAnthropicText(text));
  }
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      if (!toolCall?.function) continue;
      content.push(openAIChatToolCallToAnthropicToolUse(toolCall));
    }
  }
  const thinkingBlock = extractThinkingContent(message);
  if (thinkingBlock) {
    content.push(thinkingBlock);
  }
  const stopReason = mapFinishReasonToStopReason(choice.finish_reason);
  return {
    id: openaiResponse.id,
    type: "message",
    role: "assistant",
    model: openaiResponse.model || requestModel || "unknown",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0,
      cache_read_input_tokens: openaiResponse.usage?.cache_read_input_tokens
    }
  };
}
const STOP_REASON_MAP = {
  stop: "end_turn",
  completed: "end_turn",
  complete: "end_turn",
  length: "max_tokens",
  max_tokens: "max_tokens",
  tool_calls: "tool_use",
  tool_call: "tool_use",
  tool_use: "tool_use"
};
function mapStatusToStopReason(status) {
  const normalized = String(status).toLowerCase();
  return STOP_REASON_MAP[normalized] || "end_turn";
}
function processMessageOutput(item) {
  if (item.type !== "message") return [];
  const blocks = [];
  if ("content" in item && Array.isArray(item.content)) {
    for (const part of item.content) {
      if (part.type === "output_text" && part.text) {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "refusal" && part.refusal) {
        blocks.push({ type: "text", text: `[Refusal] ${part.refusal}` });
      }
    }
  }
  return blocks;
}
function processFunctionCallOutput(item) {
  if (item.type !== "function_call") return null;
  const functionCall = item;
  return responsesFunctionCallToAnthropicToolUse({
    id: functionCall.id || functionCall.call_id || generateToolUseId(),
    name: functionCall.name,
    arguments: functionCall.arguments
  });
}
function processReasoningOutput(item) {
  if (item.type !== "reasoning") return null;
  const reasoning = item;
  if (reasoning.summary && Array.isArray(reasoning.summary)) {
    const text = reasoning.summary.filter((s) => s.type === "output_text" && s.text).map((s) => s.text).join("\n");
    if (text) {
      return { type: "thinking", thinking: text };
    }
  }
  return null;
}
function extractOutputText(output2) {
  if (typeof output2 === "string") {
    return output2;
  }
  if (output2 && typeof output2 === "object" && "output_text" in output2) {
    return output2.output_text;
  }
  return null;
}
function processGenericOutput(item) {
  if (!item || typeof item !== "object") return [];
  const obj = item;
  const blocks = [];
  if (obj.output_text) {
    const text = extractOutputText(obj.output_text);
    if (text) {
      blocks.push({ type: "text", text });
    }
  }
  if (obj.output_tool_call && typeof obj.output_tool_call === "object") {
    const toolCall = obj.output_tool_call;
    const toolBlock = responsesFunctionCallToAnthropicToolUse({
      id: toolCall.id || toolCall.call_id,
      name: toolCall.name || toolCall.function?.name || "tool",
      arguments: toolCall.arguments || toolCall.function_arguments || "{}"
    });
    blocks.push(toolBlock);
  }
  if (Array.isArray(obj.content)) {
    const textParts = obj.content.map((c) => {
      if (!c) return "";
      if (typeof c === "string") return c;
      if (typeof c === "object" && c !== null) {
        const cObj = c;
        if (cObj.text) return String(cObj.text);
        if (cObj.content) return String(cObj.content);
      }
      return "";
    }).filter(Boolean);
    if (textParts.length > 0) {
      blocks.push({ type: "text", text: textParts.join("") });
    }
  }
  return blocks;
}
function convertOpenAIResponsesToAnthropic(openaiResponse) {
  if (!openaiResponse) {
    return createAnthropicErrorResponse("Empty response from provider");
  }
  const resp = openaiResponse.response || openaiResponse;
  const model = resp.model || openaiResponse.model || "unknown";
  const content = [];
  const output2 = resp.output ?? resp.outputs ?? resp.output_text ?? resp.output_texts;
  if (typeof output2 === "string") {
    if (output2) {
      content.push({ type: "text", text: output2 });
    }
  } else if (Array.isArray(output2)) {
    for (const item of output2) {
      if (!item) continue;
      const type = String(item.type || "").toLowerCase();
      if (type.includes("message") || type === "message") {
        content.push(...processMessageOutput(item));
      } else if (type.includes("function_call") || type === "function_call") {
        const block = processFunctionCallOutput(item);
        if (block) content.push(block);
      } else if (type.includes("reasoning") || type === "reasoning") {
        const block = processReasoningOutput(item);
        if (block) content.push(block);
      } else if (type.includes("text")) {
        const text = item.text ?? item.content ?? "";
        if (text) {
          content.push({ type: "text", text: String(text) });
        }
      } else if (type.includes("tool")) {
        const block = processFunctionCallOutput(item);
        if (block) content.push(block);
      } else {
        content.push(...processGenericOutput(item));
      }
    }
  } else if (output2 && typeof output2 === "object") {
    const text = extractOutputText(output2);
    if (text) {
      content.push({ type: "text", text });
    }
  }
  if (resp.reasoning || resp.reasoning_content) {
    const reasoningText = typeof resp.reasoning === "string" ? resp.reasoning : typeof resp.reasoning_content === "string" ? resp.reasoning_content : null;
    if (reasoningText) {
      content.push({ type: "thinking", thinking: reasoningText });
    }
  }
  const stopReasonRaw = resp.stop_reason || resp.status || "end_turn";
  const stopReason = mapStatusToStopReason(stopReasonRaw);
  const finalContent = content.length > 0 ? content : [{ type: "text", text: "" }];
  return {
    id: resp.id || generateMessageId(),
    type: "message",
    role: "assistant",
    model,
    content: finalContent,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: resp.usage?.input_tokens || resp.usage?.prompt_tokens || 0,
      output_tokens: resp.usage?.output_tokens || resp.usage?.completion_tokens || 0
    }
  };
}
class SSEWriter {
  constructor(res, options = {}) {
    this.closed = false;
    this.res = res;
    this.debug = options.debug ?? false;
  }
  /**
   * Check if the writer is closed
   */
  get isClosed() {
    return this.closed;
  }
  /**
   * Write a raw SSE event
   */
  writeEvent(event, data) {
    if (this.closed) return false;
    try {
      const jsonData = JSON.stringify(data);
      this.res.write(`event: ${event}
data: ${jsonData}

`);
      if (this.debug) {
        console.log(`[SSEWriter] Send: ${event}`, jsonData.slice(0, 200));
      }
      return true;
    } catch (e) {
      if (e instanceof TypeError && String(e.message).includes("Controller is already closed")) {
        this.closed = true;
      } else if (this.debug) {
        console.error("[SSEWriter] Error writing event:", e);
      }
      return false;
    }
  }
  /**
   * Write message_start event
   */
  writeMessageStart(messageId, model) {
    const event = {
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    };
    return this.writeEvent("message_start", event);
  }
  /**
   * Write content_block_start event for text block
   */
  writeTextBlockStart(index) {
    const event = {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "" }
    };
    return this.writeEvent("content_block_start", event);
  }
  /**
   * Write content_block_start event for tool_use block
   */
  writeToolUseBlockStart(index, id, name) {
    const event = {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id, name, input: {} }
    };
    return this.writeEvent("content_block_start", event);
  }
  /**
   * Write content_block_start event for thinking block
   */
  writeThinkingBlockStart(index) {
    const event = {
      type: "content_block_start",
      index,
      content_block: { type: "thinking", thinking: "" }
    };
    return this.writeEvent("content_block_start", event);
  }
  /**
   * Write content_block_start event for web_search_tool_result
   */
  writeWebSearchBlockStart(index, toolUseId, results) {
    const event = {
      type: "content_block_start",
      index,
      content_block: {
        type: "web_search_tool_result",
        tool_use_id: toolUseId,
        content: results
      }
    };
    return this.writeEvent("content_block_start", event);
  }
  /**
   * Write content_block_delta event for text
   */
  writeTextDelta(index, text) {
    const event = {
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text }
    };
    return this.writeEvent("content_block_delta", event);
  }
  /**
   * Write content_block_delta event for tool input JSON
   */
  writeInputJsonDelta(index, partialJson) {
    const event = {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson }
    };
    return this.writeEvent("content_block_delta", event);
  }
  /**
   * Write content_block_delta event for thinking
   */
  writeThinkingDelta(index, thinking) {
    const event = {
      type: "content_block_delta",
      index,
      delta: { type: "thinking_delta", thinking }
    };
    return this.writeEvent("content_block_delta", event);
  }
  /**
   * Write content_block_delta event for signature
   */
  writeSignatureDelta(index, signature) {
    const event = {
      type: "content_block_delta",
      index,
      delta: { type: "signature_delta", signature }
    };
    return this.writeEvent("content_block_delta", event);
  }
  /**
   * Write content_block_stop event
   */
  writeBlockStop(index) {
    const event = {
      type: "content_block_stop",
      index
    };
    return this.writeEvent("content_block_stop", event);
  }
  /**
   * Write message_delta event
   */
  writeMessageDelta(stopReason, usage) {
    const event = {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        output_tokens: usage.outputTokens ?? 0
      }
    };
    const eventData = event;
    if (usage.inputTokens !== void 0) {
      eventData.usage.input_tokens = usage.inputTokens;
    }
    if (usage.cacheReadTokens !== void 0) {
      eventData.usage.cache_read_input_tokens = usage.cacheReadTokens;
    }
    return this.writeEvent("message_delta", event);
  }
  /**
   * Write message_stop event
   */
  writeMessageStop() {
    const event = {
      type: "message_stop"
    };
    return this.writeEvent("message_stop", event);
  }
  /**
   * Write error event
   */
  writeError(message) {
    return this.writeEvent("error", {
      type: "error",
      message: { type: "api_error", message }
    });
  }
  /**
   * End the response
   */
  end() {
    if (!this.closed) {
      this.res.end();
      this.closed = true;
    }
  }
  /**
   * Write error response and end
   */
  sendError(statusCode, errorType, message) {
    if (!this.closed) {
      this.res.status(statusCode).json({
        type: "error",
        error: { type: errorType, message }
      });
      this.closed = true;
    }
  }
}
function createInitialState(model) {
  return {
    started: false,
    finished: false,
    messageId: `msg_${Date.now()}`,
    model,
    currentBlockIndex: -1,
    contentBlockIndex: 0,
    hasTextBlock: false,
    hasThinkingBlock: false,
    reasoningClosed: false,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0
    },
    stopReason: null
  };
}
class BaseStreamHandler {
  constructor(res, options = {}) {
    this.toolCallMap = /* @__PURE__ */ new Map();
    this.toolIndexToBlock = /* @__PURE__ */ new Map();
    this.writer = new SSEWriter(res, { debug: options.debug });
    this.state = createInitialState(options.model || "unknown");
    this.debug = options.debug ?? false;
  }
  // ============================================================================
  // State Management
  // ============================================================================
  get isFinished() {
    return this.state.finished || this.writer.isClosed;
  }
  markFinished() {
    this.state.finished = true;
  }
  updateModel(model) {
    if (model) {
      this.state.model = model;
    }
  }
  updateUsage(usage) {
    if (usage.inputTokens !== void 0) {
      this.state.usage.inputTokens = usage.inputTokens;
    }
    if (usage.outputTokens !== void 0) {
      this.state.usage.outputTokens = usage.outputTokens;
    }
    if (usage.cacheReadTokens !== void 0) {
      this.state.usage.cacheReadTokens = usage.cacheReadTokens;
    }
  }
  // ============================================================================
  // Message Lifecycle
  // ============================================================================
  ensureMessageStarted() {
    if (this.isFinished) return false;
    if (!this.state.started) {
      this.state.started = true;
      return this.writer.writeMessageStart(this.state.messageId, this.state.model);
    }
    return true;
  }
  finishMessage() {
    if (this.writer.isClosed) return;
    this.closeCurrentBlock();
    this.writer.writeMessageDelta(this.state.stopReason || "end_turn", {
      inputTokens: this.state.usage.inputTokens,
      outputTokens: this.state.usage.outputTokens,
      cacheReadTokens: this.state.usage.cacheReadTokens
    });
    this.writer.writeMessageStop();
    this.writer.end();
    this.state.finished = true;
  }
  // ============================================================================
  // Block Lifecycle
  // ============================================================================
  closeCurrentBlock() {
    if (this.state.currentBlockIndex >= 0) {
      this.writer.writeBlockStop(this.state.currentBlockIndex);
      this.state.currentBlockIndex = -1;
    }
  }
  startTextBlock() {
    if (this.isFinished) return false;
    if (!this.state.hasTextBlock) {
      if (this.state.currentBlockIndex >= 0) {
        this.closeCurrentBlock();
      }
      this.state.hasTextBlock = true;
      this.writer.writeTextBlockStart(this.state.contentBlockIndex);
      this.state.currentBlockIndex = this.state.contentBlockIndex;
      return true;
    }
    return true;
  }
  startThinkingBlock() {
    if (this.isFinished) return false;
    if (!this.state.hasThinkingBlock) {
      if (this.state.currentBlockIndex >= 0) {
        this.closeCurrentBlock();
      }
      this.state.hasThinkingBlock = true;
      this.writer.writeThinkingBlockStart(this.state.contentBlockIndex);
      this.state.currentBlockIndex = this.state.contentBlockIndex;
      return true;
    }
    return true;
  }
  startToolUseBlock(toolIndex, toolId, toolName) {
    if (this.isFinished) return -1;
    if (this.toolIndexToBlock.has(toolIndex)) {
      return this.toolIndexToBlock.get(toolIndex);
    }
    this.closeCurrentBlock();
    const blockIndex = this.state.contentBlockIndex;
    this.toolIndexToBlock.set(toolIndex, blockIndex);
    this.state.contentBlockIndex++;
    this.writer.writeToolUseBlockStart(blockIndex, toolId, toolName);
    this.state.currentBlockIndex = blockIndex;
    this.toolCallMap.set(toolIndex, {
      id: toolId,
      name: toolName,
      arguments: "",
      contentBlockIndex: blockIndex
    });
    return blockIndex;
  }
  // ============================================================================
  // Content Writing
  // ============================================================================
  writeTextDelta(text) {
    if (this.isFinished || !text) return;
    this.state.reasoningClosed = true;
    if (!this.state.hasTextBlock) {
      if (this.state.currentBlockIndex >= 0 && !this.state.hasTextBlock) {
        this.closeCurrentBlock();
      }
      this.startTextBlock();
    }
    this.writer.writeTextDelta(this.state.currentBlockIndex, text);
  }
  writeThinkingDelta(thinking) {
    if (this.isFinished || !thinking) return;
    if (this.state.reasoningClosed || this.state.hasTextBlock) return;
    if (!this.state.hasThinkingBlock) {
      this.startThinkingBlock();
    }
    this.writer.writeThinkingDelta(this.state.contentBlockIndex, thinking);
  }
  writeSignatureDelta(signature) {
    if (this.isFinished || !signature) return;
    if (this.state.hasThinkingBlock) {
      this.writer.writeSignatureDelta(this.state.contentBlockIndex, signature);
      this.closeCurrentBlock();
      this.state.contentBlockIndex++;
    }
  }
  writeToolInputDelta(toolIndex, partialJson) {
    if (this.isFinished || !partialJson) return;
    const blockIndex = this.toolIndexToBlock.get(toolIndex);
    if (blockIndex === void 0) return;
    const state2 = this.toolCallMap.get(toolIndex);
    if (state2) {
      state2.arguments += partialJson;
    }
    try {
      this.writer.writeInputJsonDelta(blockIndex, partialJson);
    } catch {
      try {
        const escaped = String(partialJson).replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        this.writer.writeInputJsonDelta(blockIndex, escaped);
      } catch (e) {
        if (this.debug) {
          console.error("[BaseStreamHandler] Failed to write tool input delta:", e);
        }
      }
    }
  }
  writeWebSearchResult(toolUseId, results) {
    if (this.isFinished) return;
    if (this.state.currentBlockIndex >= 0 && this.state.hasTextBlock) {
      this.closeCurrentBlock();
      this.state.hasTextBlock = false;
    }
    this.state.contentBlockIndex++;
    this.writer.writeWebSearchBlockStart(this.state.contentBlockIndex, toolUseId, results);
    this.writer.writeBlockStop(this.state.contentBlockIndex);
    this.state.currentBlockIndex = -1;
  }
  writeError(message) {
    this.writer.writeError(message);
  }
  // ============================================================================
  // Stop Reason Mapping
  // ============================================================================
  setStopReason(reason) {
    this.state.stopReason = reason;
  }
  // ============================================================================
  // SSE Parsing Utilities
  // ============================================================================
  /**
   * Parse SSE lines from buffer
   */
  parseSSELines(buffer2) {
    const lines = buffer2.split("\n");
    const remaining = lines.pop() || "";
    return { lines, remaining };
  }
  /**
   * Parse SSE data line
   */
  parseSSEData(line) {
    if (!line.startsWith("data:")) {
      return { data: null, isDone: false };
    }
    const dataStr = line.slice(5).trim();
    if (dataStr === "[DONE]") {
      return { data: null, isDone: true };
    }
    return { data: dataStr, isDone: false };
  }
  /**
   * Convert WebStream to Node Readable
   */
  streamToNodeReadable(stream) {
    return node_stream.Readable.fromWeb(stream);
  }
}
const OPENAI_CHAT_STOP_REASON_MAP = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  content_filter: "stop_sequence"
};
const OPENAI_RESPONSES_STOP_REASON_MAP = {
  stop: "end_turn",
  completed: "end_turn",
  complete: "end_turn",
  length: "max_tokens",
  max_tokens: "max_tokens",
  tool_calls: "tool_use",
  tool_call: "tool_use",
  tool_use: "tool_use"
};
class OpenAIChatStreamHandler extends BaseStreamHandler {
  constructor(res, options = {}) {
    super(res, options);
    this.inThinkTag = false;
    this.thinkBuffer = "";
  }
  /**
   * Process OpenAI Chat Completions stream
   */
  async processStream(stream) {
    if (!stream) {
      this.writer.sendError(502, "api_error", "Empty stream from provider");
      return;
    }
    const decoder = new TextDecoder();
    let buffer2 = "";
    try {
      const nodeStream = this.streamToNodeReadable(stream);
      for await (const chunk of nodeStream) {
        if (this.isFinished) break;
        buffer2 += decoder.decode(chunk, { stream: true });
        const { lines, remaining } = this.parseSSELines(buffer2);
        buffer2 = remaining;
        for (const line of lines) {
          if (this.isFinished) break;
          const { data, isDone } = this.parseSSEData(line);
          if (isDone) continue;
          if (!data) continue;
          if (this.debug) {
            console.log("[OpenAIChatStream] Received:", data.slice(0, 200));
          }
          const chunkJson = safeJsonParse(data);
          if (!chunkJson) continue;
          this.processChunk(chunkJson);
        }
      }
    } catch (error) {
      if (!this.isFinished && this.debug) {
        console.error("[OpenAIChatStream] Error:", error);
      }
    } finally {
      this.finishMessage();
    }
  }
  /**
   * Process a single chunk from the stream
   */
  processChunk(chunk) {
    if (chunk.error) {
      this.writeError(JSON.stringify(chunk.error));
      return;
    }
    if (chunk.model) {
      this.updateModel(chunk.model);
    }
    this.ensureMessageStarted();
    if (chunk.usage) {
      this.updateUsage({
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
        cacheReadTokens: chunk.usage.cache_read_input_tokens
      });
    }
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (typeof delta?.reasoning === "string" && delta.reasoning !== "") {
      this.writeThinkingDelta(delta.reasoning);
    }
    if (delta?.thinking) {
      const thinking = delta.thinking;
      if (thinking.signature) {
        this.writeSignatureDelta(thinking.signature);
      } else if (thinking.content) {
        this.writeThinkingDelta(thinking.content);
      }
    }
    if (delta?.content !== void 0 && delta?.content !== null && delta?.content !== "") {
      this.processTextWithThinkTags(delta.content);
    }
    if (delta?.annotations?.length) {
      this.processAnnotations(delta.annotations);
    }
    if (delta?.tool_calls) {
      this.processToolCalls(delta.tool_calls);
    }
    if (choice.finish_reason) {
      const stopReason = OPENAI_CHAT_STOP_REASON_MAP[choice.finish_reason] || "end_turn";
      this.setStopReason(stopReason);
      this.markFinished();
    }
  }
  /**
   * Process text content with <think> tag detection
   * Some providers wrap thinking content in <think>...</think> tags
   */
  processTextWithThinkTags(text) {
    let remaining = text;
    while (remaining.length > 0) {
      if (this.inThinkTag) {
        const closeIndex = remaining.indexOf("</think>");
        if (closeIndex !== -1) {
          const thinkContent = remaining.slice(0, closeIndex);
          if (thinkContent) {
            this.writeThinkingDelta(thinkContent);
          }
          this.inThinkTag = false;
          remaining = remaining.slice(closeIndex + 8);
          const trimmed = remaining.replace(/^[\n\r]+/, "");
          remaining = trimmed;
        } else {
          this.writeThinkingDelta(remaining);
          remaining = "";
        }
      } else {
        const openIndex = remaining.indexOf("<think>");
        if (openIndex !== -1) {
          const textBefore = remaining.slice(0, openIndex);
          if (textBefore) {
            this.writeTextDelta(textBefore);
          }
          this.inThinkTag = true;
          remaining = remaining.slice(openIndex + 7);
        } else {
          this.writeTextDelta(remaining);
          remaining = "";
        }
      }
    }
  }
  /**
   * Process annotations (web search results)
   */
  processAnnotations(annotations) {
    const toolUseId = `srvtoolu_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const results = annotations.map((ann) => ({
      type: "web_search_result",
      title: ann.url_citation?.title,
      url: ann.url_citation?.url
    }));
    this.writeWebSearchResult(toolUseId, results);
  }
  /**
   * Process tool calls
   */
  processToolCalls(toolCalls) {
    const processedIndices = /* @__PURE__ */ new Set();
    for (const toolCall of toolCalls) {
      if (this.isFinished) break;
      const toolIndex = toolCall.index ?? 0;
      if (processedIndices.has(toolIndex)) continue;
      processedIndices.add(toolIndex);
      if (!this.toolIndexToBlock.has(toolIndex)) {
        const toolId = toolCall.id || `call_${Date.now()}_${toolIndex}`;
        const toolName = toolCall.function?.name || `tool_${toolIndex}`;
        this.startToolUseBlock(toolIndex, toolId, toolName);
      } else if (toolCall.id && toolCall.function?.name) {
        const state2 = this.toolCallMap.get(toolIndex);
        if (state2 && state2.id.startsWith("call_") && state2.name.startsWith("tool_")) {
          state2.id = toolCall.id;
          state2.name = toolCall.function.name;
        }
      }
      if (toolCall.function?.arguments) {
        this.writeToolInputDelta(toolIndex, toolCall.function.arguments);
      }
    }
  }
}
async function streamOpenAIChatToAnthropic(stream, res, model, debug2 = false) {
  const handler = new OpenAIChatStreamHandler(res, { model, debug: debug2 });
  await handler.processStream(stream);
}
class OpenAIResponsesStreamHandler extends BaseStreamHandler {
  constructor(res, options = {}) {
    super(res, options);
  }
  /**
   * Process OpenAI Responses API stream
   */
  async processStream(stream) {
    if (!stream) {
      this.writer.sendError(502, "api_error", "Empty stream from provider");
      return;
    }
    const decoder = new TextDecoder();
    let buffer2 = "";
    try {
      const nodeStream = this.streamToNodeReadable(stream);
      for await (const chunk of nodeStream) {
        if (this.isFinished) break;
        buffer2 += decoder.decode(chunk, { stream: true });
        const { lines, remaining } = this.parseSSELines(buffer2);
        buffer2 = remaining;
        for (const line of lines) {
          if (this.isFinished) break;
          const { data, isDone } = this.parseSSEData(line);
          if (isDone) {
            this.markFinished();
            break;
          }
          if (!data) continue;
          if (this.debug) {
            console.log("[OpenAIResponsesStream] Received:", data.slice(0, 200));
          }
          const chunkJson = safeJsonParse(data);
          if (!chunkJson) continue;
          this.processEvent(chunkJson);
        }
      }
    } catch (error) {
      if (this.debug) {
        console.error("[OpenAIResponsesStream] Error:", error);
      }
    } finally {
      this.finishMessage();
    }
  }
  /**
   * Process a single event from the stream
   */
  processEvent(event) {
    const eventType = event.type || event.event || "";
    const responseObj = event.response || event;
    if (responseObj.model) {
      this.updateModel(responseObj.model);
    }
    if (responseObj.usage) {
      this.updateUsage({
        inputTokens: responseObj.usage.input_tokens || responseObj.usage.prompt_tokens,
        outputTokens: responseObj.usage.output_tokens || responseObj.usage.completion_tokens,
        cacheReadTokens: responseObj.usage.cache_read_input_tokens
      });
    }
    this.ensureMessageStarted();
    if (eventType === "error" || eventType === "response.error" || responseObj.error) {
      this.writeError(JSON.stringify(responseObj.error || event.error || {}));
      this.markFinished();
      return;
    }
    switch (eventType) {
      case "response.output_text.delta":
        this.handleTextDelta(event);
        break;
      case "response.output_text.done":
        this.handleTextDone();
        break;
      case "response.output_item.added":
        this.handleOutputItemAdded(event);
        break;
      case "response.output_item.done":
        this.handleOutputItemDone(event);
        break;
      case "response.function_call_arguments.delta":
        this.handleFunctionCallArgumentsDelta(event);
        break;
      case "response.function_call_arguments.done":
        break;
      case "response.reasoning_summary_text.delta":
        this.handleReasoningSummaryTextDelta(event);
        break;
      case "response.reasoning_summary_text.done":
      case "response.reasoning_summary_part.added":
      case "response.reasoning_summary_part.done":
        break;
      case "response.completed":
      case "response.done":
      case "done":
        this.handleCompletion(responseObj);
        break;
      case "response.incomplete":
        this.handleIncomplete(responseObj);
        break;
      case "response.failed":
        this.handleFailed(responseObj);
        break;
      case "response.created":
      case "response.in_progress":
        break;
      default:
        if (responseObj.status === "completed") {
          this.handleCompletion(responseObj);
        }
    }
  }
  /**
   * Handle text delta event
   */
  handleTextDelta(event) {
    const textDelta = event.delta;
    if (typeof textDelta === "string" && textDelta !== "") {
      this.writeTextDelta(textDelta);
    }
  }
  /**
   * Handle text done event
   */
  handleTextDone() {
    if (this.state.hasTextBlock) {
      this.closeCurrentBlock();
      this.state.hasTextBlock = false;
      this.state.contentBlockIndex++;
    }
  }
  /**
   * Handle output item added event
   */
  handleOutputItemAdded(event) {
    const item = event.item;
    if (!item) return;
    if (item.type === "function_call") {
      const toolId = item.call_id || item.id || `call_${Date.now()}`;
      const toolName = item.name || "unknown_function";
      const outputIndex = event.output_index ?? 0;
      this.startToolUseBlock(outputIndex, toolId, toolName);
    } else if (item.type === "reasoning") ;
  }
  /**
   * Handle output item done event
   */
  handleOutputItemDone(event) {
    const item = event.item;
    if (!item) return;
    if (item.type === "function_call") {
      const outputIndex = event.output_index ?? 0;
      const blockIndex = this.toolIndexToBlock.get(outputIndex);
      if (blockIndex !== void 0) {
        this.writer.writeBlockStop(blockIndex);
        this.state.currentBlockIndex = -1;
      }
    } else if (item.type === "reasoning") {
      if (item.summary && Array.isArray(item.summary)) {
        for (const part of item.summary) {
          if (part.type === "summary_text" && part.text) {
            this.writeThinkingDelta(part.text);
          }
        }
      }
    }
  }
  /**
   * Handle function call arguments delta event
   */
  handleFunctionCallArgumentsDelta(event) {
    const argsDelta = event.delta;
    const outputIndex = event.output_index ?? 0;
    if (typeof argsDelta === "string") {
      this.writeToolInputDelta(outputIndex, argsDelta);
    }
  }
  /**
   * Handle reasoning summary text delta event
   */
  handleReasoningSummaryTextDelta(event) {
    const delta = event.delta;
    if (typeof delta === "string" && delta !== "") {
      this.writeThinkingDelta(delta);
    }
  }
  /**
   * Handle completion event
   */
  handleCompletion(response) {
    const stopReason = this.mapStopReason(response.stop_reason || response.status);
    this.setStopReason(stopReason);
    if (response.usage) {
      this.updateUsage({
        inputTokens: response.usage.input_tokens || response.usage.prompt_tokens,
        outputTokens: response.usage.output_tokens || response.usage.completion_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens
      });
    }
    this.markFinished();
  }
  /**
   * Handle incomplete event
   */
  handleIncomplete(response) {
    const reason = response.incomplete_details?.reason;
    const stopReason = reason === "max_output_tokens" ? "max_tokens" : "end_turn";
    this.setStopReason(stopReason);
    this.markFinished();
  }
  /**
   * Handle failed event
   */
  handleFailed(response) {
    if (response.error) {
      this.writeError(JSON.stringify(response.error));
    }
    this.setStopReason("end_turn");
    this.markFinished();
  }
  /**
   * Map stop reason to Anthropic format
   */
  mapStopReason(reason) {
    if (!reason) return "end_turn";
    const normalized = String(reason).toLowerCase();
    return OPENAI_RESPONSES_STOP_REASON_MAP[normalized] || "end_turn";
  }
}
async function streamOpenAIResponsesToAnthropic(stream, res, model, debug2 = false) {
  const handler = new OpenAIResponsesStreamHandler(res, { model, debug: debug2 });
  await handler.processStream(stream);
}
function getApiTypeFromUrl(url2) {
  if (url2.endsWith("/chat/completions")) return "chat_completions";
  if (url2.endsWith("/responses")) return "responses";
  return null;
}
function isValidEndpointUrl(url2) {
  return getApiTypeFromUrl(url2) !== null;
}
function getEndpointUrlError(url2) {
  return `Invalid endpoint URL: ${url2}

Please provide a complete endpoint URL ending with:
  - /chat/completions  (e.g., https://api.openai.com/v1/chat/completions)
  - /responses         (e.g., https://api.openai.com/v1/responses)`;
}
function shouldForceStream() {
  const envValue = process.env.HALO_OPENAI_FORCE_STREAM;
  return envValue === "1" || envValue === "true" || envValue === "yes";
}
function isChatGPTCodexResponsesUrl(url2) {
  return url2.startsWith("https://chatgpt.com/backend-api/codex/") && url2.endsWith("/responses");
}
const requestQueues = /* @__PURE__ */ new Map();
function getMaxConcurrentRequests() {
  const raw = Number.parseInt(process.env.HALO_OPENAI_MAX_CONCURRENT_REQUESTS || "", 10);
  if (Number.isFinite(raw)) {
    return Math.max(1, Math.min(8, raw));
  }
  return 4;
}
async function withRequestQueue(key, fn) {
  let queue = requestQueues.get(key);
  if (!queue) {
    queue = { active: 0, waiters: [] };
    requestQueues.set(key, queue);
  }
  const maxConcurrent = getMaxConcurrentRequests();
  if (queue.active >= maxConcurrent) {
    await new Promise((resolve) => {
      queue.waiters.push(resolve);
    });
  } else {
    queue.active += 1;
  }
  try {
    return await fn();
  } finally {
    const current = requestQueues.get(key);
    if (current) {
      const next = current.waiters.shift();
      if (next) {
        next();
      } else {
        current.active = Math.max(0, current.active - 1);
        if (current.active === 0) {
          requestQueues.delete(key);
        }
      }
    }
  }
}
function generateQueueKey(backendUrl, apiKey) {
  return `${backendUrl}:${apiKey.slice(0, 16)}`;
}
let usageLimitResetsAt = null;
function isUsageLimitActive() {
  if (!usageLimitResetsAt) return false;
  if (Date.now() / 1e3 >= usageLimitResetsAt) {
    usageLimitResetsAt = null;
    return false;
  }
  return true;
}
const DEFAULT_TIMEOUT_MS$1 = 10 * 60 * 1e3;
function applyProviderRequestRequirements(backendUrl, apiType, openaiRequest) {
  const sanitizedRequest = { ...openaiRequest };
  if (apiType === "responses" && sanitizedRequest.reasoning && typeof sanitizedRequest.reasoning === "object") {
    const { enabled: _enabled, ...reasoning } = sanitizedRequest.reasoning;
    sanitizedRequest.reasoning = Object.keys(reasoning).length > 0 ? reasoning : void 0;
  }
  if (apiType === "responses" && isChatGPTCodexResponsesUrl(backendUrl)) {
    return {
      ...sanitizedRequest,
      store: false
    };
  }
  return sanitizedRequest;
}
function sendError(res, statusCode, errorType, message) {
  res.status(statusCode).json({
    type: "error",
    error: { type: errorType, message }
  });
}
async function fetchUpstream(targetUrl, apiKey, body, timeoutMs, signal, customHeaders) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.log("[RequestHandler] Request timeout, aborting...");
    controller.abort();
  }, timeoutMs);
  try {
    const headers = {
      "Content-Type": "application/json",
      ...customHeaders || {}
    };
    if (!headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal ?? controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
async function handleMessagesRequest(anthropicRequest, config, res, options = {}) {
  const { debug: debug2 = false, timeoutMs = DEFAULT_TIMEOUT_MS$1 } = options;
  const { url: backendUrl, key: apiKey, model, headers: customHeaders, apiType: configApiType } = config;
  if (isUsageLimitActive()) {
    const remainingSec = usageLimitResetsAt - Math.floor(Date.now() / 1e3);
    const minutesLeft = Math.ceil(remainingSec / 60);
    console.log(`[RequestHandler] Usage limit active, rejecting request (resets in ~${minutesLeft}min)`);
    return sendError(
      res,
      402,
      "billing_error",
      `Usage limit reached. Resets in ~${minutesLeft} minutes.`
    );
  }
  if (!isValidEndpointUrl(backendUrl)) {
    return sendError(res, 400, "invalid_request_error", getEndpointUrlError(backendUrl));
  }
  const apiType = configApiType || getApiTypeFromUrl(backendUrl);
  if (model) {
    anthropicRequest.model = model;
  }
  if (debug2) {
    console.log("[RequestHandler] Backend:", backendUrl);
    console.log("[RequestHandler] API Key:", apiKey.slice(0, 8) + "...");
    console.log("[RequestHandler] ApiType:", apiType);
  }
  const queueKey = generateQueueKey(backendUrl, apiKey);
  await withRequestQueue(queueKey, async () => {
    try {
      const forceEnvStream = shouldForceStream();
      const preferStreamByWire = apiType === "responses" && anthropicRequest.stream === void 0;
      let wantStream = forceEnvStream || config.forceStream || preferStreamByWire || anthropicRequest.stream;
      const requestToSend = { ...anthropicRequest, stream: wantStream };
      const convertedRequest = apiType === "responses" ? convertAnthropicToOpenAIResponses(requestToSend).request : convertAnthropicToOpenAIChat(requestToSend).request;
      const openaiRequest = applyProviderRequestRequirements(backendUrl, apiType, convertedRequest);
      const toolCount = openaiRequest.tools?.length ?? 0;
      console.log(`[RequestHandler] wire=${apiType} tools=${toolCount}`);
      console.log(`[RequestHandler] POST ${backendUrl} (stream=${wantStream ?? false})`);
      let upstreamResp = await fetchUpstream(backendUrl, apiKey, openaiRequest, timeoutMs, void 0, customHeaders);
      console.log(`[RequestHandler] Upstream response: ${upstreamResp.status}`);
      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text().catch(() => "");
        if (upstreamResp.status === 429) {
          console.error(`[RequestHandler] Provider 429: ${errorText.slice(0, 200)}`);
          try {
            const parsed = JSON.parse(errorText);
            if (parsed?.error?.type === "usage_limit_reached") {
              if (parsed.error.resets_at) {
                usageLimitResetsAt = parsed.error.resets_at;
              }
              const resetsIn = parsed.error.resets_in_seconds;
              const minutesLeft = resetsIn ? Math.ceil(resetsIn / 60) : void 0;
              const msg = minutesLeft ? `Usage limit reached. Resets in ~${minutesLeft} minutes.` : `Usage limit reached.`;
              return sendError(res, 402, "billing_error", msg);
            }
          } catch {
          }
          return sendError(res, 429, "rate_limit_error", `Provider error: ${errorText || "HTTP 429"}`);
        }
        const requiresStream = errorText?.toLowerCase().includes("stream must be set to true");
        if (requiresStream && !wantStream) {
          console.warn("[RequestHandler] Upstream requires stream=true, retrying...");
          wantStream = true;
          const retryRequest = apiType === "responses" ? convertAnthropicToOpenAIResponses({ ...anthropicRequest, stream: true }).request : convertAnthropicToOpenAIChat({ ...anthropicRequest, stream: true }).request;
          const retryOpenAIRequest = applyProviderRequestRequirements(backendUrl, apiType, retryRequest);
          upstreamResp = await fetchUpstream(backendUrl, apiKey, retryOpenAIRequest, timeoutMs, void 0, customHeaders);
          if (!upstreamResp.ok) {
            const retryErrorText = await upstreamResp.text().catch(() => "");
            console.error(`[RequestHandler] Provider error ${upstreamResp.status}: ${retryErrorText.slice(0, 200)}`);
            return sendError(res, upstreamResp.status, "api_error", `Provider error: ${retryErrorText || `HTTP ${upstreamResp.status}`}`);
          }
        } else {
          console.error(`[RequestHandler] Provider error ${upstreamResp.status}: ${errorText.slice(0, 200)}`);
          return sendError(res, upstreamResp.status, "api_error", `Provider error: ${errorText || `HTTP ${upstreamResp.status}`}`);
        }
      }
      if (wantStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        if (apiType === "responses") {
          await streamOpenAIResponsesToAnthropic(upstreamResp.body, res, anthropicRequest.model, debug2);
        } else {
          await streamOpenAIChatToAnthropic(upstreamResp.body, res, anthropicRequest.model, debug2);
        }
        return;
      }
      const openaiResponse = await upstreamResp.json();
      const anthropicResponse = apiType === "responses" ? convertOpenAIResponsesToAnthropic(openaiResponse) : convertOpenAIChatToAnthropic(openaiResponse, anthropicRequest.model);
      res.json(anthropicResponse);
    } catch (error) {
      if (error?.name === "AbortError") {
        console.error("[RequestHandler] AbortError (timeout or client disconnect)");
        return sendError(res, 504, "timeout_error", "Request timed out");
      }
      console.error("[RequestHandler] Internal error:", error?.message || error);
      return sendError(res, 500, "internal_error", error?.message || "Internal error");
    }
  });
}
function handleCountTokensRequest(messages, system) {
  let count = 0;
  if (system) {
    count += Math.ceil(JSON.stringify(system).length / 4);
  }
  if (messages) {
    count += Math.ceil(JSON.stringify(messages).length / 4);
  }
  return { input_tokens: count };
}
function createApp(options = {}) {
  const app = express();
  const { debug: debug2 = false, timeoutMs } = options;
  app.use(express.json({ limit: "50mb" }));
  if (debug2) {
    app.use((req, _res, next) => {
      console.log(`[OpenAICompatRouter] ${req.method} ${req.url}`);
      next();
    });
  }
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/v1/messages", async (req, res) => {
    const anthropicRequest = req.body || {};
    const rawKey = req.headers["x-api-key"];
    const rawKeyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!rawKeyStr) {
      return res.status(401).json({
        type: "error",
        error: { type: "authentication_error", message: "x-api-key is required" }
      });
    }
    const decodedConfig = decodeBackendConfig(String(rawKeyStr));
    if (!decodedConfig) {
      return res.status(400).json({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid x-api-key format. Expect base64(JSON.stringify({ url, key, model?, apiType? }))"
        }
      });
    }
    await handleMessagesRequest(anthropicRequest, decodedConfig, res, { debug: debug2, timeoutMs });
  });
  app.post("/v1/messages/count_tokens", (req, res) => {
    const { messages, system } = req.body || {};
    const result = handleCountTokensRequest(messages, system);
    res.json(result);
  });
  return app;
}
let server = null;
let info = null;
let starting = null;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1e3;
async function ensureOpenAICompatRouter(options = {}) {
  if (info && server) return info;
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    try {
      const debug2 = options.debug === true;
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const app = createApp({ debug: debug2, timeoutMs });
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server?.address();
        if (!addr) {
          reject(new Error("Failed to get router address"));
          return;
        }
        info = {
          port: addr.port,
          baseUrl: `http://127.0.0.1:${addr.port}`
        };
        console.log("[OpenAICompatRouter] Started on", info.baseUrl);
        resolve(info);
      });
      server.on("error", (err) => {
        console.error("[OpenAICompatRouter] Server error:", err);
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  }).finally(() => {
    starting = null;
  });
  return starting;
}
async function stopOpenAICompatRouter() {
  if (!server) return;
  const s = server;
  server = null;
  info = null;
  await new Promise((resolve) => {
    s.close(() => resolve());
  });
  console.log("[OpenAICompatRouter] Stopped");
}
const DEFAULT_MODEL = "claude-opus-4-5-20251101";
const ROUTED_MODEL = "claude-sonnet-4-20250514";
function getWorkingDir(spaceId) {
  if (spaceId === "skillsfan-temp") {
    const artifactsDir = require$$1.join(getTempSpacePath(), "artifacts");
    if (!fs$l.existsSync(artifactsDir)) {
      fs$l.mkdirSync(artifactsDir, { recursive: true });
    }
    return artifactsDir;
  }
  const space = getSpace(spaceId);
  if (space) {
    return space.path;
  }
  return getTempSpacePath();
}
function isNativeAnthropicBaseUrl(apiUrl) {
  if (!apiUrl) return false;
  try {
    return new URL(apiUrl).hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}
function inferOpenAIWireApi(apiUrl) {
  const envApiType = process.env.HALO_OPENAI_API_TYPE || process.env.HALO_OPENAI_WIRE_API;
  if (envApiType) {
    const v = envApiType.toLowerCase();
    if (v.includes("response")) return "responses";
    if (v.includes("chat")) return "chat_completions";
  }
  if (apiUrl) {
    if (apiUrl.includes("/chat/completions") || apiUrl.includes("/chat_completions")) return "chat_completions";
    if (apiUrl.includes("/responses")) return "responses";
  }
  return "chat_completions";
}
async function getApiCredentials(config) {
  const manager = getAISourceManager();
  await manager.ensureInitialized();
  const aiSources = config.aiSources;
  const currentSource = aiSources?.current || "custom";
  const currentConfig = aiSources?.[currentSource];
  const isOAuthProvider = currentConfig && typeof currentConfig === "object" && "loggedIn" in currentConfig;
  let oauthTokenValid = true;
  if (isOAuthProvider) {
    const tokenResult = await manager.ensureValidToken(currentSource);
    if (!tokenResult.success) {
      oauthTokenValid = false;
    }
  }
  const backendConfig = manager.getBackendConfig();
  if (!backendConfig) {
    if (isOAuthProvider && !oauthTokenValid) {
      throw new Error("OAuth token expired or invalid. Please login again.");
    }
    throw new Error("No AI source configured. Please configure an API key or login.");
  }
  let provider;
  let nativeAnthropicServerTools = false;
  if (isOAuthProvider && oauthTokenValid) {
    provider = "oauth";
  } else {
    const providerType = currentConfig?.provider || aiSources?.custom?.provider;
    provider = providerType === "openai" ? "openai" : "anthropic";
    nativeAnthropicServerTools = provider === "anthropic" && isNativeAnthropicBaseUrl(backendConfig.url);
  }
  return {
    baseUrl: backendConfig.url,
    apiKey: backendConfig.key,
    model: backendConfig.model || DEFAULT_MODEL,
    provider,
    nativeAnthropicServerTools,
    customHeaders: backendConfig.headers,
    apiType: backendConfig.apiType
  };
}
async function getApiCredentialsForSource(config, source, modelOverride) {
  const manager = getAISourceManager();
  await manager.ensureInitialized();
  const aiSources = config.aiSources || { current: "custom" };
  const targetSource = resolveAccessibleAiSource(aiSources, source) || source;
  const targetConfig = aiSources[targetSource];
  if (targetSource === (aiSources.current || "custom")) {
    const credentials = await getApiCredentials(config);
    if (modelOverride) {
      credentials.model = modelOverride;
    }
    return credentials;
  }
  if (targetSource === "custom" && aiSources.custom?.apiKey) {
    const baseUrl = (aiSources.custom.apiUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const provider = aiSources.custom.provider === "openai" ? "openai" : "anthropic";
    return {
      baseUrl,
      apiKey: aiSources.custom.apiKey,
      model: modelOverride || aiSources.custom.model || DEFAULT_MODEL,
      provider,
      nativeAnthropicServerTools: provider === "anthropic" && isNativeAnthropicBaseUrl(baseUrl),
      apiType: provider === "openai" ? inferOpenAIWireApi(baseUrl) : void 0
    };
  }
  if (targetConfig && typeof targetConfig === "object" && "apiKey" in targetConfig && targetConfig.apiKey) {
    const baseUrl = (targetConfig.apiUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const provider = targetConfig.provider === "openai" ? "openai" : "anthropic";
    return {
      baseUrl,
      apiKey: targetConfig.apiKey,
      model: modelOverride || targetConfig.model || DEFAULT_MODEL,
      provider,
      nativeAnthropicServerTools: provider === "anthropic" && isNativeAnthropicBaseUrl(baseUrl),
      customHeaders: targetConfig.customHeaders,
      apiType: targetConfig.apiType || (provider === "openai" ? inferOpenAIWireApi(baseUrl) : void 0)
    };
  }
  const providerObj = manager.getProvider(targetSource);
  if (providerObj) {
    await manager.ensureValidToken(targetSource);
    const backendConfig = providerObj.getBackendConfig(aiSources);
    if (!backendConfig) {
      throw new Error(`No AI source configured for ${targetSource}.`);
    }
    return {
      baseUrl: backendConfig.url,
      apiKey: backendConfig.key,
      model: modelOverride || backendConfig.model || DEFAULT_MODEL,
      provider: "oauth",
      customHeaders: backendConfig.headers,
      apiType: backendConfig.apiType
    };
  }
  throw new Error(`No AI source configured for ${targetSource}. Please configure a model first.`);
}
async function resolveSdkTransport(credentials) {
  let anthropicBaseUrl = credentials.baseUrl;
  let anthropicApiKey = credentials.apiKey;
  let sdkModel = credentials.model || DEFAULT_MODEL;
  if (credentials.provider === "anthropic") {
    return { anthropicBaseUrl, anthropicApiKey, sdkModel, routed: false };
  }
  const router = await ensureOpenAICompatRouter({ debug: false });
  anthropicBaseUrl = router.baseUrl;
  const apiType = credentials.apiType || (credentials.provider === "oauth" ? "chat_completions" : inferOpenAIWireApi(credentials.baseUrl));
  anthropicApiKey = encodeBackendConfig({
    url: credentials.baseUrl,
    key: credentials.apiKey,
    model: credentials.model,
    headers: credentials.customHeaders,
    apiType
  });
  sdkModel = ROUTED_MODEL;
  return { anthropicBaseUrl, anthropicApiKey, sdkModel, routed: true, apiType };
}
let pty = null;
function getPty() {
  if (!pty) {
    pty = require("node-pty");
  }
  return pty;
}
const ptyInstances = /* @__PURE__ */ new Map();
const EMBEDDED_CLAUDE_CONFIG_FILE_NAMES = [".config.json", ".claude.json"];
let mainWindowRef = null;
function setPtyMainWindow(window2) {
  mainWindowRef = window2;
}
function unwrapAsarPath(filePath) {
  return filePath.replace("app.asar", "app.asar.unpacked").replace("node_modules.asar", "node_modules.asar.unpacked");
}
function ensureReadableFile(filePath, label) {
  if (!filePath || !fs$l.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath || "(empty path)"}.`);
  }
  const stat2 = fs$l.statSync(filePath);
  if (!stat2.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}.`);
  }
  fs$l.accessSync(filePath, fs$l.constants.R_OK);
}
function ensureDirectoryExists(dirPath, label) {
  if (!dirPath || !fs$l.existsSync(dirPath)) {
    throw new Error(`${label} does not exist: ${dirPath || "(empty path)"}.`);
  }
  const stat2 = fs$l.statSync(dirPath);
  if (!stat2.isDirectory()) {
    throw new Error(`${label} is not a directory: ${dirPath}.`);
  }
}
function ensureExecutableFile(filePath, label) {
  if (!filePath || !fs$l.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath || "(empty path)"}.`);
  }
  const stat2 = fs$l.statSync(filePath);
  if (!stat2.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}.`);
  }
  try {
    fs$l.accessSync(filePath, fs$l.constants.X_OK);
  } catch {
    fs$l.chmodSync(filePath, 493);
    fs$l.accessSync(filePath, fs$l.constants.X_OK);
    console.log(`[PTY] Repaired execute permission for ${label}: ${filePath}`);
  }
}
function resolveNodePtySpawnHelperPath() {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const packageJsonPath = require.resolve("node-pty/package.json");
    const packageDir = require$$1.dirname(packageJsonPath);
    const relativeHelperPath = require$$1.join("prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
    const candidates = [
      require$$1.join(unwrapAsarPath(packageDir), relativeHelperPath),
      require$$1.join(packageDir, relativeHelperPath)
    ];
    return candidates.find((candidate) => fs$l.existsSync(candidate)) ?? candidates[0] ?? null;
  } catch {
    return null;
  }
}
function validatePtyLaunchPrerequisites(params) {
  const { electronPath, cliPath, workDir } = params;
  ensureExecutableFile(electronPath, "Electron runtime");
  ensureReadableFile(cliPath, "Claude Code CLI");
  ensureDirectoryExists(workDir, "Terminal working directory");
  const helperPath = resolveNodePtySpawnHelperPath();
  if (helperPath) {
    ensureExecutableFile(helperPath, "node-pty spawn helper");
  }
  return { helperPath };
}
function buildPtyStartupError(code, summary, details) {
  return new Error([`[${code}] ${summary}`, ...details.filter(Boolean)].join("\n"));
}
function wrapPtyStartupError(error, context) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  if (message.startsWith("[")) {
    return error instanceof Error ? error : new Error(message);
  }
  if (lowerMessage.includes("login") || lowerMessage.includes("api key") || lowerMessage.includes("oauth token") || lowerMessage.includes("ai source configured")) {
    return buildPtyStartupError("PTY_AUTH_REQUIRED", "AI source is not ready for Claude Code terminal.", [
      `Technical details: ${message}`
    ]);
  }
  if (lowerMessage.includes("working directory")) {
    return buildPtyStartupError("PTY_WORKDIR_UNAVAILABLE", "Claude Code terminal working directory is unavailable.", [
      context.workDir ? `Working directory: ${context.workDir}` : null,
      `Technical details: ${message}`
    ]);
  }
  if (lowerMessage.includes("claude code cli not found") || lowerMessage.includes("@anthropic-ai/claude-code")) {
    return buildPtyStartupError("PTY_CLI_MISSING", "Bundled Claude Code CLI is missing.", [
      context.cliPath ? `CLI path: ${context.cliPath}` : null,
      `Technical details: ${message}`
    ]);
  }
  if (lowerMessage.includes("spawn helper") || lowerMessage.includes("spawn-helper") || lowerMessage.includes("posix_spawnp failed")) {
    return buildPtyStartupError("PTY_HELPER_START_FAILED", "macOS terminal helper failed to launch.", [
      context.helperPath ? `Helper path: ${context.helperPath}` : null,
      `Technical details: ${message}`
    ]);
  }
  if (lowerMessage.includes("node-pty")) {
    return buildPtyStartupError("PTY_RUNTIME_UNAVAILABLE", "Local PTY runtime failed to load.", [
      `Technical details: ${message}`
    ]);
  }
  return buildPtyStartupError("PTY_START_FAILED", "Claude Code terminal failed to start.", [
    context.electronPath ? `Runtime path: ${context.electronPath}` : null,
    context.cliPath ? `CLI path: ${context.cliPath}` : null,
    context.workDir ? `Working directory: ${context.workDir}` : null,
    `Technical details: ${message}`
  ]);
}
function asJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
function resolveEmbeddedClaudeGlobalConfigPath(configDir) {
  for (const fileName of EMBEDDED_CLAUDE_CONFIG_FILE_NAMES) {
    const filePath = require$$1.join(configDir, fileName);
    if (fs$l.existsSync(filePath)) {
      return filePath;
    }
  }
  return require$$1.join(configDir, ".config.json");
}
function buildEmbeddedClaudeProjectState(existingProjects, workDir) {
  const nextProjects = asJsonObject(existingProjects) ? { ...asJsonObject(existingProjects) } : {};
  const projectDirs = /* @__PURE__ */ new Set([workDir.normalize("NFC")]);
  try {
    projectDirs.add(fs$l.realpathSync(workDir).normalize("NFC"));
  } catch {
  }
  for (const projectDir of projectDirs) {
    const existingProject = asJsonObject(nextProjects[projectDir]) ?? {};
    nextProjects[projectDir] = {
      ...existingProject,
      hasTrustDialogAccepted: true
    };
  }
  return nextProjects;
}
function buildEmbeddedClaudeApiKeyState(existingValue, apiKey) {
  const existing = asJsonObject(existingValue);
  const approved = new Set(asStringArray(existing?.approved));
  const truncatedApiKey = apiKey.slice(-20);
  if (truncatedApiKey) {
    approved.add(truncatedApiKey);
  }
  return {
    approved: Array.from(approved),
    rejected: asStringArray(existing?.rejected).filter((value) => value !== truncatedApiKey)
  };
}
function ensureEmbeddedClaudeGlobalConfig(params) {
  const configPath = resolveEmbeddedClaudeGlobalConfigPath(params.configDir);
  let existingConfig = {};
  if (fs$l.existsSync(configPath)) {
    try {
      const raw = fs$l.readFileSync(configPath, "utf-8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        existingConfig = asJsonObject(parsed) ?? {};
      }
    } catch (error) {
      console.warn(
        `[PTY] Failed to parse embedded Claude config at ${configPath}, recreating it`,
        error
      );
    }
  }
  const nextConfig = {
    ...existingConfig,
    theme: typeof existingConfig.theme === "string" ? existingConfig.theme : electron.nativeTheme.shouldUseDarkColors ? "dark" : "light",
    hasCompletedOnboarding: true,
    customApiKeyResponses: buildEmbeddedClaudeApiKeyState(
      existingConfig.customApiKeyResponses,
      params.apiKey
    ),
    projects: buildEmbeddedClaudeProjectState(existingConfig.projects, params.workDir)
  };
  fs$l.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}
`, "utf-8");
}
async function resolveClaudeCliEnv(params) {
  const config = getConfig();
  const source = params.source || (config.aiSources?.current || "custom");
  const credentials = await getApiCredentialsForSource(config, source, params.modelOverride);
  const transport = await resolveSdkTransport(credentials);
  const skipClaudeLogin = config.terminal?.skipClaudeLogin !== false;
  const embeddedClaudeConfigDir = skipClaudeLogin ? getEmbeddedClaudeConfigDir() : null;
  if (skipClaudeLogin && embeddedClaudeConfigDir) {
    try {
      ensureEmbeddedClaudeGlobalConfig({
        configDir: embeddedClaudeConfigDir,
        apiKey: transport.anthropicApiKey,
        workDir: params.workDir
      });
    } catch (error) {
      console.warn("[PTY] Failed to seed embedded Claude config", error);
    }
  }
  return {
    env: {
      ANTHROPIC_API_KEY: transport.anthropicApiKey,
      ANTHROPIC_BASE_URL: transport.anthropicBaseUrl,
      DISABLE_TELEMETRY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      NO_PROXY: "localhost,127.0.0.1",
      no_proxy: "localhost,127.0.0.1",
      ...embeddedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: embeddedClaudeConfigDir } : {}
    },
    model: credentials.model,
    skipClaudeLogin
  };
}
function getEmbeddedClaudeConfigDir() {
  const configDir = require$$1.join(getHaloDir(), "claude-code", "embedded");
  if (!fs$l.existsSync(configDir)) {
    fs$l.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}
function findClaudeCliPath() {
  const candidates = [
    require$$1.join(electron.app.getAppPath(), "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    require$$1.join(unwrapAsarPath(electron.app.getAppPath()), "node_modules", "@anthropic-ai", "claude-code", "cli.js")
  ];
  try {
    candidates.push(require.resolve("@anthropic-ai/claude-code/cli.js"));
  } catch {
  }
  candidates.push(
    require$$1.join(__dirname, "..", "..", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    require$$1.join(unwrapAsarPath(__dirname), "..", "..", "node_modules", "@anthropic-ai", "claude-code", "cli.js")
  );
  const resolvedPath = Array.from(new Set(candidates)).find((candidate) => fs$l.existsSync(candidate));
  if (resolvedPath) {
    return resolvedPath;
  }
  throw new Error(
    "Claude Code CLI not found. Please ensure @anthropic-ai/claude-code is installed."
  );
}
async function createPty(options) {
  const { id, spaceId, cols, rows, source, modelOverride } = options;
  const existing = ptyInstances.get(id);
  if (existing?.isAlive) {
    resizePty(id, cols, rows);
    return { model: existing.model };
  }
  if (existing) {
    destroyPty(id);
  }
  let electronPath = "";
  let cliPath = "";
  let workDir = "";
  let helperPath = null;
  try {
    cliPath = findClaudeCliPath();
    electronPath = process.execPath;
    workDir = getWorkingDir(spaceId);
    helperPath = validatePtyLaunchPrerequisites({ electronPath, cliPath, workDir }).helperPath;
    const nodePty = getPty();
    const { env: claudeEnv, model, skipClaudeLogin } = await resolveClaudeCliEnv({
      workDir,
      source,
      modelOverride
    });
    const args = [cliPath, "--model", model];
    const spawnEnv = {
      ...process.env
    };
    if (skipClaudeLogin) {
      delete spawnEnv.ANTHROPIC_AUTH_TOKEN;
      delete spawnEnv.CLAUDE_CONFIG_DIR;
    }
    console.log(
      `[PTY] Creating terminal ${id} with model ${model} in ${workDir} (${skipClaudeLogin ? "local-model mode" : "default auth mode"})`
    );
    const ptyProcess = nodePty.spawn(electronPath, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: workDir,
      env: {
        ...spawnEnv,
        ELECTRON_RUN_AS_NODE: "1",
        // Don't set ELECTRON_NO_ATTACH_CONSOLE - we need TTY interaction
        ...claudeEnv
      }
    });
    const instance2 = {
      id,
      pty: ptyProcess,
      spaceId,
      model,
      isAlive: true
    };
    ptyInstances.set(id, instance2);
    ptyProcess.onData((data) => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send("pty:data", { id, data });
      }
    });
    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[PTY] Terminal ${id} exited with code ${exitCode}`);
      instance2.isAlive = false;
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send("pty:exit", { id, exitCode });
      }
    });
    return { model };
  } catch (error) {
    const wrappedError = wrapPtyStartupError(error, {
      electronPath,
      cliPath,
      workDir,
      helperPath
    });
    console.error(`[PTY] Failed to create terminal ${id}:`, wrappedError.message);
    throw wrappedError;
  }
}
function writePty(id, data) {
  const instance2 = ptyInstances.get(id);
  if (instance2?.isAlive) {
    instance2.pty.write(data);
  }
}
function resizePty(id, cols, rows) {
  const instance2 = ptyInstances.get(id);
  if (instance2?.isAlive) {
    try {
      instance2.pty.resize(cols, rows);
    } catch (e) {
      console.error(`[PTY] Failed to resize terminal ${id}:`, e);
    }
  }
}
function destroyPty(id) {
  const instance2 = ptyInstances.get(id);
  if (instance2) {
    console.log(`[PTY] Destroying terminal ${id}`);
    if (instance2.isAlive) {
      try {
        instance2.pty.kill();
      } catch (e) {
        console.error(`[PTY] Failed to kill terminal ${id}:`, e);
      }
    }
    ptyInstances.delete(id);
  }
}
function destroyAllPtys() {
  console.log(`[PTY] Destroying all terminals (${ptyInstances.size} active)`);
  for (const id of Array.from(ptyInstances.keys())) {
    destroyPty(id);
  }
}
function getPtyInfo(id) {
  const instance2 = ptyInstances.get(id);
  if (!instance2) return null;
  return { model: instance2.model, isAlive: instance2.isAlive };
}
function getPtyIds() {
  return Array.from(ptyInstances.keys());
}
function registerPtyHandlers(mainWindow2) {
  if (!mainWindow2) {
    console.warn("[PTY IPC] No main window provided, skipping registration");
    return;
  }
  setPtyMainWindow(mainWindow2);
  ipcHandle("pty:create", async (_e, options) => {
    return await createPty(options);
  });
  ipcHandle("pty:write", (_e, id, data) => {
    writePty(id, data);
  });
  ipcHandle("pty:resize", (_e, id, cols, rows) => {
    resizePty(id, cols, rows);
  });
  ipcHandle("pty:destroy", (_e, id) => {
    destroyPty(id);
  });
  ipcHandle("pty:list", () => {
    return getPtyIds();
  });
  ipcHandle("pty:info", (_e, id) => {
    return getPtyInfo(id);
  });
}
function initializeExtendedServices(mainWindow2) {
  const start = performance.now();
  console.log("[Bootstrap] Extended services starting...");
  registerOnboardingHandlers();
  registerGitBashHandlers(mainWindow2);
  registerPtyHandlers(mainWindow2);
  registerSkillHandlers();
  registerExtensionHandlers();
  initializeExtensions();
  initializeRegistry().then(() => {
    startSkillWatcher();
    console.log("[Bootstrap] Skill system initialized");
  }).catch((err) => {
    console.error("[Bootstrap] Skill initialization failed:", err);
  });
  if (process.platform === "win32") {
    initializeGitBashOnStartup().then((status) => {
      console.log("[Bootstrap] Git Bash status:", status);
    }).catch((err) => {
      console.error("[Bootstrap] Git Bash initialization failed:", err);
    });
  }
  const duration = performance.now() - start;
  console.log(`[Bootstrap] Extended services registered in ${duration.toFixed(1)}ms`);
  if (!mainWindow2.isDestroyed()) {
    mainWindow2.webContents.send("bootstrap:extended-ready", {
      timestamp: Date.now(),
      duration
    });
    console.log("[Bootstrap] Sent bootstrap:extended-ready to renderer");
  }
}
function cleanupExtendedServices() {
  destroyAllPtys();
  shutdownExtensions();
  console.log("[Bootstrap] Extended services cleaned up");
}
const AnalyticsEvents = {
  // Lifecycle events
  APP_INSTALL: "app_install",
  // First install (first launch)
  APP_LAUNCH: "app_launch",
  // App launch
  APP_UPDATE: "app_update"
  // Version update
};
const DEFAULT_OPTIONS = {
  timeout: 1e4,
  // 10 second timeout
  maxRetries: 2,
  // Max 2 retries
  debug: false
};
class BaseProvider {
  constructor(options) {
    this._initialized = false;
    this._userId = "";
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  get initialized() {
    return this._initialized;
  }
  /**
   * Initialize provider
   */
  async init(userId) {
    this._userId = userId;
    this._initialized = true;
    this.log(`initialized with userId: ${userId.slice(0, 8)}...`);
  }
  /**
   * HTTP request with retry
   */
  async fetchWithRetry(url2, options, retries = this.options.maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    try {
      const response = await fetch(url2, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok && retries > 0) {
        this.log(`request failed with ${response.status}, retrying... (${retries} left)`);
        return this.fetchWithRetry(url2, options, retries - 1);
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (retries > 0) {
        this.log(`request error: ${error}, retrying... (${retries} left)`);
        return this.fetchWithRetry(url2, options, retries - 1);
      }
      throw error;
    }
  }
  /**
   * Safe track (won't throw exceptions)
   */
  async safeTrack(trackFn) {
    try {
      await trackFn();
    } catch (error) {
      this.log(`track failed: ${error}`);
    }
  }
  /**
   * Log output
   */
  log(message) {
    if (this.options.debug || process.env.NODE_ENV === "development") {
      console.log(`[Analytics:${this.name}] ${message}`);
    }
  }
}
class GAProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = "GA4";
    this.endpoint = "https://www.google-analytics.com/mp/collect";
    this.debugEndpoint = "https://www.google-analytics.com/debug/mp/collect";
    this.measurementId = config.measurementId;
    this.apiSecret = config.apiSecret;
  }
  /**
   * Initialize GA4 Provider
   */
  async init(userId) {
    await super.init(userId);
    if (!this.measurementId || this.measurementId === "G-XXXXXXXXXX") {
      this.log("Measurement ID not configured, provider disabled");
      this._initialized = false;
      return;
    }
    if (!this.apiSecret || this.apiSecret === "YOUR_GA_API_SECRET") {
      this.log("API Secret not configured, provider disabled");
      this._initialized = false;
      return;
    }
    this.log("ready");
  }
  /**
   * Track event to GA4
   *
   * GA4 Measurement Protocol format:
   * POST https://www.google-analytics.com/mp/collect?measurement_id=G-XXX&api_secret=XXX
   * Body: { client_id, events: [{ name, params }] }
   */
  async track(event, context) {
    if (!this._initialized) {
      return;
    }
    await this.safeTrack(async () => {
      const ga4Event = {
        name: this.sanitizeEventName(event.name),
        params: {
          // Standard params
          engagement_time_msec: 1,
          // Must be > 0 to appear in realtime reports
          // Custom params
          app_version: context.appVersion,
          platform: context.platform,
          arch: context.arch,
          electron_version: context.electronVersion,
          // Merge user-provided properties
          ...this.sanitizeParams(event.properties)
        }
      };
      const payload = {
        client_id: this._userId,
        // user_id is optional, for cross-device tracking (can be set after login)
        // user_id: this._userId,
        events: [ga4Event]
      };
      if (event.timestamp) {
        payload.timestamp_micros = (event.timestamp * 1e3).toString();
      }
      const url2 = `${this.endpoint}?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;
      const response = await this.fetchWithRetry(url2, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        this.log(`tracked: ${event.name}`);
      } else {
        const errorText = await response.text().catch(() => "");
        this.log(`track failed: ${response.status} ${errorText}`);
      }
    });
  }
  /**
   * Sanitize event name to comply with GA4 requirements
   *
   * GA4 event name rules:
   * - Max 40 characters
   * - Only letters, numbers, underscores
   * - Must start with a letter
   */
  sanitizeEventName(name) {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = "e_" + sanitized;
    }
    return sanitized.slice(0, 40);
  }
  /**
   * Sanitize params to comply with GA4 requirements
   *
   * GA4 param rules:
   * - Param name max 40 characters
   * - Param value max 100 characters (standard properties)
   */
  sanitizeParams(params) {
    if (!params) return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(params)) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
      if (typeof value === "string") {
        sanitized[sanitizedKey] = value.slice(0, 100);
      } else if (typeof value === "number" || typeof value === "boolean") {
        sanitized[sanitizedKey] = value;
      } else if (value !== null && value !== void 0) {
        sanitized[sanitizedKey] = String(value).slice(0, 100);
      }
    }
    return sanitized;
  }
  /**
   * Validate event format (for debugging)
   * Uses GA4 debug endpoint to validate request format
   */
  async validateEvent(event, context) {
    const ga4Event = {
      name: this.sanitizeEventName(event.name),
      params: {
        engagement_time_msec: 1,
        ...this.sanitizeParams(event.properties)
      }
    };
    const payload = {
      client_id: this._userId,
      events: [ga4Event]
    };
    const url2 = `${this.debugEndpoint}?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;
    try {
      const response = await fetch(url2, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      const validationMessages = result.validationMessages || [];
      return {
        valid: validationMessages.length === 0,
        messages: validationMessages.map((m) => m.description)
      };
    } catch (error) {
      return {
        valid: false,
        messages: [`Validation request failed: ${error}`]
      };
    }
  }
}
function createGAProvider(measurementId, apiSecret) {
  return new GAProvider({
    measurementId,
    apiSecret,
    debug: process.env.NODE_ENV === "development"
  });
}
class BaiduProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = "Baidu";
    this.siteId = config.siteId;
  }
  /**
   * Initialize Baidu Analytics Provider
   */
  async init(userId) {
    await super.init(userId);
    if (!this.siteId || this.siteId === "YOUR_BAIDU_SITE_ID") {
      this.log("Site ID not configured, provider disabled");
      this._initialized = false;
      return;
    }
    this.log("ready (will track via renderer process)");
  }
  /**
   * Track event to Baidu Analytics
   * Sends message to renderer process to call _hmt.push
   */
  async track(event, context) {
    if (!this._initialized) {
      return;
    }
    await this.safeTrack(async () => {
      const windows = electron.BrowserWindow.getAllWindows();
      const mainWindow2 = windows.find((w) => !w.isDestroyed());
      if (!mainWindow2) {
        this.log("No window available for tracking");
        return;
      }
      const trackData = {
        type: "trackEvent",
        category: "app",
        action: event.name,
        label: context.appVersion,
        value: event.timestamp || Date.now(),
        // Extra info (Baidu Analytics custom variables)
        customVars: {
          userId: this._userId,
          platform: context.platform,
          arch: context.arch,
          ...event.properties
        }
      };
      const sendTrackData = () => {
        if (mainWindow2.isDestroyed()) return;
        mainWindow2.webContents.send("analytics:track", trackData);
        this.log(`tracked: ${event.name}`);
      };
      if (mainWindow2.webContents.isLoading()) {
        mainWindow2.webContents.once("did-finish-load", sendTrackData);
      } else {
        setTimeout(sendTrackData, 100);
      }
    });
  }
  /**
   * Get site ID (for renderer process SDK initialization)
   */
  getSiteId() {
    return this.siteId;
  }
}
function createBaiduProvider(siteId) {
  return new BaiduProvider({
    siteId,
    debug: process.env.NODE_ENV === "development"
  });
}
const PROVIDER_CONFIG = {
  baidu: {
    siteId: ""
  },
  ga: {
    measurementId: "",
    apiSecret: ""
  }
};
class AnalyticsService {
  constructor() {
    this.providers = [];
    this.userContext = null;
    this.config = null;
    this._initialized = false;
  }
  static {
    this.instance = null;
  }
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }
  /**
   * Whether the service is initialized
   */
  get initialized() {
    return this._initialized;
  }
  /**
   * Initialize Analytics service
   * Should be called after app.whenReady()
   */
  async init() {
    if (is.dev) {
      console.log("[Analytics] Skipping in development mode");
      return;
    }
    if (this._initialized) {
      console.log("[Analytics] Already initialized");
      return;
    }
    console.log("[Analytics] Initializing...");
    this.config = this.loadOrCreateConfig();
    this.userContext = this.buildUserContext();
    await this.initProviders();
    this._initialized = true;
    console.log("[Analytics] Initialized successfully");
    await this.handleLifecycleEvents();
  }
  /**
   * Track an event
   * @param eventName Event name (use AnalyticsEvents constants)
   * @param properties Event properties (optional)
   */
  async track(eventName, properties) {
    if (!this._initialized || !this.userContext) {
      console.warn("[Analytics] Not initialized, event dropped:", eventName);
      return;
    }
    const event = {
      name: eventName,
      properties,
      timestamp: Date.now()
    };
    console.log(`[Analytics] Tracking: ${eventName}`, properties || "");
    await Promise.allSettled(
      this.providers.map(
        (provider) => provider.track(event, this.userContext)
      )
    );
  }
  /**
   * Load or create Analytics config
   */
  loadOrCreateConfig() {
    const config = getConfig();
    const currentVersion = electron.app.getVersion();
    if (!config.analytics) {
      const newAnalyticsConfig = {
        userId: crypto.randomUUID(),
        lastVersion: currentVersion
      };
      saveConfig({ analytics: newAnalyticsConfig });
      console.log("[Analytics] Created new config with userId:", newAnalyticsConfig.userId.slice(0, 8) + "...");
      return newAnalyticsConfig;
    }
    return config.analytics;
  }
  /**
   * Build user context
   */
  buildUserContext() {
    return {
      userId: this.config.userId,
      appVersion: electron.app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron
    };
  }
  /**
   * Initialize all providers
   */
  async initProviders() {
    const userId = this.config.userId;
    try {
      const baiduProvider = createBaiduProvider(PROVIDER_CONFIG.baidu.siteId);
      await baiduProvider.init(userId);
      if (baiduProvider.initialized) {
        this.providers.push(baiduProvider);
      }
    } catch (error) {
      console.warn("[Analytics] Baidu provider init failed:", error);
    }
    try {
      const gaProvider = createGAProvider(
        PROVIDER_CONFIG.ga.measurementId,
        PROVIDER_CONFIG.ga.apiSecret
      );
      await gaProvider.init(userId);
      if (gaProvider.initialized) {
        this.providers.push(gaProvider);
      }
    } catch (error) {
      console.warn("[Analytics] GA4 provider init failed:", error);
    }
    console.log(
      `[Analytics] ${this.providers.length} provider(s) active:`,
      this.providers.map((p) => p.name).join(", ") || "none"
    );
  }
  /**
   * Handle lifecycle events
   */
  async handleLifecycleEvents() {
    const config = getConfig();
    const currentVersion = electron.app.getVersion();
    const lastVersion = this.config.lastVersion;
    if (config.isFirstLaunch) {
      await this.track(AnalyticsEvents.APP_INSTALL);
    } else if (lastVersion && lastVersion !== currentVersion) {
      await this.track(AnalyticsEvents.APP_UPDATE, {
        from_version: lastVersion,
        to_version: currentVersion
      });
    }
    await this.track(AnalyticsEvents.APP_LAUNCH);
    if (lastVersion !== currentVersion) {
      saveConfig({
        analytics: {
          ...this.config,
          lastVersion: currentVersion
        }
      });
    }
  }
  /**
   * Get user ID (for future account binding)
   */
  getUserId() {
    return this.config?.userId || null;
  }
  /**
   * Get Baidu Analytics site ID (for renderer process SDK initialization)
   */
  getBaiduSiteId() {
    return PROVIDER_CONFIG.baidu.siteId;
  }
}
const analytics = AnalyticsService.getInstance();
async function initAnalytics() {
  await analytics.init();
}
function registerProtocols() {
  electron.protocol.handle("halo-file", (request) => {
    const filePath = decodeURIComponent(request.url.replace("skillsfan-file://", ""));
    return electron.net.fetch(`file://${filePath}`);
  });
  console.log("[Protocol] Registered halo-file:// protocol");
}
process.on("uncaughtException", (error) => {
  if (error.message?.includes("EPIPE")) {
    console.warn("[Main] Ignored EPIPE error during shutdown");
    return;
  }
  throw error;
});
if (process.platform === "win32") {
  electron.app.disableHardwareAcceleration();
  electron.app.commandLine.appendSwitch("disable-gpu");
}
electron.app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.exit(0);
}
electron.app.on("second-instance", () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    if (process.platform === "darwin") {
      electron.app.dock?.show();
    }
  }
});
let mainWindow = null;
function createAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    // App menu (macOS only)
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Check for Updates...",
            click: () => checkForUpdates()
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    // File menu
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }]
    },
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...isMac ? [
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" }
        ] : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]
      ]
    },
    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]
      ]
    },
    // Help menu (Windows: includes Check for Updates)
    {
      role: "help",
      submenu: [
        ...!isMac ? [
          {
            label: "Check for Updates...",
            click: () => checkForUpdates()
          },
          { type: "separator" }
        ] : [],
        {
          label: "Learn More",
          click: async () => {
            await electron.shell.openExternal("https://github.com/openkursar/hello-halo");
          }
        }
      ]
    }
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
function createWindow() {
  const isMac = process.platform === "darwin";
  const configTheme = getConfig().appearance.theme;
  const isDarkMode = configTheme === "dark" ? true : configTheme === "system" ? electron.nativeTheme.shouldUseDarkColors : false;
  const backgroundColor = isDarkMode ? "#0a0a0a" : "#ffffff";
  mainWindow = new electron.BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // macOS: hiddenInset - hides title bar, insets traffic lights into content area
    // Windows/Linux: hidden + titleBarOverlay for native buttons overlay
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    // Windows/Linux: native window controls overlay in content area
    titleBarOverlay: !isMac ? {
      color: backgroundColor,
      symbolColor: isDarkMode ? "#ffffff" : "#1a1a1a",
      height: 40
    } : void 0,
    backgroundColor,
    webPreferences: {
      preload: require$$1.join(__dirname, "../preload/index.cjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    console.log("[Main] ready-to-show event fired");
    mainWindow?.show();
  });
  mainWindow.webContents.on("did-finish-load", async () => {
    if (process.platform !== "win32") {
      const { default: fixPath } = await import("fix-path");
      fixPath();
    }
  });
  mainWindow.on("close", (event) => {
    if (getIsQuitting()) {
      return;
    }
    if (getMinimizeToTray()) {
      event.preventDefault();
      mainWindow?.hide();
      if (process.platform === "darwin") {
        electron.app.dock?.hide();
      }
      if (!hasTray()) {
        createTray(mainWindow);
      }
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(require$$1.join(__dirname, "../renderer/index.html"));
  }
  if (is.dev) {
    mainWindow.webContents.openDevTools();
  }
}
electron.app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.halo.app");
  registerProtocols();
  electron.app.on("browser-window-created", (_, window2) => {
    optimizer.watchWindowShortcuts(window2);
  });
  await initializeApp();
  createAppMenu();
  createWindow();
  if (mainWindow) {
    initializeEssentialServices(mainWindow);
  }
  if (mainWindow) {
    mainWindow.once("ready-to-show", () => {
      setImmediate(() => {
        initializeExtendedServices(mainWindow);
        initAnalytics().catch((err) => console.warn("[Analytics] Init failed:", err));
      });
    });
  }
  if (getMinimizeToTray()) {
    createTray(mainWindow);
  }
  electron.app.on("activate", function() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      electron.app.dock?.show();
    } else if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("before-quit", () => {
  setIsQuitting(true);
});
electron.app.on("window-all-closed", () => {
  if (getMinimizeToTray() && !getIsQuitting()) {
    return;
  }
  stopOpenAICompatRouter().catch(console.error);
  cleanupExtendedServices();
  destroyTray();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
function getMainWindow() {
  return mainWindow;
}
exports.getMainWindow = getMainWindow;
//# sourceMappingURL=index.cjs.map
