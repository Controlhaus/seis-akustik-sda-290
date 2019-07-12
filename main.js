const argv = require('yargs').argv;
const repl = require('repl');
const net = require('net');

var serviceName = argv.serviceName || 'Seis Akustik SDA-290';
var ipAddress = argv.ipAddress;
var port = argv.port || 23;
var heartbeatInterval = argv.heartbeatInterval || 10000;
var debug = argv.debug || false;
var client;
var heartbeat;
var reconnectTimeout;
var doNotReconnect;
var retrying;

var pollCommands = ['gp\n', 'gr\n', 'gl\n', 'gm\n'];
var pollCommandIndex = 0;
var polling = false;
var sentCommand = '';
var sentCommandAck = false;

var ipAddress;
var ipMask;
var ipGateway;
var macAddress;
var rxBuffer = '';

/* Startup */

connect();

/* Command Line Interface */

repl.start({ prompt: '> ', eval: evaulateCliCommands });
function evaulateCliCommands(command, context, filename, callback) {
  processCommand(command);
  callback(null);
}

function log(message) {
  if (debug) {
    console.log(serviceName + ': ' + message);
  }
}

/* Catch Connect Client Messages */

process.on("message", (data) => {
  processCommand(data);
});

function sendResponse(response) {
  log('Sending response to parent...');
  log(response);
  //process.send only exists if the app is started as a child process
  if (typeof process.send === 'function') {
    process.send(response);
  }
}

/* Exit cleanly */

function exitHandler(options, exitCode) {
  if (options.cleanup) {
    log('exitHandler cleanup');
    close();
  }
  if (exitCode || exitCode === 0) log('exitHandler exitCode: ' + exitCode);
  if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));

/* Create Device Commands */

function processCommand(command) {
  log('Processing Command: ' + command);
  command = command.trim();
  var commandArray = command.split(',');
  if (commandArray.length > 1) {
    switch (commandArray[0]) {
      case 'setInputLevel':
        if (commandArray.length === 3) {
          if (commandArray[2].length === 1) {
            commandArray[2] = '00' + commandArray[2];
          } else if (commandArray[2].length === 2) {
            commandArray[2] = '0' + commandArray[2];
          }
          if (commandArray[1] === '10') {
            commandArray[1] = 'a'
          } else if (commandArray[1] === '11') {
            commandArray[1] = 'b'
          } if (commandArray[1] === '12') {
            commandArray[1] = 'c'
          }
          sendCommandToSocket('mp' + commandArray[1] + '=' + commandArray[2] + '\n');
          log('Input Level ' + commandArray[1] + ' = ' + commandArray[2]);
          sendResponse('inputLevel,' + commandArray[1] + '=' + commandArray[2]);
        }
        break;
      case 'setInputMute':
        if (commandArray.length === 3) {
          if (commandArray[1] === '10') {
            commandArray[1] = 'a'
          } else if (commandArray[1] === '11') {
            commandArray[1] = 'b'
          } if (commandArray[1] === '12') {
            commandArray[1] = 'c'
          }
          sendCommandToSocket('ma' + commandArray[1] + '=' + commandArray[2] + '\n');
          log('Input Mute ' + commandArray[1] + ' = ' + commandArray[2]);
          sendResponse('inputMute,' + commandArray[1] + '=' + commandArray[2]);
        }
        break;
      case 'setOutputLevel':
        if (commandArray.length === 3) {
          if (commandArray[2].length === 1) {
            commandArray[2] = '00' + commandArray[2];
          } else if (commandArray[2].length === 2) {
            commandArray[2] = '0' + commandArray[2];
          }
          sendCommandToSocket('ap' + commandArray[1] + '=' + commandArray[2] + '\n');
          log('Output Level ' + commandArray[1] + ' = ' + commandArray[2]);
          sendResponse('outputLevel,' + commandArray[1] + '=' + commandArray[2]);

        }
        break;
      case 'setOutputMute':
        if (commandArray.length === 3) {
          sendCommandToSocket('aa' + commandArray[1] + '=' + commandArray[2] + '\n');
          log('Output Mute ' + commandArray[1] + ' = ' + commandArray[2]);
          sendResponse('outputMute,' + commandArray[1] + '=' + commandArray[2]);
        }
        break;
      case 'setMasterLevel':
        if (commandArray.length === 2) {
          if (commandArray[1].length === 1) {
            commandArray[1] = '00' + commandArray[1];
          } else if (commandArray[1].length === 2) {
            commandArray[1] = '0' + commandArray[1];
          }
          sendCommandToSocket('apm=' + commandArray[1] + '\n');
          log('Master Level = ' + commandArray[1]);
          sendResponse('masterLevel=' + commandArray[1]);
        }
        break;
      // case 'setMasterMute': // Not available from API
      //   sendCommandToSocket();
      //   log('Master Mute = ' + commandArray[i]);
      //   sendResponse('masterMute=' + commandArray[i]);
      //   break;
      case 'setRelay':
        if (commandArray.length === 3) {
          sendCommandToSocket('la' + commandArray[1] + '=' + commandArray[2] + '\n');
          log('Relay ' + commandArray[1] + ' = ' + commandArray[2]);
          sendResponse('relay,' + commandArray[1] + '=' + commandArray[2]);    
        }
        break;
      case 'recallPreset':
        if (commandArray.length === 2) {
          sendCommandToSocket('pr' + commandArray[1] + '\n');
          log('Active Preset: ' + commandArray[1]);
          sendResponse('preset=' + commandArray[1]);
        }
        break;
      case 'writePreset':
        if (commandArray.length === 2) {
          sendCommandToSocket('pw' + commandArray[1] + '\n');
        }
        break;
      // default:
      //   sendCommandToSocket(command + '\n');
      // break;
    }
  } else {
    switch (command) {
      case 'connect\n':
        connect();
        break;
      case 'close\n':
        close();
        break;
      default:
        sendToSocket(command);
        break;
    }
  }
}

