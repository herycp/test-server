var fs = require('fs');

var _static = require('node-static');
var file = new _static.Server('./public');
var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

// don't forget to use your own keys!
var options = {
    key: fs.readFileSync('./server.key'),
    cert: fs.readFileSync('./server.crt')
};
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// HTTPs server
var app = require('https').createServer(options, function(request, response) {
    request.addListener('end', function() {
        file.serve(request, response);
    }).resume();
});

var WebSocketServer = require('websocket').server;

new WebSocketServer({
    httpServer: app,
    autoAcceptConnections: false
}).on('request', onRequest);

// shared stuff

var CHANNELS = { };

function onRequest(socket) {
    var origin = socket.origin + socket.resource;

    var websocket = socket.accept(null, origin);

    websocket.on('message', function(message) {
        if (message.type === 'utf8') {
            onMessage(JSON.parse(message.utf8Data), websocket);
        }
    });

    websocket.on('close', function() {
        truncateChannels(websocket);
    });
}

function onMessage(message, websocket) {
    if (message.checkPresence)
        checkPresence(message, websocket);
    else if (message.open)
        onOpen(message, websocket);
    else
        sendMessage(message, websocket);
}

function onOpen(message, websocket) {
    var channel = CHANNELS[message.channel];

    if (channel)
        CHANNELS[message.channel][channel.length] = websocket;
    else
        CHANNELS[message.channel] = [websocket];
}

function sendMessage(message, websocket) {
    message.data = JSON.stringify(message.data);
    var channel = CHANNELS[message.channel];
    if (!channel) {
        console.error('no such channel exists');
        return;
    }

    for (var i = 0; i < channel.length; i++) {
        if (channel[i] && channel[i] != websocket) {
            try {
                channel[i].sendUTF(message.data);
            } catch(e) {
            }
        }
    }
}

function checkPresence(message, websocket) {
    websocket.sendUTF(JSON.stringify({
        isChannelPresent: !!CHANNELS[message.channel]
    }));
}

function swapArray(arr) {
    var swapped = [],
        length = arr.length;
    for (var i = 0; i < length; i++) {
        if (arr[i])
            swapped[swapped.length] = arr[i];
    }
    return swapped;
}

function truncateChannels(websocket) {
    for (var channel in CHANNELS) {
        var _channel = CHANNELS[channel];
        for (var i = 0; i < _channel.length; i++) {
            if (_channel[i] == websocket)
                delete _channel[i];
        }
        CHANNELS[channel] = swapArray(_channel);
        if (CHANNELS && CHANNELS[channel] && !CHANNELS[channel].length)
            delete CHANNELS[channel];
    }
}

app.listen(server_port, server_ip_address, function () {
  console.log( "Listening on " + server_ip_address + ", port " + server_port )
});
