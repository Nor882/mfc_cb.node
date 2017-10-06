'use strict';

let Promise = require('bluebird');
let colors  = require('colors/safe');
let bhttp   = require('bhttp');
let cheerio = require('cheerio');
let common  = require('./common');

let session = bhttp.session();
let me; // backpointer for common printing methods

let modelsToCap = [];
let onlineModels = new Map();
let modelState = new Map();
let currentlyCapping = new Map();

function findOnlineModels() {
  return Promise.try(function() {
    return bhttp.get('http://chaturbate.com/affiliates/api/onlinerooms/?wm=mnzQo&format=json&gender=f');
  }).then(function(response) {
    for (let i = 0; i < response.body.length; i++) {
      onlineModels.set(response.body[i].username, response.body[i].current_show);
    }
  })
  .catch(function(err) {
    common.errMsg(me, err.toString());
  });
}

function getStream(nm) {
  return Promise.try(function() {
    return session.get('https://chaturbate.com/' + nm + '/');
  }).then(function (response) {
    let url = '';
    let page = cheerio.load(response.body);

    let scripts = page('script')
    .map(function(){
      return page(this).text();
    }).get().join('');

    let streamData = scripts.match(/(https\:\/\/\w+\.stream\.highwebmedia\.com\/live-edge\/[\w\-]+\/playlist\.m3u8)/i);

    if (streamData !== null) {
      url = streamData[1];
    } else {
      streamData = scripts.match(/(https\:\/\/\w+\.stream\.highwebmedia\.com\/live-edge\/amlst\:[\w\-]+\/playlist\.m3u8)/i);
      if (streamData !== null) {
        url = streamData[1];
      } else {
        // CB's JSON for online models does not update quickly when a model
        // logs off, and the JSON can take up to 30 minutes to update.
        // When a model is offline, the models page redirect to a login
        // page and there won't be a match for the m3u8 regex.
        // Temporarily commenting out the error, until a better solution
        // is coded.
        //common.errMsg(me, nm + ', failed to find m3u8 stream');
      }
    }

    //common.dbgMsg(me, 'url = ' + url);
    return url;
  })
  .catch(function(err) {
    common.errMsg(me, colors.model(nm) + ': ' + err.toString());
  });
}

function haltCapture(nm) {
  if (currentlyCapping.has(nm)) {
    let capInfo = currentlyCapping.get(nm);
    capInfo.captureProcess.kill('SIGINT');
  }
}

module.exports = {
  create: function(myself) {
    me = myself;
  },

  clearMyModels: function() {
    modelsToCap = [];
    return findOnlineModels();
  },

  checkModelState: function(nm) {
    return Promise.try(function() {
      let msg = colors.model(nm);
      let isBroadcasting = 0;
      if (onlineModels.has(nm)) {
        let currState = onlineModels.get(nm);
        if (currState === 'public') {
          msg = msg + ' is in public chat!';
          modelsToCap.push({uid: nm, nm: nm});
          isBroadcasting = 1;
        } else if (currState === 'private') {
          msg = msg + ' is in a private show.';
        } else if (currState === 'away') {
          msg = msg + colors.model('\'s') + ' cam is off.';
        } else if (currState === 'hidden') {
          msg = msg + ' model is online but hidden.';
        } else {
          msg = msg + ' has unknown state ' + currState;
        }
        if (!modelState.has(nm) || (modelState.has(nm) && currState !== modelState.get(nm))) {
          common.msg(me, msg);
        }
        modelState.set(nm, currState);
      } else {
        if (modelState.has(nm) && modelState.get(nm) !== 'offline') {
          msg = msg + ' has logged off.';
        } else {
          modelState.set(nm, 'offline');
        }
      }
      if (currentlyCapping.has(nm) && isBroadcasting === 0) {
        common.dbgMsg(me, colors.model(nm) + ' is not broadcasting, but ffmpeg is still active. Terminating with SIGINT.');
        haltCapture(nm);
      }
      return true;
    });
  },

  updateWindowModelCapCount: function() {
      process.stdout.write(
          String.fromCharCode(27) + "]0;" + "Currently Recording: " + this.getNumCapsInProgress() + String.fromCharCode(7)
      );
  },

  getModelsToCap: function() {
    return modelsToCap;
  },

  addModelToCapList: function(model, filename, captureProcess) {
    currentlyCapping.set(model.uid, {nm: model.nm, filename: filename, captureProcess: captureProcess});
  },

  removeModelFromCapList: function(model) {
    currentlyCapping.delete(model.uid);
  },

  getNumCapsInProgress: function() {
    return currentlyCapping.size;
  },

  haltCapture: function(model) {
    haltCapture(model.nm);
  },

  checkFileSize: function(captureDirectory, maxByteSize) {
    common.checkFileSize(me, captureDirectory, maxByteSize, currentlyCapping);
  },

  setupCapture: function(model, tryingToExit) {
    if (currentlyCapping.has(model.uid)) {
      common.dbgMsg(me, colors.model(model.nm) + ' is already capturing');
      return Promise.try(function() {
        return {spawnArgs: '', filename: '', model: ''};
      });
    }

    if (tryingToExit) {
      common.dbgMsg(me, colors.model(model.nm) + ' is now online, but capture not started due to ctrl+c');
      return Promise.try(function() {
        return {spawnArgs: '', filename: '', model: ''};
      });
    }

    return Promise.try(function() {
      return getStream(model.nm);
    }).then(function (url) {
      let filename = common.getFileName(me, model.nm);
      let spawnArgs = common.getCaptureArguments(url, filename);

      if (url === '') {
        return {spawnArgs: '', filename: filename, model: model};
      } else {
        return {spawnArgs: spawnArgs, filename: filename, model: model};
      }
    })
    .catch(function(err) {
      common.errMsg(me, colors.model(model.nm) + ' ' + err.toString());
    });
  }
};