function sendCommandToSocket(command) {
  log('Sending to socket: ' + command);
  sentCommand = command;
  sendToSocket(command);
}

/* Parse Device Responses */
function parseResponse(response) {
  isAlive = true;
  if (response === sentCommand) {
    log('Command acknowledged: ' + response);
    sentCommand = '';
    sentCommandAck = true;
    return;
  }
  // Parse front panel preset changes.
  if (response.includes('PRESET')) {
    parsePreset(response);
    return;
  }
  // Parse front panel level changes.
  if (response.includes('LEVEL')) {
    sendToSocket('gp\n');
    return;
  }
  // Parse front panel relay changes.
  if (response.includes('RELAIS')) {
    sendToSocket('gl\n');
    return;
  }
  // Append to rx buffer is message is incomplete.
  if (!response.includes('OK')) {
    rxBuffer = rxBuffer + response;
    return;
  }
  // Parse buffer when message is complete.
  if (response.includes('OK') && rxBuffer.length > 0) {
    let trimmedResponse = response.trim();
    //Sometimes the last value and OK are received at the same time.
    //Other times only OK is received.
    if (trimmedResponse === 'OK') {
      rxBuffer = rxBuffer.slice(0, -1);
      parseRxBuffer(rxBuffer);
      rxBuffer = '';
      return;
    }
    trimmedResponse = trimmedResponse.replace('OK', '');
    rxBuffer = rxBuffer + trimmedResponse;
    rxBuffer = rxBuffer.slice(0, -1);
    parseRxBuffer(rxBuffer);
    rxBuffer = '';
    return;
  }
  // Poll all values on every change.
  // This was causing larger systems to lag. Changed to update values from incoming commands.
  // if (response.includes('OK') && sentCommandAck === true) {
  //   sentCommandAck = false;
  //   rxBuffer = '';
  //   startPolling();
  // }
}

