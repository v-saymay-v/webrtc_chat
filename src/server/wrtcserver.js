var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({
	host : '0.0.0.0',
	path : '/webrtc',
	port : 8080
});
var crypto = require('crypto');

function md5_hex(src) {
	var md5 = crypto.createHash('md5');
	md5.update(src, 'utf8');
	return md5.digest('hex');
}

wss.on('connection', function(ws) {
	wss.rooms = wss.rooms || {};

	var getSocket = function(room, id) {
		var connections = wss.rooms[room];
		if (!connections) {
			// TODO: Or error, or customize
			return;
		}
		for (var i = 0; i < connections.length; i++) {
			var socket = connections[i];
			if (id === md5_hex(String(socket.upgradeReq.socket._idleStart))) {
				return socket;
			}
		}
	}

	ws.on('message', function(message) {
		console.log('received: %s', message);
		var json = JSON.parse(message);
		json.data.room = json.data.room ? json.data.room : '';
		switch (json.eventName) {
		case 'join room':
			wss.rooms[json.data.room] = wss.rooms[json.data.room] || [];
			var cmd = {
				eventName: 'new peer connected',
				data: {
					socketId: md5_hex(String(ws.upgradeReq.socket._idleStart))
				}
			};
			for (var i = 0; i < wss.rooms[json.data.room].length; i++) {
				wss.rooms[json.data.room][i].send(JSON.stringify(cmd));
			}
			wss.rooms[json.data.room].push(ws);
console.log(md5_hex(String(ws.upgradeReq.socket._idleStart)) + ' is added');

			// pass array of connection ids except for peer's to peer
			var connectionsId = [];
			for (var i = 0, len = wss.rooms[json.data.room].length; i < len; i++) {
//console.log(wss.rooms[json.data.room][i]);
//				var id = md5_hex(String(wss.rooms[json.data.room][i].upgradeReq.socket._idleStart));
//				if (id !== md5_hex(ws.upgradeReq.socket._idleStart)) {
				if (wss.rooms[json.data.room][i] !== ws) {
					var id = md5_hex(String(wss.rooms[json.data.room][i].upgradeReq.socket._idleStart));
					connectionsId.push(id);
				}
			}
			var cmd = {
				eventName: 'get peers',
				data: {
					connections: connectionsId
				}
			};
			ws.send(JSON.stringify(cmd));
			break;
		case 'receive ice candidate':
			var soc = getSocket(json.data.room, json.data.socketId);
			if (soc) {
				var cmd = {
					eventName: 'receive ice candidate',
					data: {
						index: json.data.index,
						label: json.data.label,
						candidate: json.data.candidate,
						socketId: md5_hex(String(ws.upgradeReq.socket._idleStart))
					}
				};
console.log('receive ice candidate from ' + json.data.socketId + ' to ' + cmd.data.socketId);
				soc.send(JSON.stringify(cmd));
			}
			break;
		case 'send offer':
			var soc = getSocket(json.data.room, json.data.socketId);
			if (soc) {
				var cmd = {
					eventName: 'receive offer',
					data: {
						sdp: json.data.sdp,
						socketId: md5_hex(String(ws.upgradeReq.socket._idleStart))
					}
				};
console.log('send offer ' + json.data.socketId + ' to ' + cmd.data.socketId);
				soc.send(JSON.stringify(cmd));
			}
			break;
		case 'send answer':
			var soc = getSocket(json.data.room, json.data.socketId);
			if (soc) {
				var cmd = {
					eventName: 'receive answer',
					data: {
						sdp: json.data.sdp,
						socketId: md5_hex(String(ws.upgradeReq.socket._idleStart))
					}
				};
console.log('send answer ' + json.data.socketId + ' to ' + cmd.data.socketId);
				soc.send(JSON.stringify(cmd));
			}
			break;
		case 'disconnect':
			for (var i = 0; i < connections.length; i++) {
				if (ws === wss.rooms[json.data.room][i]){
					var id = md5_hex(String(ws.upgradeReq.socket._idleStart));
					connections.splice(i, 1);
					i--;
					var cmd = {
						eventName: 'remove peer connected',
						data: {
							socketId: id
						}
					};
					for (var j = 0; j < wss.rooms[json.data.room].length; j++) {
						wss.rooms[json.data.room][j].send(JSON.stringify(cmd));
					}
				}
			}
			break
		}
	});
});
