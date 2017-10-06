'use strict';

let fs     = require('fs');
let yaml   = require('js-yaml');
let moment = require('moment');
let colors = require('colors/safe');

let config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
let MFC;
let CB;

function getDateTime() {
  return moment().format(config.dateFormat);
}

function getSiteName(site) {
  let name;
  switch (site) {
    case MFC: name = 'MFC'; break;
    case CB:  name = 'CB '; break;
  }
  return name;
}

function msg(site, msg) {
  if (site === null) {
    console.log(colors.time('[' + getDateTime() + ']'), msg);
  } else {
    console.log(colors.time('[' + getDateTime() + ']'), colors.site(getSiteName(site)), msg);
  }
}

function errMsg(site, msg) {
  if (site === null) {
    console.log(colors.time('[' + getDateTime() + ']'), colors.error('[ERROR]'), msg);
  } else {
    console.log(colors.time('[' + getDateTime() + ']'), colors.site(getSiteName(site)), colors.error('[ERROR]'), msg);
  }
}

function dbgMsg(site, msg) {
  if (config.debug && msg) {
    if (site === null) {
      console.log(colors.time('[' + getDateTime() + ']'), colors.debug('[DEBUG]'), msg);
    } else {
      console.log(colors.time('[' + getDateTime() + ']'), colors.site(getSiteName(site)), colors.debug('[DEBUG]'), msg);
    }
  }
}

module.exports = {
  getSiteName,

  getDateTime: function() {
    return getDateTime();
  },

  writeFile: function(filename, msg) {
    fs.writeFile('/tmp/' + filename, msg, function(err) {
      if (err) {
          return console.log(err);
      }
    });
  },

  getFileName: function(site, nm) {
    let filename;
    if (config.includeSiteInFile) {
      filename = nm + '_' + getSiteName(site).trim().toLowerCase() + '_' + getDateTime();
    } else {
      filename = nm + '_' + getDateTime();
    }
    return filename;
  },

  checkFileSize: function(site, captureDirectory, maxByteSize, currentlyCapping) {
    if (maxByteSize > 0) {
      for (let capInfo of currentlyCapping.values()) {
        let stat = fs.statSync(captureDirectory + '/' + capInfo.filename + '.ts');
        dbgMsg(site, colors.model(capInfo.nm) + ' file size (' + capInfo.filename + '.ts), size=' + stat.size + ', maxByteSize=' + maxByteSize);
        if (stat.size >= maxByteSize) {
          msg(site, colors.model(capInfo.nm) + ' recording has exceeded file size limit (size=' + stat.size + ' > maxByteSize=' + maxByteSize + ')');
          capInfo.captureProcess.kill('SIGINT');
        }
      }
    }
  },

  setSites: function(mfcSite, cbSite) {
    MFC = mfcSite;
    CB = cbSite;
  },

  initColors: function() {
    colors.setTheme({
      model: config.modelcolor,
      time:  config.timecolor,
      site:  config.sitecolor,
      debug: config.debugcolor,
      error: config.errorcolor,
    });
  },

  getCaptureArguments: function(url, filename) {
      return [
        '-hide_banner',
        '-v',
        'fatal',
        '-i',
        url,
        '-c',
        'copy',
        '-vsync',
        '2',
        '-r',
        '60',
        '-b:v',
        '500k',
        config.captureDirectory + '/' + filename + '.ts'
    ];
  },

  msg: function(site, themsg) {
    msg(site, themsg);
  },

  errMsg: function(site, msg) {
    errMsg(site, msg);
  },

  dbgMsg: function(site, msg) {
    dbgMsg(site, msg);
  }
};