function parseRxBuffer(buffer) {
  let bufferArray = buffer.split('\n');
  switch (bufferArray[0]) {
    case 'gp':
      parseLevels(bufferArray);
      break;
    case 'gr':
      parseRouting(bufferArray);
      break;
    case 'gl':
      parseRelays(bufferArray);
      break;
    case 'gm':
      parseIoFlags(bufferArray);
      break;
    case 'help':
      parseHelp(bufferArray);
      break;
  }
}

function parsePreset(buffer) {
  log('Parsing preset with buffer: ' + buffer);
  let preset = parseString(buffer, 'PRESET ');
  preset = preset.trim();
  log('Active Preset: ' + preset);
  sendResponse('preset=' + preset);
}

function parseLevels(bufferArray) {
  log('Parsing levels.')
  if (bufferArray.length > 1) {
    for (var i = 1; i < bufferArray.length; i++) {
      bufferArray[i] = bufferArray[i].trim();
      if (i < 13) {
        log('Input Level ' + i + ' = ' + bufferArray[i]);
        sendResponse('inputLevel,' + i + '=' + bufferArray[i]);
      } else if (i < 19) {
        log('Output Level ' + (i - 12) + ' = ' + bufferArray[i]);
        sendResponse('outputLevel,' + i + '=' + bufferArray[i]);
      } else {
        log('Master Level = ' + bufferArray[i]);
        sendResponse('masterLevel=' + bufferArray[i]);
      }
    }
    checkPolling();
  }
}

function parseRouting(bufferArray) {
  log('Parsing routing.')
  if (bufferArray.length > 1) {
    for (var i = 1; i < bufferArray.length; i++) {
      log('Route ' + i + ' = ' + bufferArray[i]);
      // bufferArray[i] = bufferArray[i].trim();
      // sendResponse('route,' + i + '=' + bufferArray[i]);
    }
    checkPolling();
  }
}

function parseRelays(bufferArray) {
  log('Parsing relays.')
  if (bufferArray.length > 1) {
    for (var i = 1; i < bufferArray.length; i++) {
      bufferArray[i] = bufferArray[i].trim();
      log('Relay ' + i + ' = ' + bufferArray[i]);
      sendResponse('relay,' + i + '=' + bufferArray[i]);
    }
    checkPolling();
  }
}

function parseIoFlags(bufferArray) {
  log('Parsing IO flags.')
  if (bufferArray.length > 1) {
    for (var i = 1; i < bufferArray.length; i++) {
      if (i < 13) {
        bufferArray[i] = bufferArray[i].trim();
        log('Input Mute ' + i + ' = ' + bufferArray[i]);
        sendResponse('inputMute,' + i + '=' + bufferArray[i]);
      } else if (i < 19) {
        bufferArray[i] = bufferArray[i].trim();
        log('Output Mute ' + (i - 12) + ' = ' + bufferArray[i]);
        sendResponse('outputMute,' + (i - 12) + '=' + bufferArray[i]);
      } else {
        bufferArray[i] = bufferArray[i].trim();
        log('Master Mute = ' + bufferArray[i]);
        sendResponse('masterMute=' + bufferArray[i]);
      }

    }
    checkPolling();
  }
}

function parseHelp(bufferArray) {
  log('Parsing help.')
  if (bufferArray.length > 1) {
    for (var i = 1; i < bufferArray.length; i++) {
      if (bufferArray[i].includes('IP-Adresse')) {
        ipAddress = parseString(bufferArray[i], 'IP-Adresse: ');
        ipAddress = ipAddress.trim();
        log('ipAddress: ' + ipAddress);
        // sendResponse('ipAddress=' + ipAddress);
      }
      else if (bufferArray[i].includes('IP-Maske')) {
        ipMask = parseString(bufferArray[i], 'IP-Maske: ');
        ipMask = ipMask.trim();
        log('ipMask: ' + ipMask);
        // sendResponse('ipMask=' + ipMask);
      }
      else if (bufferArray[i].includes('IP-Gateway')) {
        ipGateway = parseString(bufferArray[i], 'IP-Gateway: ');
        ipGateway = ipGateway.trim();
        log('ipGateway: ' + ipGateway);
        // sendResponse('ipGateway=' + ipGateway);
      }
      else if (bufferArray[i].includes('MAC-Adresse')) {
        macAddress = parseString(bufferArray[i], 'MAC-Adresse: ');
        macAddress = macAddress.trim();
        log('macAddress: ' + macAddress);
        // sendResponse('macAddress=' + macAddress);
      }
    }
  }
}

