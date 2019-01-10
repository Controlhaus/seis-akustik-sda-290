const argv = require('yargs').argv;
const repl = require('repl');
const net = require('net');

var serviceName = argv.serviceName || 'FSR FLEX-LT';
var ipAddress = argv.ipAddress;
var port = argv.port || 23;
var client;
var reconnectTimeout;
var doNotReconnect;
var retrying;

/* Startup */

connect();

/* Command Line Interface */

repl.start({ prompt: '> ', eval: evaulateCliCommands });
function evaulateCliCommands(command, context, filename, callback) {
  processCommand(command);
  callback(null, 'OK');
}

function log(message) {
  console.log(serviceName + ': ' + message);
}

/* Catch Connect Client Messages */

process.on("message", (data) => {
  processCommand(data);
});

function sendResponse(response) {
  log(response);
  //process.send only exists if the app is started as a child process
  if (typeof process.send === 'function') {
    process.send(response);
  }
}

/* Create Device Commands */

function processCommand(command) {
  switch (command) {
    case 'connect\n':
      connect();
      break;
    case 'close\n':
      close();
      break;
    case 'beep\n':
      sendToSocket('action = BEEP\r');
      break;
    case 'pulseIo1\n':
      sendToSocket('action = IO 1 pulse\r');
      break;
    case 'pulseIo2\n':
      sendToSocket('action = IO 2 pulse\r');
      break;
    case 'pulseIo3\n':
      sendToSocket('action = IO 3 pulse\r');
      break;
    case 'pulseIo4\n':
      sendToSocket('action = IO 4 pulse\r');
      break;
    case 'openIo1\n':
      sendToSocket('action = IO 1 open\r');
      break;
    case 'openIo2\n':
      sendToSocket('action = IO 2 open\r');
      break;
    case 'openIo3\n':
      sendToSocket('action = IO 3 open\r');
      break;
    case 'openIo4\n':
      sendToSocket('action = IO 4 open\r');
      break;
    case 'closeIo1\n':
      sendToSocket('action = IO 1 close\r');
      break;
    case 'closeIo2\n':
      sendToSocket('action = IO 2 close\r');
      break;
    case 'closeIo3\n':
      sendToSocket('action = IO 3 close\r');
      break;
    case 'closeIo4\n':
      sendToSocket('action = IO 4 close\r');
      break;
    default:
      sendToSocket(command);
      break;
  }
}

/* Parse Device Responses */

function parseResponse(response) {
  sendResponse(response);
}

/* Socket Functions */

function sendToSocket(message) {
  if (client) {
    log('Sending to socket: ' + message);
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
      const msg = data.toString();
      parseResponse(msg);
      log('Received from socket: ' + msg);
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
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    doNotReconnect = true;
    client.end();
  } else {
    log('Cannot close. Socket undefined. ');
  }
}

/* Socket Event Handlers */

function connectEventHandler() {
  log('Socket connected.');
  sendResponse('catch-service-connected');
  retrying = false;
  client.setKeepAlive(true);
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