function parseString(string, searchString) {
  let startIndex = string.indexOf(searchString);
  startIndex = startIndex + searchString.length;
  let result = string.substring(startIndex, string.length);
  result = result.trim();
  return result;
}

/* Socket Functions */

function sendToSocket(message) {
  if (client) {
    // log('Sending to socket: ' + message);
    client.write(message);
  } else {
    log('Cannot send to undefined socket.');
  }
}

function connect() {
  if (port && ipAddress) {
    log('Connecting with ip address: ' + ipAddress + ' and port: ' + port);
    client = new net.Socket();
    client.connect(port, ipAddress);

    client.on('data', (data) => {
      let msg = data.toString();
      log('Received from socket: ' + msg);
      parseResponse(msg);
    });

    client.on('connect', connectEventHandler.bind(this));
    client.on('end', endEventHandler.bind(this));
    client.on('timeout', timeoutEventHandler.bind(this));
    client.on('drain', drainEventHandler.bind(this));
    client.on('error', errorEventHandler.bind(this));
    client.on('close', closeEventHandler.bind(this));
  } else {
    log('Cannot connect with ip address: ' + ipAddress + ' and port: ' + port);
  }
}

function close() {
  if (client) {
    log('Closing socket.');
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    doNotReconnect = true;
    client.end();
  } else {
    log('Cannot close. Socket undefined. ');
  }
}

function startPolling() {
  if (polling === false) {
    pollCommandIndex = 0;
    polling = true;
    sendToSocket(pollCommands[0]);
  }
}

function checkPolling() {
  // log('Checking polling with index: ' + pollCommandIndex);
  if (pollCommandIndex != null) {
    if (pollCommandIndex < pollCommands.length - 1) {
      pollCommandIndex++;
      sendToSocket(pollCommands[pollCommandIndex]);
    } else {
      pollCommandIndex = null;
      polling = false;
    }
  }
}

/* Socket Event Handlers */

function connectEventHandler() {
  log('Socket connected.');
  sendResponse('catch-service-connected');
  retrying = false;
  client.setKeepAlive(true);
  startPolling();
  startHearbeat();
}

function startHearbeat() {
  isAlive = true;
  heartbeat = setInterval(checkHeartbeat, heartbeatInterval);
}

function checkHeartbeat() {
  if (isAlive === true) {
    if (polling === false) {
      isAlive = false;
      sendToSocket('help\n');
    }
    return;
  }
  log('Heartbeat timed out.');
  doNotReconnect = false;
  client.destroy();
}

function endEventHandler() {
  sendResponse('catch-service-disconnected');
  log('Socket end event.');
}

function timeoutEventHandler() {
  sendResponse('catch-service-disconnected');
  log('Socket timeout event.');
}

function drainEventHandler() {
  log('Socket drain event.');
}

function errorEventHandler(err) {
  log('Socket error: ' + err);
}

function closeEventHandler() {
  if (heartbeat) {
    clearInterval(heartbeat);
  }
  if (reconnectTimeout) {
    clearInterval(reconnectTimeout);
  }
  sendResponse('catch-service-disconnected');
  log('Socket closed.');
  if (!retrying && !doNotReconnect) {
    retrying = true;
    log('Reconnecting...');
  }
  if (!doNotReconnect) {
    reconnectTimeout = setTimeout(connect.bind(this), 10000);
  }
}